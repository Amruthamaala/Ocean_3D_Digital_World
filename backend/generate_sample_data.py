import numpy as np
import xarray as xr

# Define grid coordinates
lats = np.linspace(10, 20, 30)
lons = np.linspace(65, 75, 30)
depths = np.array([0, 10, 20, 50, 100, 200, 500, 1000])

# Generate realistic ocean thermocline physics (warm surface, cold deep)
# Temp drops exponentially with depth
temp_grid = np.zeros((len(depths), len(lats), len(lons)))
for d_idx, d in enumerate(depths):
    base_temp = 29.0 * np.exp(-d / 300.0) + 4.0
    # Add slight spatial gradients
    for lat_idx in range(len(lats)):
        for lon_idx in range(len(lons)):
            temp_grid[d_idx, lat_idx, lon_idx] = round(
                base_temp + (lat_idx * 0.05) - (lon_idx * 0.03), 2
            )

# Create xarray Dataset
ds = xr.Dataset(
    data_vars={
        "thetao": (["depth", "latitude", "longitude"], temp_grid),
    },
    coords={
        "depth": depths,
        "latitude": lats,
        "longitude": lons,
    },
    attrs={"description": "Arabian Sea Synthetic 3D Ocean Model"}
)

ds.to_netcdf("ocean_data.nc")
print("Successfully generated ocean_data.nc!")