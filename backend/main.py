import os
import numpy as np
import xarray as xr
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SIH26067 - Ocean Engine API")

# Enable CORS so browser requests from localhost:3000 succeed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Robust path detection for sample_data.nc
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
possible_paths = [
    os.path.join(BASE_DIR, "data", "sample_data.nc"),
    os.path.join(BASE_DIR, "sample_data.nc"),
    os.path.join(BASE_DIR, "ocean_data.nc")
]

ds = None
for path in possible_paths:
    if os.path.exists(path):
        try:
            ds = xr.open_dataset(path)
            print(f"SUCCESS: Loaded dataset from: {path}")
            break
        except Exception as e:
            print(f"Failed loading {path}: {e}")

if ds is None:
    print("WARNING: NetCDF file not found. Fallback values will be used.")

# Detect coordinate and variable names safely
def get_coords():
    if ds is None:
        return "depth", "latitude", "longitude", "thetao"
    d_name = next((c for c in ["depth", "deptht", "lev", "level"] if c in ds.coords), "depth")
    lat_name = next((c for c in ["latitude", "lat", "nav_lat"] if c in ds.coords), "latitude")
    lon_name = next((c for c in ["longitude", "lon", "nav_lon"] if c in ds.coords), "longitude")
    var_name = next((v for v in ["thetao", "temperature", "temp", "votemper"] if v in ds.data_vars), list(ds.data_vars.keys())[0] if len(ds.data_vars) > 0 else "thetao")
    return d_name, lat_name, lon_name, var_name

DEPTH_VAR, LAT_VAR, LON_VAR, TEMP_VAR = get_coords()


@app.get("/")
def root():
    return {"message": "Ocean Digital Twin API is active. Go to /docs for endpoints."}


@app.get("/api/depths")
def get_depth_levels():
    """Returns actual depth levels from the dataset."""
    if ds is not None and DEPTH_VAR in ds.coords:
        return {"depths": [round(float(d), 1) for d in ds[DEPTH_VAR].values]}
    return {"depths": [0, 10, 20, 30, 50, 75, 100]}


@app.get("/api/validate-profile")
def validate_profile(lat: float = Query(15.2), lon: float = Query(72.4)):
    """Extracts real vertical temperature column and compares with simulated Argo observation."""
    if ds is not None and TEMP_VAR in ds.data_vars:
        column = ds[TEMP_VAR].sel({LAT_VAR: lat, LON_VAR: lon}, method="nearest")
        if "time" in column.dims:
            column = column.isel(time=0)

        depths = [round(float(d), 1) for d in column[DEPTH_VAR].values]
        raw_vals = column.values
        model_vals = [round(float(v), 2) if np.isfinite(v) else 22.0 for v in raw_vals]
    else:
        depths = [0, 10, 20, 30, 50, 75, 100]
        model_vals = [29.1, 28.8, 28.2, 27.4, 25.1, 23.0, 21.2]

    # Generate Argo sensor reading with instrument drift (±0.35°C)
    np.random.seed(int(abs(lat * 100)))
    argo_vals = [round(float(v + np.random.uniform(-0.35, 0.35)), 2) for v in model_vals]

    differences = [round(a - m, 2) for a, m in zip(argo_vals, model_vals)]
    rmse = round(float(np.sqrt(np.mean(np.square(differences)))), 3)
    bias = round(float(np.mean(differences)), 3)

    return {
        "unit": "°C",
        "depths": depths,
        "model_values": model_vals,
        "observed_values": argo_vals,
        "differences": differences,
        "statistics": {
            "mean_bias": bias,
            "rmse": rmse,
            "accuracy_score": f"{max(0, 100 - (rmse * 15)):.1f}%"
        }
    }