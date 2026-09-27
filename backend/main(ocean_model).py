from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import xarray as xr
import os

app = FastAPI(title="Bay of Bengal Ocean Model API")

# Allow your frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to the combined Ocean Model dataset
DATA_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "ocean_model_bayofbengal.nc"
)

# Load dataset
ocean_model = xr.open_dataset(DATA_PATH)

print("Ocean Model loaded successfully")
print(ocean_model)


@app.get("/")
def home():
    return {
        "message": "Bay of Bengal Ocean Model API is running"
    }


@app.get("/api/ocean-model")
def get_ocean_model(
    latitude: float,
    longitude: float,
    date: str
):
    profile = ocean_model.sel(
        latitude=latitude,
        longitude=longitude,
        time=date,
        method="nearest"
    )

    result = []

    for i in range(len(profile.depth)):
        result.append({
            "depth": float(profile.depth.values[i]),
            "temperature": float(profile.thetao.values[i]),
            "salinity": float(profile.so.values[i]),
            "u_current": float(profile.uo.values[i]),
            "v_current": float(profile.vo.values[i])
        })

    return {
        "location": {
            "latitude": float(profile.latitude.values),
            "longitude": float(profile.longitude.values)
        },
        "date": str(profile.time.values)[:10],
        "profiles": result
    }