import xarray as xr


# ============================================================
# STANDARD VARIABLE NAMES
# ============================================================

VARIABLE_MAPPING = {
    "thetao": "temperature",
    "so": "salinity",
    "uo": "u_velocity",
    "vo": "v_velocity",
    "zos": "ssh",
}


# ============================================================
# STANDARDIZE DATASET
# ============================================================

def standardize_dataset(ds):
    """
    Convert source-specific variable names into
    standard names used by our application.
    """

    ds = ds.copy()

    rename_map = {}

    for source_name, standard_name in VARIABLE_MAPPING.items():

        if source_name in ds.data_vars:
            rename_map[source_name] = standard_name

    if not rename_map:
        raise ValueError(
            "No recognized ocean variables found in dataset."
        )

    ds = ds.rename(rename_map)

    return ds


# ============================================================
# STANDARDIZE COORDINATES
# ============================================================

def standardize_coordinates(ds):
    """
    Rename common coordinate names into the standard
    coordinate names used by our application.
    """

    coordinate_mapping = {
        "lat": "latitude",
        "lon": "longitude",
        "deptht": "depth",
        "lev": "depth",
        "level": "depth",
    }

    rename_map = {}

    for source_name, standard_name in coordinate_mapping.items():

        if source_name in ds.coords:
            rename_map[source_name] = standard_name

    if rename_map:
        ds = ds.rename(rename_map)

    return ds


# ============================================================
# COMPLETE STANDARDIZATION
# ============================================================

def standardize(ds):
    """
    Apply all standardization steps.
    """

    ds = standardize_coordinates(ds)
    ds = standardize_dataset(ds)

    return ds