import xarray as xr


# Argo QC flags:
# 1 = Good
# 2 = Probably good
# 3 = Probably bad
# 4 = Bad
# 5-9 = Other/special flags
GOOD_QC_FLAGS = [1, 2]


def apply_argo_qc(ds):
    """
    Keep only observations with good/probably-good
    Argo quality flags.
    """

    ds = ds.copy()

    # Temperature QC
    if "TEMP_QC" in ds:
        temp_good = ds["TEMP_QC"].isin(GOOD_QC_FLAGS)
        ds["TEMP"] = ds["TEMP"].where(temp_good)

    # Salinity QC
    if "PSAL_QC" in ds:
        psal_good = ds["PSAL_QC"].isin(GOOD_QC_FLAGS)
        ds["PSAL"] = ds["PSAL"].where(psal_good)

    # Pressure QC
    if "PRES_QC" in ds:
        pres_good = ds["PRES_QC"].isin(GOOD_QC_FLAGS)
        ds["PRES"] = ds["PRES"].where(pres_good)

    return ds


def print_qc_report(ds):
    print("\n========================================")
    print("ARGO QUALITY CONTROL REPORT")
    print("========================================")

    for variable, qc_variable in [
        ("TEMP", "TEMP_QC"),
        ("PSAL", "PSAL_QC"),
        ("PRES", "PRES_QC"),
    ]:

        if variable not in ds or qc_variable not in ds:
            continue

        total = ds[variable].size

        good = int(
            ds[qc_variable]
            .isin(GOOD_QC_FLAGS)
            .sum()
        )

        rejected = total - good

        print(f"\n{variable}")
        print(f"  Total observations : {total}")
        print(f"  Good observations  : {good}")
        print(f"  Rejected            : {rejected}")


if __name__ == "__main__":

    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parent.parent))

    from connectors.argo import fetch_argo_region

    print("Downloading Argo data...")

    ds = fetch_argo_region()

    print_qc_report(ds)

    ds_qc = apply_argo_qc(ds)

    print("\nQC applied successfully.")

    ds.close()