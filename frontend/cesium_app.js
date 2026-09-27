

const viewer = new Cesium.Viewer("cesiumContainer", {
  imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer"
  }),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  animation: false,
  navigationHelpButton: false
});

// Enable realistic atmospheric lighting and sun shadows
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.atmosphereLightIntensity = 12.0;

// Set Camera View directly over the Indian Ocean / India
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(74.0, 10.0, 7500000), // Lon, Lat, Altitude in meters
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-85),
    roll: 0.0
  }
});

// --- 2. Realistic Ocean Temperature Layer (Bounding Rectangle Overlay) ---
// Coordinates covering Arabian Sea, Bay of Bengal, and Indian Ocean
const oceanBBox = Cesium.Rectangle.fromDegrees(50.0, -10.0, 100.0, 25.0);

// Generate procedural heatmap texture based on depth
function generateThermalTexture(depth) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  // Multi-stop colormap matching standard oceanographic palettes
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  if (depth <= 50) {
    grad.addColorStop(0.0, "rgba(220, 20, 60, 0.75)");   // Warm surface red (~29°C)
    grad.addColorStop(0.4, "rgba(255, 140, 0, 0.7)");   // Orange
    grad.addColorStop(0.7, "rgba(0, 220, 180, 0.6)");   // Aqua
    grad.addColorStop(1.0, "rgba(0, 30, 120, 0.5)");    // Deep blue
  } else if (depth <= 200) {
    grad.addColorStop(0.0, "rgba(255, 160, 0, 0.65)");  // Thermocline yellow-orange
    grad.addColorStop(0.5, "rgba(0, 200, 180, 0.6)");
    grad.addColorStop(1.0, "rgba(0, 20, 90, 0.6)");
  } else {
    grad.addColorStop(0.0, "rgba(0, 120, 255, 0.6)");   // Cold abyss (~6°C - 10°C)
    grad.addColorStop(1.0, "rgba(0, 5, 40, 0.65)");
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

// Add ocean heatmap layer to the globe
let oceanLayer = viewer.entities.add({
  rectangle: {
    coordinates: oceanBBox,
    material: new Cesium.ImageMaterialProperty({
      image: generateThermalTexture(100),
      transparent: true
    })
  }
});

// Update thermal layer when depth changes
function updateThermalLayer(depth) {
  oceanLayer.rectangle.material = new Cesium.ImageMaterialProperty({
    image: generateThermalTexture(depth),
    transparent: true
  });
}

// --- 3. Argo Float 3D Markers (Accurate Geo-Referenced Pins) ---
const argoData = [
  { id: "12345", name: "Argo Float #12345", lat: 15.2, lon: 72.4, basin: "Arabian Sea" },
  { id: "12346", name: "Argo Float #12346", lat: 12.0, lon: 86.5, basin: "Bay of Bengal" },
  { id: "12347", name: "Argo Float #12347", lat: -4.0, lon: 68.0, basin: "Equatorial Indian Ocean" }
];

const argoEntities = [];

argoData.forEach(float => {
  const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(float.lon, float.lat, 2000),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString("#00ff88"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2
    },
    label: {
      text: float.name,
      font: "12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("rgba(5, 15, 30, 0.8)"),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -12)
    },
    properties: float
  });
  argoEntities.push(entity);
});

// Click Interaction on Argo Floats
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((click) => {
  const pickedObject = viewer.scene.pick(click.position);
  if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
    const float = pickedObject.id.properties.getValue();
    openArgoProfile(float);
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// --- 4. Chart.js In-situ vs Model Comparison ---
let profileChart = null;

async function openArgoProfile(float) {

  // ------------------------------------------------------
  // SHOW PROFILE PANEL
  // ------------------------------------------------------

  document.getElementById("detail-panel").style.display = "block";

  // Your backend gives us "id", not "name"
  document.getElementById("float-name").innerText =
    `Argo Profile ${float.id}`;

  document.getElementById("float-loc").innerText =
    `${Number(float.lat).toFixed(2)}° N, ${Number(float.lon).toFixed(2)}° E`;


  // ------------------------------------------------------
  // SHOW LOADING MESSAGE
  // ------------------------------------------------------

  const tbody = document.getElementById("val-tbody");

  tbody.innerHTML = `
    <tr>
      <td colspan="4">Loading real Argo observations...</td>
    </tr>
  `;


  try {

    // ----------------------------------------------------
    // REQUEST REAL ARGO PROFILE FROM OUR BACKEND
    // ----------------------------------------------------

    const response = await fetch(
      `http://127.0.0.1:8000/api/argo-profile?platform_number=${encodeURIComponent(float.id)}`
    );


    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }


    const data = await response.json();


    // ----------------------------------------------------
    // CHECK BACKEND RESPONSE
    // ----------------------------------------------------

    if (data.status !== "success") {

      throw new Error(
        data.message || "Could not load Argo profile"
      );
    }


    console.log("REAL ARGO PROFILE:", data);


    // ----------------------------------------------------
    // REAL DATA FROM ARGO
    // ----------------------------------------------------

    const depths = data.depths || [];

    const argoTemp = data.observed_values || [];

    const salinity = data.salinity || [];


    // Make sure we actually received observations

    if (depths.length === 0 || argoTemp.length === 0) {

      throw new Error(
        "No temperature observations found in this profile"
      );
    }


    // ----------------------------------------------------
    // UPDATE PROFILE INFORMATION
    // ----------------------------------------------------

    document.getElementById("float-name").innerText =
      `Argo Profile ${data.profile_id}`;

    document.getElementById("float-loc").innerText =
      `${Number(data.latitude).toFixed(2)}° N, ` +
      `${Number(data.longitude).toFixed(2)}° E`;


    // ----------------------------------------------------
    // VALIDATION TABLE
    // ----------------------------------------------------
    // At this stage we only have REAL ARGO data.
    //
    // Copernicus model comparison will be added next.
    // Therefore we do NOT use fake model values.
    // ----------------------------------------------------

    tbody.innerHTML = "";


    for (let i = 0; i < depths.length; i++) {

      const depth = Number(depths[i]).toFixed(1);

      const temperature =
        argoTemp[i] !== null && argoTemp[i] !== undefined
          ? Number(argoTemp[i]).toFixed(2)
          : "—";


      tbody.innerHTML += `
        <tr>
          <td>${depth}</td>
          <td>—</td>
          <td>${temperature}</td>
          <td>—</td>
        </tr>
      `;
    }


    // ----------------------------------------------------
    // DRAW REAL ARGO TEMPERATURE PROFILE
    // ----------------------------------------------------

    const ctx =
      document
        .getElementById("depthProfileChart")
        .getContext("2d");


    if (profileChart) {
      profileChart.destroy();
    }


    profileChart = new Chart(ctx, {

      type: "line",

      data: {

        labels: depths,

        datasets: [

          {
            label: "Argo (Observed)",

            data: argoTemp,

            borderColor: "#00e5ff",

            borderWidth: 2,

            pointRadius: 2,

            pointHoverRadius: 5,

            fill: false,

            tension: 0.15
          }

        ]
      },


      options: {

        responsive: true,

        indexAxis: "y",

        scales: {

          y: {

            reverse: true,

            title: {
              display: true,
              text: "Depth (m)",
              color: "#cfd8dc"
            },

            ticks: {
              color: "#cfd8dc"
            },

            grid: {
              color: "#162d4a"
            }
          },


          x: {

            title: {
              display: true,
              text: "Temperature (°C)",
              color: "#cfd8dc"
            },

            ticks: {
              color: "#cfd8dc"
            },

            grid: {
              color: "#162d4a"
            }
          }
        },


        plugins: {

          legend: {

            labels: {
              color: "#cfd8dc"
            }
          },

          tooltip: {

            callbacks: {

              title: function(context) {

                const index = context[0].dataIndex;

                return `Depth: ${Number(depths[index]).toFixed(1)} m`;
              },

              label: function(context) {

                return `Temperature: ${Number(context.raw).toFixed(2)} °C`;
              }
            }
          }
        }
      }
    });


    // ----------------------------------------------------
    // LOG SALINITY FOR NOW
    // ----------------------------------------------------

    console.log(
      "Real Argo salinity observations:",
      salinity
    );

    console.log(
      `Loaded ${depths.length} real Argo measurements`
    );

  }


  // ------------------------------------------------------
  // HANDLE ERRORS
  // ------------------------------------------------------

  catch (error) {

    console.error(
      "Error loading Argo profile:",
      error
    );


    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          Failed to load Argo profile
        </td>
      </tr>
    `;

    document.getElementById("float-name").innerText =
      "Argo Profile Error";
  }
}
function closeDetailPanel() {
  document.getElementById("detail-panel").style.display = "none";
}

// --- 5. Controls & Camera Handlers ---
function setDepth(val) {
  const depth = parseInt(val);
  document.getElementById("depth-slider").value = depth;
  document.getElementById("depth-val-display").innerText = `${depth} m`;

  document.querySelectorAll(".slice-card").forEach(el => el.classList.remove("active"));
  event?.target?.classList.add("active");

  updateThermalLayer(depth);
}

document.getElementById("depth-slider").addEventListener("input", (e) => {
  setDepth(e.target.value);
});

function toggleArgo(visible) {
  argoEntities.forEach(e => e.show = visible);
}

function flyToRegion(region) {
  if (region === "arabian") {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(68.0, 15.0, 3500000)
    });
  } else if (region === "bengal") {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(88.0, 15.0, 3500000)
    });
  } else {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(74.0, 10.0, 7500000)
    });
  }
}

// Load default active float view on start
openArgoProfile(argoData[0]);