from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from pathlib import Path
import requests
from datetime import datetime, timedelta, timezone


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_FILE)

ARGO_API_KEY = os.getenv("ARGO_API_KEY")


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(title="Ocean 3D Digital World API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():
    return {
        "status": "success",
        "message": "Ocean 3D Digital World Backend is running"
    }


# =========================================================
# TEST ARGO API KEY
# =========================================================

@app.get("/api/test-argo-key")
def test_argo_key():

    if ARGO_API_KEY:
        return {
            "status": "success",
            "message": "Argo API key loaded successfully"
        }

    return {
        "status": "error",
        "message": "Argo API key not found"
    }


# =========================================================
# GET ARGO FLOATS
# =========================================================

@app.get("/api/argo-floats")
def get_argo_floats():

    # Check API key
    if not ARGO_API_KEY:
        return {
            "status": "error",
            "message": "Argo API key not found"
        }

    # -----------------------------------------------------
    # TIME RANGE
    # -----------------------------------------------------

    end_time = datetime.now(timezone.utc)

    # Start with only 7 days of data
    # This keeps the first API request small.
    start_time = end_time - timedelta(days=7)


    # -----------------------------------------------------
    # REGION
    # -----------------------------------------------------
    # Arabian Sea test region
    #
    # Longitude: 55E -> 75E
    # Latitude :  0N -> 25N
    #
    # Polygon format:
    # [longitude, latitude]
    #
    # Last point must equal first point.
    # -----------------------------------------------------

    polygon = "[[55,0],[75,0],[75,25],[55,25],[55,0]]"


    # -----------------------------------------------------
    # ARGO API PARAMETERS
    # -----------------------------------------------------

    params = {
        "polygon": polygon,
        "startDate": start_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "endDate": end_time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    }


    # -----------------------------------------------------
    # API AUTHENTICATION
    # -----------------------------------------------------

    headers = {
        "x-argokey": ARGO_API_KEY
    }


    # -----------------------------------------------------
    # REQUEST ARGO DATA
    # -----------------------------------------------------

    try:

        response = requests.get(
            "https://argovis-api.colorado.edu/argo",
            params=params,
            headers=headers,
            timeout=30
        )

        # Raise an error for HTTP 400, 401, 404, 500, etc.
        response.raise_for_status()

        # Convert JSON response into Python object
        data = response.json()


        # -------------------------------------------------
        # PROCESS FLOAT DATA
        # -------------------------------------------------

        floats = []

        # Make sure the response is a list
        if not isinstance(data, list):

            return {
                "status": "error",
                "message": "Unexpected response format from Argo API",
                "response_type": str(type(data))
            }


        for profile in data:

            # ---------------------------------------------
            # Get location
            # ---------------------------------------------

            geolocation = profile.get("geolocation", {})

            coordinates = geolocation.get(
                "coordinates",
                []
            )

            if not coordinates or len(coordinates) < 2:
                continue


            # Argovis coordinates are:
            # [longitude, latitude]

            longitude = coordinates[0]
            latitude = coordinates[1]


            # ---------------------------------------------
            # Get float/platform ID
            # ---------------------------------------------

            platform_id = profile.get(
                "platform_id",
                profile.get(
                    "platform_number",
                    "unknown"
                )
            )


            # ---------------------------------------------
            # Create frontend-friendly object
            # ---------------------------------------------

            float_data = {
                "id": str(platform_id),
                "lat": latitude,
                "lon": longitude,
                "time": profile.get("timestamp"),
                "cycle_number": profile.get("cycle_number")
            }

            floats.append(float_data)


        # -------------------------------------------------
        # REMOVE DUPLICATE FLOAT LOCATIONS
        # -------------------------------------------------

        unique_floats = {}

        for float_data in floats:

            float_id = float_data["id"]

            unique_floats[float_id] = float_data


        floats = list(unique_floats.values())


        # -------------------------------------------------
        # RETURN DATA TO FRONTEND
        # -------------------------------------------------

        return {
            "status": "success",
            "count": len(floats),
            "floats": floats
        }


    # =====================================================
    # HANDLE HTTP/API ERRORS
    # =====================================================

    except requests.exceptions.HTTPError as e:

        return {
            "status": "error",
            "message": "Argo API returned an HTTP error",
            "error": str(e),
            "status_code": response.status_code,
            "response": response.text[:1000]
        }


    # =====================================================
    # HANDLE CONNECTION ERRORS
    # =====================================================

    except requests.exceptions.RequestException as e:

        return {
            "status": "error",
            "message": "Could not connect to Argo API",
            "error": str(e)
        }


    # =====================================================
    # HANDLE OTHER ERRORS
    # =====================================================

    except Exception as e:

        return {
            "status": "error",
            "message": "Error processing Argo data",
            "error": str(e)
        }