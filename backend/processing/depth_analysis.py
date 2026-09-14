import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
import numpy as np


# ============================================================
# LOAD DATA
# ============================================================

csv_path = Path(
    "data/validation/temperature_validation_results.csv"
)

df = pd.read_csv(csv_path)

print("\n========================================")
print("DEPTH-WISE TEMPERATURE VALIDATION")
print("========================================")

print(f"\nTotal matched observations: {len(df)}")


# ============================================================
# CREATE DEPTH BINS
# ============================================================

bins = [0, 10, 20, 40, 60, 80, 100]

labels = [
    "0–10 m",
    "10–20 m",
    "20–40 m",
    "40–60 m",
    "60–80 m",
    "80–100 m"
]

df["depth_range"] = pd.cut(
    df["argo_depth_m"],
    bins=bins,
    labels=labels,
    include_lowest=True
)


# ============================================================
# CALCULATE DEPTH-WISE METRICS
# ============================================================

results = []

for label in labels:

    group = df[
        df["depth_range"] == label
    ]

    if len(group) == 0:
        continue

    error = group[
        "temperature_difference_c"
    ]

    rmse = np.sqrt(
        np.mean(error ** 2)
    )

    mae = np.mean(
        np.abs(error)
    )

    bias = np.mean(error)

    results.append({
        "Depth Range": label,
        "Observations": len(group),
        "RMSE (°C)": rmse,
        "MAE (°C)": mae,
        "Bias (°C)": bias
    })


results_df = pd.DataFrame(results)


# ============================================================
# PRINT TABLE
# ============================================================

print("\n========================================")
print("DEPTH-WISE METRICS")
print("========================================")

print(
    results_df.to_string(
        index=False,
        float_format=lambda x: f"{x:.4f}"
    )
)


# ============================================================
# SAVE TABLE
# ============================================================

output_dir = Path(
    "data/validation"
)

output_dir.mkdir(
    parents=True,
    exist_ok=True
)

table_path = (
    output_dir
    / "depth_wise_validation.csv"
)

results_df.to_csv(
    table_path,
    index=False
)

print(
    f"\nTable saved to: {table_path}"
)


# ============================================================
# DEPTH VS TEMPERATURE ERROR
# ============================================================

plt.figure(
    figsize=(9, 6)
)

plt.scatter(
    df["argo_depth_m"],
    df["temperature_difference_c"],
    s=12,
    alpha=0.5
)


# Zero-error line

plt.axhline(
    y=0,
    linestyle="--",
    linewidth=2
)


# ============================================================
# LABELS
# ============================================================

plt.xlabel(
    "Argo Depth (m)"
)

plt.ylabel(
    "Copernicus − Argo Temperature (°C)"
)

plt.title(
    "Temperature Error vs Ocean Depth"
)

plt.grid(
    True,
    alpha=0.3
)

plt.tight_layout()


# ============================================================
# SAVE FIGURE
# ============================================================

figure_path = (
    output_dir
    / "temperature_error_vs_depth.png"
)

plt.savefig(
    figure_path,
    dpi=300,
    bbox_inches="tight"
)

print(
    f"Figure saved to: {figure_path}"
)

plt.show()