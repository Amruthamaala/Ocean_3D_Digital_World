from pathlib import Path
import copernicusmarine
import xarray as xr


# ============================================================
# COPERNICUS DATASET
# ============================================================

DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"


# Our application's standard variable names
VARIABLES = {
    "temperature": "thetao",
    "salinity": "so",
    "u_velocity": "uo",
    "v_velocity": "vo",
    "ssh": "zos",
}


# ============================================================
# DOWNLOAD FUNCTION
# ============================================================

def download_data(
    variable="temperature",
    output_dir="data/copernicus",
    filename=None,
    min_lon=72,
    max_lon=73,
    min_lat=15,
    max_lat=16,
    min_depth=0,
    max_depth=10,
    start_date="2026-06-23",
    end_date="2026-06-23",
):
    """
    Download one ocean variable from Copernicus Marine.

    Parameters:
        variable: Our application variable name.
        output_dir: Directory where NetCDF will be saved.
        filename: Output NetCDF filename.
        min_lon, max_lon: Longitude range.
        min_lat, max_lat: Latitude range.
        min_depth, max_depth: Depth range.
        start_date, end_date: Date range.

    Returns:
        Path to downloaded NetCDF file.
    """

    # --------------------------------------------------------
    # Validate variable
    # --------------------------------------------------------

    if variable not in VARIABLES:
        raise ValueError(
            f"Unknown variable '{variable}'. "
            f"Choose from: {list(VARIABLES.keys())}"
        )

    copernicus_variable = VARIABLES[variable]

    # --------------------------------------------------------
    # Create output directory
    # --------------------------------------------------------

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # --------------------------------------------------------
    # Create filename automatically if not supplied
    # --------------------------------------------------------

    if filename is None:
        filename = f"{variable}.nc"

    file_path = output_path / filename

    # --------------------------------------------------------
    # Display request information
    # --------------------------------------------------------

    print("\n========================================")
    print("COPERNICUS DATA DOWNLOAD")
    print("========================================")

    print(f"Variable       : {variable}")
    print(f"Copernicus var : {copernicus_variable}")
    print(f"Longitude      : {min_lon} to {max_lon}")
    print(f"Latitude       : {min_lat} to {max_lat}")
    print(f"Depth          : {min_depth} to {max_depth} m")
    print(f"Date           : {start_date} to {end_date}")
    print(f"Output         : {file_path}")

    # --------------------------------------------------------
    # Request data
    # --------------------------------------------------------

    copernicusmarine.subset(
        dataset_id=DATASET_ID,
        variables=[copernicus_variable],

        minimum_longitude=min_lon,
        maximum_longitude=max_lon,

        minimum_latitude=min_lat,
        maximum_latitude=max_lat,

        minimum_depth=min_depth,
        maximum_depth=max_depth,

        start_datetime=start_date,
        end_datetime=end_date,

        output_directory=str(output_path),
        output_filename=filename,
    )

    print("\nDownload completed successfully.")
    print(f"File: {file_path}")

    return file_path


# ============================================================
# LOAD NETCDF
# ============================================================

def load_data(file_path):
    """
    Load a Copernicus NetCDF file using xarray.
    """

    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(
            f"Data file not found: {file_path}"
        )

    ds = xr.open_dataset(file_path)

    print("\nDataset loaded successfully.")
    print(ds)

    return ds


# ============================================================
# DATASET INFORMATION
# ============================================================

def get_statistics(ds, variable):
    """
    Calculate basic statistics for a dataset variable.
    """

    copernicus_variable = VARIABLES[variable]

    data = ds[copernicus_variable]

    return {
        "minimum": float(data.min()),
        "maximum": float(data.max()),
        "mean": float(data.mean()),
    }


# ============================================================
# TEST
# ============================================================

if __name__ == "__main__":

    # Test temperature download
    file_path = download_data(
        variable="temperature",
        filename="arabian_sea_temperature.nc",
    )

    # Load downloaded data
    ds = load_data(file_path)

    # Calculate statistics
    stats = get_statistics(ds, "temperature")

    print("\nTemperature statistics:")
    print(f"Minimum: {stats['minimum']:.4f} °C")
    print(f"Maximum: {stats['maximum']:.4f} °C")
    print(f"Mean:    {stats['mean']:.4f} °C")

    ds.close()