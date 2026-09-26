import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path


# ============================================================
# LOAD VALIDATION DATA
# ============================================================

csv_path = Path(
    "data/validation/temperature_validation_results.csv"
)

df = pd.read_csv(csv_path)

print("\n========================================")
print("VALIDATION VISUALIZATION")
print("========================================")

print(f"\nLoaded observations: {len(df)}")


# ============================================================
# EXTRACT DATA
# ============================================================

argo = df["argo_temperature_c"]

copernicus = df["copernicus_temperature_c"]


# ============================================================
# CALCULATE METRICS
# ============================================================

rmse = (
    ((copernicus - argo) ** 2)
    .mean()
    ** 0.5
)

mae = (
    (copernicus - argo)
    .abs()
    .mean()
)

bias = (
    copernicus - argo
).mean()

correlation = argo.corr(copernicus)

r_squared = correlation ** 2


# ============================================================
# PRINT METRICS
# ============================================================

print("\n========================================")
print("VALIDATION METRICS")
print("========================================")

print(f"\nRMSE        : {rmse:.4f} °C")
print(f"MAE         : {mae:.4f} °C")
print(f"Bias        : {bias:.4f} °C")
print(f"Correlation : {correlation:.4f}")
print(f"R²          : {r_squared:.4f}")


# ============================================================
# CREATE OUTPUT DIRECTORY
# ============================================================

output_dir = Path("data/validation")

output_dir.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# ARGO VS COPERNICUS
# ============================================================

plt.figure(figsize=(8, 7))

plt.scatter(
    argo,
    copernicus,
    s=12,
    alpha=0.5
)


# ------------------------------------------------------------
# 1:1 REFERENCE LINE
# ------------------------------------------------------------

minimum = min(
    argo.min(),
    copernicus.min()
)

maximum = max(
    argo.max(),
    copernicus.max()
)

plt.plot(
    [minimum, maximum],
    [minimum, maximum],
    linestyle="--",
    linewidth=2
)


# ------------------------------------------------------------
# LABELS
# ------------------------------------------------------------

plt.xlabel(
    "Argo Observed Temperature (°C)"
)

plt.ylabel(
    "Copernicus Model Temperature (°C)"
)

plt.title(
    "Argo vs Copernicus Ocean Temperature Validation"
)


# ------------------------------------------------------------
# METRICS ON PLOT
# ------------------------------------------------------------

text = (
    f"RMSE = {rmse:.3f} °C\n"
    f"MAE = {mae:.3f} °C\n"
    f"Bias = {bias:.3f} °C\n"
    f"R² = {r_squared:.3f}\n"
    f"N = {len(df)}"
)

plt.text(
    0.05,
    0.95,
    text,
    transform=plt.gca().transAxes,
    verticalalignment="top",
    bbox=dict(
        boxstyle="round",
        facecolor="white",
        alpha=0.8
    )
)


plt.grid(
    True,
    alpha=0.3
)

plt.tight_layout()


# ============================================================
# SAVE FIGURE
# ============================================================

output_path = (
    output_dir
    / "argo_vs_copernicus_temperature.png"
)

plt.savefig(
    output_path,
    dpi=300,
    bbox_inches="tight"
)

print("\nFigure saved to:")

print(output_path)

plt.show()