#main.py
import os
import numpy as np
import xarray as xr
from connectors.argo import fetch_argo_region
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import gsw
from connectors.argo import fetch_argo_region

app = FastAPI(
    title="SIH26067 - Ocean Digital World API",
    description="Backend API for real ocean model data visualization",
    version="1.0"
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# DATASET PATH
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "data",
    "copernicus",
    "arabian_sea_temperature_(3).nc"
)


# --------------------------------------------------
# LOAD COPERNICUS DATA
# --------------------------------------------------

ds = None

if os.path.exists(MODEL_PATH):

    try:
        ds = xr.open_dataset(MODEL_PATH)

        print("\n========================================")
        print("COPERNICUS DATASET LOADED")
        print("========================================")
        print(f"File: {MODEL_PATH}")
        print(ds)

    except Exception as e:
        print(f"ERROR loading Copernicus dataset: {e}")

else:

    print("\nERROR: Copernicus NetCDF file not found.")
    print(f"Expected path: {MODEL_PATH}")


# --------------------------------------------------
# ROOT
# --------------------------------------------------

@app.get("/")
def root():

    return {
        "message": "Ocean Digital World API is active",
        "dataset": "Copernicus Ocean Physics",
        "status": "ready"
    }


# --------------------------------------------------
# DATASET INFORMATION
# --------------------------------------------------

@app.get("/api/info")
def dataset_info():

    if ds is None:

        return {
            "status": "error",
            "message": "Copernicus dataset not loaded"
        }

    return {

        "status": "success",

        "variables": list(ds.data_vars),

        "coordinates": list(ds.coords),

        "dimensions": {
            name: int(size)
            for name, size in ds.sizes.items()
        }
    }


# --------------------------------------------------
# DEPTH LEVELS
# --------------------------------------------------

@app.get("/api/depths")
def get_depth_levels():

    if ds is None:
        return {"depths": []}

    if "depth" not in ds.coords:
        return {"depths": []}

    depths = [
        round(float(depth), 2)
        for depth in ds["depth"].values
    ]

    return {
        "depths": depths
    }


# --------------------------------------------------
# TIME VALUES
# --------------------------------------------------

@app.get("/api/times")
def get_times():

    if ds is None:
        return {"times": []}

    if "time" not in ds.coords:
        return {"times": []}

    times = [
        str(time)
        for time in ds["time"].values
    ]

    return {
        "times": times
    }


# --------------------------------------------------
# TEMPERATURE DATA
# --------------------------------------------------
@app.get("/api/argo-floats")
def get_argo_floats():
    try:
        argo_ds = fetch_argo_region(
            min_lon=65,
            max_lon=75,
            min_lat=10,
            max_lat=20,
            min_depth=0,
            max_depth=100,
            start_date="2026-05-01",
            end_date="2026-07-01"
        )

        # Keep only good position observations
        if "POSITION_QC" in argo_ds:
            argo_ds = argo_ds.where(
                argo_ds["POSITION_QC"].isin([1, 2]),
                drop=True
            )

        floats = {}

        for i in range(argo_ds.sizes["N_POINTS"]):
            platform = str(
                int(argo_ds["PLATFORM_NUMBER"].values[i])
            )

            lat = float(argo_ds["LATITUDE"].values[i])
            lon = float(argo_ds["LONGITUDE"].values[i])
            time = str(argo_ds["TIME"].values[i])

            # One marker per float.
            # Keep its latest observation in the dataset.
            floats[platform] = {
                "id": platform,
                "name": f"Argo Float #{platform}",
                "lat": lat,
                "lon": lon,
                "time": time
            }

        argo_ds.close()

        result = list(floats.values())

        print(f"Returning {len(result)} real Argo floats")

        return {
            "status": "success",
            "count": len(result),
            "floats": result
        }

    except Exception as e:
        print(f"ARGO API ERROR: {e}")

        return {
            "status": "error",
            "message": str(e),
            "floats": []
        }

@app.get("/api/argo-profile")
def get_argo_profile(platform_number: int = Query(...)):
    try:
        print("\n========================================")
        print("ARGO PROFILE REQUEST")
        print("========================================")
        print(f"Float ID: {platform_number}")

        if ds is None:
            return {
                "status": "error",
                "message": "Copernicus dataset is not loaded"
            }

        argo_ds = fetch_argo_region(
            min_lon=65,
            max_lon=75,
            min_lat=10,
            max_lat=20,
            min_depth=0,
            max_depth=100,
            start_date="2026-05-01",
            end_date="2026-07-01"
        )

        platform_values = argo_ds["PLATFORM_NUMBER"].values
        mask = np.array([
            str(int(float(x))) == str(platform_number)
            for x in platform_values
        ])
        indices = np.where(mask)[0]

        if len(indices) == 0:
            argo_ds.close()
            return {
                "status": "error",
                "message": f"Argo float {platform_number} not found"
            }

        float_ds = argo_ds.isel(N_POINTS=indices)
        times = np.asarray(float_ds["TIME"].values)
        latest_time = np.max(times)
        latest_indices = np.where(times == latest_time)[0]
        float_ds = float_ds.isel(N_POINTS=latest_indices)

        print(f"Latest profile time: {latest_time}")
        print(f"Profile observations: {float_ds.sizes.get('N_POINTS', 0)}")

        model_depth_min = float(ds["depth"].min())
        model_depth_max = float(ds["depth"].max())

        depths = []
        observed_values = []
        model_values = []
        differences = []
        argo_times = []
        copernicus_times = []
        copernicus_latitudes = []
        copernicus_longitudes = []
        copernicus_depths = []
        depth_differences = []

        for i in range(float_ds.sizes["N_POINTS"]):
            pressure = float(float_ds["PRES"].values[i])
            temperature = float(float_ds["TEMP"].values[i])
            argo_lat = float(float_ds["LATITUDE"].values[i])
            argo_lon = float(float_ds["LONGITUDE"].values[i])
            argo_time = str(float_ds["TIME"].values[i])

            if not np.isfinite(pressure):
                continue
            if not np.isfinite(temperature):
                continue
            if not np.isfinite(argo_lat) or not np.isfinite(argo_lon):
                continue

            try:
                argo_depth = float(-gsw.z_from_p(pressure, argo_lat))
            except Exception:
                continue

            if not np.isfinite(argo_depth):
                continue

            if argo_depth < model_depth_min or argo_depth > model_depth_max:
                continue

            try:
                model_time = ds["time"].sel(time=np.datetime64(argo_time), method="nearest").values
                model_time_value = str(model_time)
                time_slice = ds["thetao"].sel(time=model_time_value, method="nearest")

                model_lat = float(
                    time_slice["latitude"].sel(latitude=argo_lat, method="nearest").values
                )
                model_lon = float(
                    time_slice["longitude"].sel(longitude=argo_lon, method="nearest").values
                )

                point_slice = time_slice.sel(
                    latitude=model_lat,
                    longitude=model_lon,
                    method="nearest"
                )

                model_temp = point_slice.sel(depth=argo_depth, method="nearest").values
                model_depth = float(point_slice["depth"].sel(depth=argo_depth, method="nearest").values)

                if not np.isfinite(model_temp):
                    continue

                model_temp_float = float(model_temp)
                diff = temperature - model_temp_float
            except Exception:
                continue

            depths.append(round(argo_depth, 2))
            observed_values.append(round(temperature, 3))
            model_values.append(round(model_temp_float, 3))
            differences.append(round(diff, 3))
            argo_times.append(argo_time)
            copernicus_times.append(model_time_value)
            copernicus_latitudes.append(round(model_lat, 4))
            copernicus_longitudes.append(round(model_lon, 4))
            copernicus_depths.append(round(model_depth, 4))
            depth_differences.append(round(argo_depth - model_depth, 4))

        argo_ds.close()

        print(f"Successful Copernicus matches: {len(depths)}")
        if depths:
            print(f"Copernicus time used: {copernicus_times[0]}")
            print(f"Example Argo temperature: {observed_values[0]}")
            print(f"Example model temperature: {model_values[0]}")
            print(f"Example difference: {differences[0]}")

        if not depths:
            return {
                "status": "success",
                "platform_number": str(platform_number),
                "profile_time": str(latest_time),
                "unit": "°C",
                "count": 0,
                "depths": [],
                "temperatures": [],
                "observed_values": [],
                "model_values": [],
                "differences": [],
                "times": [],
                "argo_times": [],
                "copernicus_times": [],
                "copernicus_latitudes": [],
                "copernicus_longitudes": [],
                "copernicus_depths": [],
                "depth_differences": []
            }

        return {
            "status": "success",
            "platform_number": str(platform_number),
            "profile_time": str(latest_time),
            "unit": "°C",
            "count": len(depths),
            "depths": depths,
            "temperatures": observed_values,
            "times": argo_times,
            "observed_values": observed_values,
            "model_values": model_values,
            "differences": differences,
            "argo_times": argo_times,
            "copernicus_times": copernicus_times,
            "copernicus_latitudes": copernicus_latitudes,
            "copernicus_longitudes": copernicus_longitudes,
            "copernicus_depths": copernicus_depths,
            "depth_differences": depth_differences
        }

    except Exception as e:
        print("\nARGO PROFILE ERROR:")
        print(str(e))
        return {
            "status": "error",
            "message": str(e)
        }
@app.get("/api/temperature")
def get_temperature(

    depth: float = Query(5.0),

    time: str | None = Query(None)

):

    if ds is None:

        return {
            "status": "error",
            "message": "Copernicus dataset not loaded"
        }


    temperature = ds["thetao"]


    # Select time

    if time is None:

        selected = temperature.isel(time=0)

    else:

        try:

            selected = temperature.sel(
                time=time,
                method="nearest"
            )

        except Exception as e:

            return {
                "status": "error",
                "message": f"Invalid time: {e}"
            }


    # Select depth

    try:

        selected = selected.sel(
            depth=depth,
            method="nearest"
        )

    except Exception as e:

        return {
            "status": "error",
            "message": f"Invalid depth: {e}"
        }


    # Actual selected coordinates

    actual_depth = float(
        selected["depth"].values
    )

    actual_time = str(
        selected["time"].values
    )


    latitudes = selected["latitude"].values

    longitudes = selected["longitude"].values

    values = selected.values


    # Convert grid into JSON

    data = []


    for i, latitude in enumerate(latitudes):

        for j, longitude in enumerate(longitudes):

            value = values[i, j]

            if np.isfinite(value):

                data.append({

                    "lat": round(
                        float(latitude),
                        4
                    ),

                    "lon": round(
                        float(longitude),
                        4
                    ),

                    "depth": round(
                        actual_depth,
                        2
                    ),

                    "value": round(
                        float(value),
                        3
                    )
                })


    return {

        "status": "success",

        "variable": "temperature",

        "unit": "°C",

        "depth": round(
            actual_depth,
            2
        ),

        "time": actual_time,

        "count": len(data),

        "data": data
    }


# --------------------------------------------------
# TEMPERATURE AT ONE POINT
# --------------------------------------------------

@app.get("/api/temperature/point")
def get_temperature_point(

    lat: float = Query(15.0),

    lon: float = Query(72.0),

    depth: float = Query(5.0),

    time: str | None = Query(None)

):

    if ds is None:

        return {

            "status": "error",

            "message": "Copernicus dataset not loaded"
        }


    temperature = ds["thetao"]


    try:

        # Select time

        if time is None:

            point = temperature.isel(time=0)

        else:

            point = temperature.sel(
                time=time,
                method="nearest"
            )


        # Select nearest point

        point = point.sel(

            latitude=lat,

            longitude=lon,

            depth=depth,

            method="nearest"
        )


        value = float(point.values)


        return {

            "status": "success",

            "variable": "temperature",

            "unit": "°C",


            "requested": {

                "lat": lat,

                "lon": lon,

                "depth": depth,

                "time": time
            },


            "actual": {

                "lat": float(
                    point["latitude"].values
                ),

                "lon": float(
                    point["longitude"].values
                ),

                "depth": float(
                    point["depth"].values
                ),

                "time": str(
                    point["time"].values
                )
            },


            "value": round(
                value,
                3
            )
        }


    except Exception as e:

        return {

            "status": "error",

            "message": str(e)
        }


# --------------------------------------------------
# CLOSE DATASET
# --------------------------------------------------

@app.on_event("shutdown")
def shutdown():

    global ds

    if ds is not None:

        ds.close()

        print(
            "Copernicus dataset closed."
        )