#!/usr/bin/env python3
"""
EUMETSAT MTG FCI & MSG Active Fire NetCDF Decoder for Nadhir (نذير).

Fetches geostationary NetCDF active fire granules from the EUMETSAT Data Store API,
extracts real-time active fire pixels within Algeria's bounding box, and pushes them
directly to Nadhir's ingestion API to achieve sub-10-minute early warning latency.
"""

import os
import sys
import tempfile
import time
import base64
import requests
from datetime import datetime, timezone
import numpy as np

try:
    import netCDF4
except ImportError:
    netCDF4 = None

try:
    import xarray as xr
except ImportError:
    xr = None

TOKEN_URL = "https://api.eumetsat.int/token"
SEARCH_URL = "https://api.eumetsat.int/data/search-products/os"
DOWNLOAD_URL = "https://api.eumetsat.int/data/download/v1/collections/{collection}/products/{product_id}"

# Algeria spatial extent
BBOX = {
    "west": -8.7,
    "south": 18.9,
    "east": 12.0,
    "north": 37.5,
}

COLLECTIONS = [
    {"id": "EO:EUM:DAT:0665", "sensor": "FCI"},
    {"id": "EO:EUM:DAT:MSG:FRP-GRID", "sensor": "SEVIRI"},
]

def get_token(key: str, secret: str) -> str:
    auth_bytes = f"{key}:{secret}".encode("utf-8")
    headers = {
        "Authorization": f"Basic {base64.b64encode(auth_bytes).decode('utf-8')}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    resp = requests.post(TOKEN_URL, headers=headers, data="grant_type=client_credentials", timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]

def search_latest_granule(token: str, collection_id: str):
    params = {
        "format": "json",
        "pi": collection_id,
        "si": "0",
        "c": "1",
        "bbox": f"{BBOX['west']},{BBOX['south']},{BBOX['east']},{BBOX['north']}",
        "sort": "start,time,0",
    }
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(SEARCH_URL, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    features = data.get("features", [])
    if not features:
        return None
    return features[0]

def download_granule(token: str, collection_id: str, product_id: str, dest_path: str):
    url = DOWNLOAD_URL.format(collection=collection_id, product_id=product_id)
    headers = {"Authorization": f"Bearer {token}"}
    with requests.get(url, headers=headers, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)

def extract_fire_pixels(nc_path: str, sensor: str):
    """
    Decodes active fire variables from the NetCDF granule.
    Returns list of dicts: lat, lon, detected_at, confidence_raw, frp_mw.
    """
    detections = []
    now_iso = datetime.now(timezone.utc).isoformat()

    if netCDF4 is None and xr is None:
        raise RuntimeError("netCDF4 or xarray must be installed to decode granules")

    with netCDF4.Dataset(nc_path, "r") as ds:
        # Check standard EUMETSAT active fire variables
        # Variables differ slightly across MTG FCI AFIR and MSG FRP
        lat_var = ds.variables.get("lat") or ds.variables.get("latitude")
        lon_var = ds.variables.get("lon") or ds.variables.get("longitude")
        frp_var = ds.variables.get("FRP") or ds.variables.get("fire_power") or ds.variables.get("frp_mw")
        conf_var = ds.variables.get("fire_confidence") or ds.variables.get("confidence") or ds.variables.get("quality_flag")

        if lat_var is not None and lon_var is not None:
            lats = np.array(lat_var[:])
            lons = np.array(lon_var[:])
            frp = np.array(frp_var[:]) if frp_var is not None else np.zeros_like(lats)
            conf = np.array(conf_var[:]) if conf_var is not None else np.full_like(lats, 0.8)

            # 1D or 2D coordinate handling
            if lats.ndim == 1 and frp.ndim == 2:
                lon_grid, lat_grid = np.meshgrid(lons, lats)
            else:
                lat_grid, lon_grid = lats, lons

            # Filter valid fire pixels within Algeria bbox
            mask = (
                (lat_grid >= BBOX["south"]) & (lat_grid <= BBOX["north"]) &
                (lon_grid >= BBOX["west"]) & (lon_grid <= BBOX["east"]) &
                (frp > 0.0)
            )

            idx = np.where(mask)
            for r, c in zip(idx[0], idx[1]) if lat_grid.ndim == 2 else zip(idx[0], idx[0]):
                d_lat = float(lat_grid[r, c] if lat_grid.ndim == 2 else lat_grid[r])
                d_lon = float(lon_grid[r, c] if lon_grid.ndim == 2 else lon_grid[r])
                d_frp = float(frp[r, c] if frp.ndim == 2 else frp[r])
                d_conf = float(conf[r, c] if conf.ndim == 2 else conf[r]) / (100.0 if np.max(conf) > 1 else 1.0)

                detections.append({
                    "lat": round(d_lat, 5),
                    "lon": round(d_lon, 5),
                    "detected_at": now_iso,
                    "confidence_raw": min(1.0, max(0.2, d_conf)),
                    "frp_mw": round(d_frp, 2),
                })

    return detections

def main():
    consumer_key = os.getenv("EUMETSAT_CONSUMER_KEY")
    consumer_secret = os.getenv("EUMETSAT_CONSUMER_SECRET")
    app_url = os.getenv("NADHIR_APP_URL", "https://nadhir.app").rstrip("/")
    cron_secret = os.getenv("NADHIR_CRON_SECRET")

    if not consumer_key or not consumer_secret:
        print("[fci-worker] Error: EUMETSAT credentials missing.", file=sys.stderr)
        sys.exit(1)

    print("[fci-worker] Authenticating with EUMETSAT...")
    token = get_token(consumer_key, consumer_secret)

    all_detections = []
    detected_sensor = "FCI"

    for col in COLLECTIONS:
        try:
            print(f"[fci-worker] Searching latest granule for {col['sensor']} ({col['id']})...")
            feature = search_latest_granule(token, col["id"])
            if not feature:
                continue

            product_id = feature.get("id") or feature.get("properties", {}).get("title")
            if not product_id:
                continue

            print(f"[fci-worker] Found granule: {product_id}. Downloading...")
            with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
                download_granule(token, col["id"], product_id, tmp.name)
                tmp_path = tmp.name

            try:
                print("[fci-worker] Decoding active fire pixels...")
                dets = extract_fire_pixels(tmp_path, col["sensor"])
                print(f"[fci-worker] Extracted {len(dets)} active fire detections in Algeria.")
                if dets:
                    all_detections.extend(dets)
                    detected_sensor = col["sensor"]
                    break
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        except Exception as e:
            print(f"[fci-worker] Collection {col['id']} error: {e}", file=sys.stderr)
            continue

    if not cron_secret:
        print("[fci-worker] Warning: NADHIR_CRON_SECRET unset. Skipping API push.")
        print(f"[fci-worker] Results: {len(all_detections)} detections found.")
        return

    print(f"[fci-worker] Posting {len(all_detections)} detections to {app_url}/api/public/cron/fci...")
    headers = {
        "Authorization": f"Bearer {cron_secret}",
        "Content-Type": "application/json",
    }
    payload = {
        "sensor": detected_sensor,
        "detections": all_detections,
    }

    resp = requests.post(f"{app_url}/api/public/cron/fci", headers=headers, json=payload, timeout=60)
    print(f"[fci-worker] Server response ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    print("[fci-worker] Finished successfully.")

if __name__ == "__main__":
    main()
