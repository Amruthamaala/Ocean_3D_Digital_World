import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path


# ============================================================
# LOAD DEPTH-WISE RESULTS
# ============================================================

input_path = Path(
    "data/validation/depth_wise_validation.csv"
)

df = pd.read_csv(input_path)


# ============================================================
# PRINT RESULTS
# ============================================================

print("\n========================================")
print("DEPTH-WISE RMSE")
print("========================================")

print(df.to_string(index=False))


# ============================================================
# CREATE PLOT
# ============================================================

plt.figure(figsize=(9, 6))

plt.bar(
    df["Depth Range"],
    df["RMSE (°C)"]
)

plt.xlabel(
    "Ocean Depth Range"
)

plt.ylabel(
    "RMSE (°C)"
)

plt.title(
    "Copernicus Temperature RMSE by Ocean Depth"
)

plt.grid(
    axis="y",
    alpha=0.3
)

plt.tight_layout()


# ============================================================
# SAVE
# ============================================================

output_path = Path(
    "data/validation/depth_wise_rmse.png"
)

plt.savefig(
    output_path,
    dpi=300,
    bbox_inches="tight"
)

print(
    f"\nFigure saved to: {output_path}"
)

plt.show()