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
print("TEMPERATURE ERROR ANALYSIS")
print("========================================")

print(f"\nObservations: {len(df)}")


# ============================================================
# CALCULATE ERROR
# ============================================================

argo = df["argo_temperature_c"]

copernicus = df["copernicus_temperature_c"]

error = df["temperature_difference_c"]


# ============================================================
# ERROR STATISTICS
# ============================================================

mean_error = error.mean()

median_error = error.median()

minimum_error = error.min()

maximum_error = error.max()

std_error = error.std()

rmse = (
    ((copernicus - argo) ** 2)
    .mean()
    ** 0.5
)


print("\n========================================")
print("ERROR STATISTICS")
print("========================================")

print(f"\nMean error   : {mean_error:.4f} °C")
print(f"Median error : {median_error:.4f} °C")
print(f"Minimum      : {minimum_error:.4f} °C")
print(f"Maximum      : {maximum_error:.4f} °C")
print(f"Std deviation: {std_error:.4f} °C")
print(f"RMSE         : {rmse:.4f} °C")


# ============================================================
# CREATE OUTPUT DIRECTORY
# ============================================================

output_dir = Path("data/validation")

output_dir.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# ERROR VS ARGO TEMPERATURE
# ============================================================

plt.figure(figsize=(9, 6))

plt.scatter(
    argo,
    error,
    s=12,
    alpha=0.5
)


# Zero-error reference line

plt.axhline(
    y=0,
    linestyle="--",
    linewidth=2
)


# Mean-error line

plt.axhline(
    y=mean_error,
    linestyle=":",
    linewidth=2
)


# ============================================================
# LABELS
# ============================================================

plt.xlabel(
    "Argo Observed Temperature (°C)"
)

plt.ylabel(
    "Copernicus − Argo Temperature (°C)"
)

plt.title(
    "Copernicus Temperature Error Analysis"
)


# ============================================================
# METRICS BOX
# ============================================================

text = (
    f"Mean Error = {mean_error:.3f} °C\n"
    f"Median Error = {median_error:.3f} °C\n"
    f"RMSE = {rmse:.3f} °C\n"
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
# SAVE
# ============================================================

output_path = (
    output_dir
    / "temperature_error_analysis.png"
)

plt.savefig(
    output_path,
    dpi=300,
    bbox_inches="tight"
)

print("\nFigure saved to:")

print(output_path)


plt.show()