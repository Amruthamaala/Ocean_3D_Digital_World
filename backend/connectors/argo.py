import xarray as xr
from argopy import DataFetcher


# ============================================================
# ARGO REGION
# ============================================================

def fetch_argo_region(
    min_lon=65,
    max_lon=75,
    min_lat=10,
    max_lat=20,
    min_depth=0,
    max_depth=100,
    start_date="2026-05-01",
    end_date="2026-07-01",
):
    """
    Fetch Argo observations for a specific
    geographic region, depth range and time range.

    Returns:
        xarray.Dataset
    """

    print("\n========================================")
    print("ARGO DATA FETCH")
    print("========================================")

    print(f"Longitude : {min_lon} to {max_lon}")
    print(f"Latitude  : {min_lat} to {max_lat}")
    print(f"Depth     : {min_depth} to {max_depth} m")
    print(f"Time      : {start_date} to {end_date}")

    # Argopy region format:
    #
    # [lon_min, lon_max,
    #  lat_min, lat_max,
    #  depth_min, depth_max,
    #  date_min, date_max]

    region = [
        min_lon,
        max_lon,
        min_lat,
        max_lat,
        min_depth,
        max_depth,
        start_date,
        end_date,
    ]

    print("\nRequesting Argo data...")

    fetcher = DataFetcher(
        src="erddap"
    ).region(region)

    ds = fetcher.load().data

    print("\nArgo data downloaded successfully.")
    print(ds)

    return ds


# ============================================================
# BASIC INSPECTION
# ============================================================

def inspect_argo_data(ds):

    print("\n========================================")
    print("ARGO DATA VARIABLES")
    print("========================================")

    print("\nCoordinates:")

    for coordinate in ds.coords:
        print(
            f"  {coordinate}: "
            f"{ds[coordinate].dims}"
        )

    print("\nVariables:")

    for variable in ds.data_vars:
        print(
            f"  {variable}: "
            f"{ds[variable].dims}"
        )


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    ds = fetch_argo_region()

    inspect_argo_data(ds)

    ds.close()