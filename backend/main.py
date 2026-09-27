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

            platform_id = profile.get("_id", "unknown")


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
    # =========================================================
# GET REAL ARGO PROFILE
# =========================================================

@app.get("/api/argo-profile")
# =========================================================
# GET REAL ARGO PROFILE DATA
# =========================================================

@app.get("/api/argo-profile")
def get_argo_profile(platform_number: str):

    if not ARGO_API_KEY:
        return {
            "status": "error",
            "message": "Argo API key not found"
        }

    profile_id = platform_number

    headers = {
        "x-argokey": ARGO_API_KEY
    }

    # -----------------------------------------------------
    # Request actual measurements
    # -----------------------------------------------------

    params = {
        "id": profile_id,
        "data": (
            "pressure,"
            "temperature,"
            "salinity,"
            "pressure_argoqc,"
            "temperature_argoqc,"
            "salinity_argoqc"
        )
    }

    try:

        response = requests.get(
            "https://argovis-api.colorado.edu/argo",
            params=params,
            headers=headers,
            timeout=30
        )

        response.raise_for_status()

        data = response.json()

        # -------------------------------------------------
        # Check response
        # -------------------------------------------------

        if not isinstance(data, list) or len(data) == 0:

            return {
                "status": "error",
                "message": "No Argo profile found",
                "profile_id": profile_id
            }

        profile = data[0]

        # -------------------------------------------------
        # BASIC PROFILE INFORMATION
        # -------------------------------------------------

        timestamp = profile.get("timestamp")

        geolocation = profile.get(
            "geolocation",
            {}
        )

        coordinates = geolocation.get(
            "coordinates",
            []
        )

        longitude = None
        latitude = None

        if len(coordinates) >= 2:
            longitude = coordinates[0]
            latitude = coordinates[1]

        cycle_number = profile.get("cycle_number")

        # -------------------------------------------------
        # FIND VARIABLE POSITIONS
        # -------------------------------------------------

        data_info = profile.get("data_info", [])

        if len(data_info) == 0:

            return {
                "status": "error",
                "message": "Argo profile does not contain data_info",
                "profile_id": profile_id
            }

        variable_names = data_info[0]

        measurements = profile.get("data", [])

        # -------------------------------------------------
        # HELPER FUNCTION
        # -------------------------------------------------

        def get_variable(variable_name):

            if variable_name not in variable_names:
                return []

            index = variable_names.index(variable_name)

            if index >= len(measurements):
                return []

            return measurements[index]

        # -------------------------------------------------
        # GET MEASUREMENTS
        # -------------------------------------------------

        pressures = get_variable("pressure")

        temperatures = get_variable("temperature")

        salinities = get_variable("salinity")

        pressure_qc = get_variable("pressure_argoqc")

        temperature_qc = get_variable(
            "temperature_argoqc"
        )

        salinity_qc = get_variable(
            "salinity_argoqc"
        )

        # -------------------------------------------------
        # MAKE SURE ARRAYS EXIST
        # -------------------------------------------------

        if not pressures or not temperatures:

            return {
                "status": "error",
                "message": "Temperature or pressure data not available",
                "profile_id": profile_id
            }

        # -------------------------------------------------
        # BUILD CLEAN PROFILE
        # -------------------------------------------------

        profile_data = []

        for i in range(len(pressures)):

            pressure = pressures[i] if i < len(pressures) else None

            temperature = (
                temperatures[i]
                if i < len(temperatures)
                else None
            )

            salinity = (
                salinities[i]
                if i < len(salinities)
                else None
            )

            temp_qc = (
                temperature_qc[i]
                if i < len(temperature_qc)
                else None
            )

            salinity_qc_value = (
                salinity_qc[i]
                if i < len(salinity_qc)
                else None
            )

            # Ignore levels without pressure
            if pressure is None:
                continue

            profile_data.append({
                "depth": pressure,
                "temperature": temperature,
                "salinity": salinity,
                "temperature_qc": temp_qc,
                "salinity_qc": salinity_qc_value
            })

        # -------------------------------------------------
        # ARRAYS FOR FRONTEND
        # -------------------------------------------------

        depths = [
            point["depth"]
            for point in profile_data
        ]

        observed_temperatures = [
            point["temperature"]
            for point in profile_data
        ]

        observed_salinity = [
            point["salinity"]
            for point in profile_data
        ]

        # -------------------------------------------------
        # RETURN RESULT
        # -------------------------------------------------

        return {

            "status": "success",

            "profile_id": profile_id,

            "latitude": latitude,

            "longitude": longitude,

            "cycle_number": cycle_number,

            "profile_time": timestamp,

            "unit": "°C",

            "depths": depths,

            "observed_values": observed_temperatures,

            "temperatures": observed_temperatures,

            "salinity": observed_salinity,

            "profile_data": profile_data,

            "message": "Real Argo temperature, pressure and salinity data retrieved successfully"
        }

    # =====================================================
    # HTTP ERROR
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
    # CONNECTION ERROR
    # =====================================================

    except requests.exceptions.RequestException as e:

        return {
            "status": "error",
            "message": "Could not connect to Argo API",
            "error": str(e)
        }

    # =====================================================
    # OTHER ERROR
    # =====================================================

    except Exception as e:

        return {
            "status": "error",
            "message": "Error processing Argo profile",
            "error": str(e)
        }