import concurrent.futures as cf, pathlib, sys, time
import cdsapi

RAW = pathlib.Path(__file__).with_name("raw")
YEARS = range(int(sys.argv[1]) if len(sys.argv) > 1 else 1940, int(sys.argv[2]) if len(sys.argv) > 2 else 2026)
DAYS = [f"{d:02d}" for d in range(1, 32)]


def pull(year: int) -> str:
    out = RAW / f"fwi-dz-{year}-jas.nc"
    if out.exists() and out.stat().st_size > 0:
        return f"{year} skip"
    tmp = out.with_suffix(".nc.part")
    client = cdsapi.Client(url="https://ewds.climate.copernicus.eu/api", quiet=True)
    for attempt in range(3):
        try:
            client.retrieve(
                "cems-fire-historical-v1",
                {
                    "product_type": "reanalysis",
                    "variable": ["fire_weather_index"],
                    "dataset_type": "consolidated_dataset",
                    "system_version": "4_1",
                    "year": str(year),
                    "month": ["07", "08", "09"],
                    "day": DAYS,
                    "grid": "0.25/0.25",
                    "area": [38, -9, 18, 12],
                    "data_format": "netcdf",
                },
                str(tmp),
            )
            tmp.rename(out)
            return f"{year} ok {out.stat().st_size}"
        except Exception as e:
            if attempt == 2:
                return f"{year} FAIL {str(e)[:120]}"
            time.sleep(60)


RAW.mkdir(parents=True, exist_ok=True)
with cf.ThreadPoolExecutor(max_workers=3) as pool:
    for line in pool.map(pull, YEARS):
        print(time.strftime("%H:%M:%S"), line, flush=True)
