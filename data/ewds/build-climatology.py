import glob
import json
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np
import xarray as xr

RAW = Path(__file__).with_name("raw")
OUT = Path(__file__).with_name("climatology")
WINDOW_DAYS = 15

# April 1 - October 31, the season the source files were pulled for. Ordinals
# linearize the season so the window is a plain distance check, and clip
# naturally at the two ends instead of wrapping into a month with no data.
MONTH_LENGTHS = {4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31}
MONTHS = list(MONTH_LENGTHS)
_CUM = {}
_running = 0
for _m in MONTHS:
    _CUM[_m] = _running
    _running += MONTH_LENGTHS[_m]
SEASON_DAYS = _running


def ordinal(month: np.ndarray, day: np.ndarray) -> np.ndarray:
    cum = np.array([_CUM[m] for m in month])
    return cum + day - 1


def load_communes() -> list[dict]:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
    headers = {"apikey": key, "authorization": f"Bearer {key}"}
    communes: list[dict] = []
    offset = 0
    while True:
        req = urllib.request.Request(
            f"{url}/rest/v1/admin_units"
            f"?select=id,lat,lon&level=eq.commune&order=code"
            f"&offset={offset}&limit=1000",
            headers=headers,
        )
        with urllib.request.urlopen(req) as res:
            page = json.load(res)
        communes.extend(page)
        if len(page) < 1000:
            return communes
        offset += 1000


def load_series(communes: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    files = sorted(glob.glob(str(RAW / "fwi-dz-*-apr-oct.nc")))
    if not files:
        sys.exit(f"no climatology source files in {RAW}")
    lats = xr.DataArray([c["lat"] for c in communes], dims="commune")
    lons = xr.DataArray([c["lon"] for c in communes], dims="commune")
    all_fwi: list[np.ndarray] = []
    all_ordinal: list[np.ndarray] = []
    for i, path in enumerate(files, 1):
        ds = xr.open_dataset(path)
        points = ds["fwinx"].sel(latitude=lats, longitude=lons, method="nearest")
        month = points["valid_time"].dt.month.values
        day = points["valid_time"].dt.day.values
        all_fwi.append(points.values)
        all_ordinal.append(ordinal(month, day))
        ds.close()
        print(f"{i}/{len(files)} {Path(path).name}", flush=True)
    return np.concatenate(all_fwi, axis=0), np.concatenate(all_ordinal)


def main() -> None:
    communes = load_communes()
    print(f"{len(communes)} communes")
    fwi, sample_ordinal = load_series(communes)
    print(f"series shape {fwi.shape}")

    OUT.mkdir(exist_ok=True)
    percentiles = list(range(101))
    target_ordinals = np.arange(SEASON_DAYS)
    target_days = [
        (m, d) for m in MONTHS for d in range(1, MONTH_LENGTHS[m] + 1)
    ]
    assert len(target_days) == SEASON_DAYS

    for ci, commune in enumerate(communes):
        out_path = OUT / f"{commune['id']}.json"
        if out_path.exists():
            continue
        entries = []
        for target, (m, d) in zip(target_ordinals, target_days):
            in_window = np.abs(sample_ordinal - target) <= WINDOW_DAYS
            sample = fwi[in_window, ci]
            sample = sample[~np.isnan(sample)]
            if sample.size == 0:
                continue
            breakpoints = np.percentile(sample, percentiles).tolist()
            entries.append({"month": m, "day": d, "breakpoints": breakpoints})
        tmp_path = out_path.with_suffix(".json.part")
        tmp_path.write_text(json.dumps({"commune_id": commune["id"], "days": entries}))
        tmp_path.rename(out_path)
        if ci % 100 == 0:
            print(f"{ci}/{len(communes)} communes written", flush=True)
    print("done")


if __name__ == "__main__":
    main()
