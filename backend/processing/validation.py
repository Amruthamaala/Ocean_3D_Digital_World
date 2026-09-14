import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import csv
import numpy as np
import xarray as xr
import gsw

from connectors.argo import fetch_argo_region
from processing.qc import apply_argo_qc


# ============================================================
# METRICS
# ============================================================

def calculate_rmse(observed, predicted):
    observed = np.array(observed)
    predicted = np.array(predicted)

    return float(
        np.sqrt(np.mean((predicted - observed) ** 2))
    )


def calculate_mae(observed, predicted):
    observed = np.array(observed)
    predicted = np.array(predicted)

    return float(
        np.mean(np.abs(predicted - observed))
    )


def calculate_bias(observed, predicted):
    observed = np.array(observed)
    predicted = np.array(predicted)

    return float(
        np.mean(predicted - observed)
    )


# ============================================================
# HAVERSINE DISTANCE
# ============================================================

def haversine_distance(lat1, lon1, lat2, lon2):

    R = 6371.0

    lat1 = np.radians(lat1)
    lat2 = np.radians(lat2)

    dlat = lat2 - lat1
    dlon = np.radians(lon2 - lon1)

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1)
        * np.cos(lat2)
        * np.sin(dlon / 2) ** 2
    )

    c = 2 * np.arcsin(np.sqrt(a))

    return R * c


# ============================================================
# MAIN
# ============================================================

def main():

    print("\n========================================")
    print("ARGO → COPERNICUS VALIDATION")
    print("========================================")

    # --------------------------------------------------------
    # 1. LOAD ARGO
    # --------------------------------------------------------

    print("\nDownloading Argo observations...")

    argo_ds = fetch_argo_region()

    print("Applying Argo QC...")

    argo_ds = apply_argo_qc(argo_ds)

    # --------------------------------------------------------
    # 2. LOAD COPERNICUS
    # --------------------------------------------------------

    model_path = Path(
        "data/copernicus/arabian_sea_temperature_validation.nc"
    )

    if not model_path.exists():

        raise FileNotFoundError(
            f"Copernicus dataset not found: {model_path}"
        )

    print("\nLoading Copernicus dataset...")

    model_ds = xr.open_dataset(model_path)

    # --------------------------------------------------------
    # 3. MATCHING TOLERANCES
    # --------------------------------------------------------

    TIME_TOLERANCE = np.timedelta64(1, "D")

    LAT_LON_TOLERANCE = 0.1

    DEPTH_TOLERANCE = 5.0

    print("\nMatching rules:")
    print("  Time tolerance      : ±1 day")
    print("  Latitude tolerance  : ±0.1°")
    print("  Longitude tolerance : ±0.1°")
    print("  Depth tolerance     : ±5 m")

    # --------------------------------------------------------
    # 4. ARGO ARRAYS
    # --------------------------------------------------------

    latitudes = argo_ds["LATITUDE"].values
    longitudes = argo_ds["LONGITUDE"].values
    times = argo_ds["TIME"].values
    pressures = argo_ds["PRES"].values
    observations = argo_ds["TEMP"].values

    total = len(observations)

    print(f"\nTotal Argo observations: {total}")

    observed_values = []
    model_values = []

    matched_rows = []

    matched = 0
    unmatched = 0

    # --------------------------------------------------------
    # 5. MATCH OBSERVATIONS
    # --------------------------------------------------------

    print("\nMatching observations...")

    for i in range(total):

        observed_temperature = observations[i]

        if np.isnan(observed_temperature):

            unmatched += 1
            continue

        latitude = float(latitudes[i])
        longitude = float(longitudes[i])

        pressure = float(pressures[i])

        observation_time = times[i]

        # ----------------------------------------------------
        # PRESSURE → DEPTH
        # ----------------------------------------------------

        depth = float(
            -gsw.z_from_p(
                pressure,
                latitude
            )
        )

        try:

            # ------------------------------------------------
            # TIME
            # ------------------------------------------------

            model_at_time = model_ds["thetao"].sel(
                time=observation_time,
                method="nearest",
                tolerance=TIME_TOLERANCE
            )

            actual_time = model_at_time["time"].values

            # ------------------------------------------------
            # LATITUDE
            # ------------------------------------------------

            model_at_lat = model_at_time.sel(
                latitude=latitude,
                method="nearest",
                tolerance=LAT_LON_TOLERANCE
            )

            actual_latitude = float(
                model_at_lat["latitude"].values
            )

            # ------------------------------------------------
            # LONGITUDE
            # ------------------------------------------------

            model_at_lon = model_at_lat.sel(
                longitude=longitude,
                method="nearest",
                tolerance=LAT_LON_TOLERANCE
            )

            actual_longitude = float(
                model_at_lon["longitude"].values
            )

            # ------------------------------------------------
            # DEPTH
            # ------------------------------------------------

            model_at_depth = model_at_lon.sel(
                depth=depth,
                method="nearest",
                tolerance=DEPTH_TOLERANCE
            )

            actual_depth = float(
                model_at_depth["depth"].values
            )

            model_temperature = float(
                model_at_depth.values
            )

        except (KeyError, ValueError, IndexError):

            unmatched += 1
            continue

        if np.isnan(model_temperature):

            unmatched += 1
            continue

        # ----------------------------------------------------
        # MATCH INFORMATION
        # ----------------------------------------------------

        spatial_distance = haversine_distance(
            latitude,
            longitude,
            actual_latitude,
            actual_longitude
        )

        depth_difference = abs(
            depth - actual_depth
        )

        time_difference_hours = abs(
            (
                np.datetime64(actual_time)
                - np.datetime64(observation_time)
            )
            / np.timedelta64(1, "h")
        )

        temperature_difference = (
            model_temperature
            - float(observed_temperature)
        )

        # ----------------------------------------------------
        # STORE VALUES
        # ----------------------------------------------------

        observed_values.append(
            float(observed_temperature)
        )

        model_values.append(
            model_temperature
        )

        matched_rows.append({

            "latitude": latitude,

            "longitude": longitude,

            "argo_time": str(
                np.datetime64(observation_time)
            ),

            "argo_pressure_dbar": pressure,

            "argo_depth_m": depth,

            "argo_temperature_c": float(
                observed_temperature
            ),

            "copernicus_time": str(
                np.datetime64(actual_time)
            ),

            "copernicus_latitude": actual_latitude,

            "copernicus_longitude": actual_longitude,

            "copernicus_depth_m": actual_depth,

            "copernicus_temperature_c":
                model_temperature,

            "temperature_difference_c":
                temperature_difference,

            "spatial_distance_km":
                float(spatial_distance),

            "depth_difference_m":
                float(depth_difference),

            "time_difference_hours":
                float(time_difference_hours)
        })

        matched += 1

    # --------------------------------------------------------
    # 6. RESULTS
    # --------------------------------------------------------

    observed_values = np.array(observed_values)

    model_values = np.array(model_values)

    n = len(observed_values)

    print("\n========================================")
    print("VALIDATION RESULTS")
    print("========================================")

    print(f"\nArgo observations : {total}")

    print(f"Matched pairs     : {matched}")

    print(f"Unmatched         : {unmatched}")

    if n == 0:

        print("\nNo valid matches found.")

        model_ds.close()
        argo_ds.close()

        return

    rmse = calculate_rmse(
        observed_values,
        model_values
    )

    mae = calculate_mae(
        observed_values,
        model_values
    )

    bias = calculate_bias(
        observed_values,
        model_values
    )

    print(f"\nRMSE : {rmse:.4f} °C")

    print(f"MAE  : {mae:.4f} °C")

    print(f"Bias : {bias:.4f} °C")

    print(f"N    : {n}")

    # --------------------------------------------------------
    # 7. MATCH QUALITY
    # --------------------------------------------------------

    distances = [
        row["spatial_distance_km"]
        for row in matched_rows
    ]

    depth_differences = [
        row["depth_difference_m"]
        for row in matched_rows
    ]

    time_differences = [
        row["time_difference_hours"]
        for row in matched_rows
    ]

    print("\n========================================")
    print("MATCH QUALITY")
    print("========================================")

    print(
        f"\nAverage horizontal distance : "
        f"{np.mean(distances):.3f} km"
    )

    print(
        f"Maximum horizontal distance : "
        f"{np.max(distances):.3f} km"
    )

    print(
        f"Average depth difference    : "
        f"{np.mean(depth_differences):.3f} m"
    )

    print(
        f"Average time difference     : "
        f"{np.mean(time_differences):.3f} hours"
    )

    # --------------------------------------------------------
    # 8. SAVE CSV
    # --------------------------------------------------------

    output_dir = Path("data/validation")

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    csv_path = (
        output_dir
        / "temperature_validation_results.csv"
    )

    fieldnames = list(
        matched_rows[0].keys()
    )

    with open(
        csv_path,
        "w",
        newline="",
        encoding="utf-8"
    ) as csv_file:

        writer = csv.DictWriter(
            csv_file,
            fieldnames=fieldnames
        )

        writer.writeheader()

        writer.writerows(
            matched_rows
        )

    print("\n========================================")
    print("VALIDATION DATA SAVED")
    print("========================================")

    print(f"\nCSV file:")
    print(csv_path)

    print(
        f"\nSaved {len(matched_rows)} matched observations."
    )

    # --------------------------------------------------------
    # 9. SAMPLE MATCHES
    # --------------------------------------------------------

    print("\n========================================")
    print("SAMPLE MATCHES")
    print("========================================")

    for i in range(min(5, n)):

        difference = (
            model_values[i]
            - observed_values[i]
        )

        print(
            f"{i + 1}. "
            f"Argo = {observed_values[i]:.2f} °C | "
            f"Copernicus = {model_values[i]:.2f} °C | "
            f"Difference = {difference:.2f} °C"
        )

    # --------------------------------------------------------
    # 10. CLOSE
    # --------------------------------------------------------

    model_ds.close()

    argo_ds.close()


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()