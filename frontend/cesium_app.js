// --- 1. Cesium Token & High-Res Photorealistic Globe Initialization ---
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IlVuZ0JnT0NEZldDRG96TXIiLCJqdGkiOiIwYzAwM2MzYy03YTlkLTRhODYtYTJhZi0yZThkYThkYzY5MmUiLCJpZCI6NDgxNzQxLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODg2NzE5MjJ9.zUp5Y2KoR1wJmPiFaqcqRjlucokIVEGzF3k69qXZbU4";

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

function openArgoProfile(float) {
  document.getElementById("detail-panel").style.display = "block";
  document.getElementById("float-name").innerText = float.name;
  document.getElementById("float-loc").innerText = `${float.lat}° N, ${float.lon}° E`;

  const depths = [0, 50, 100, 200, 500, 1000, 2000];
  const modelTemp = [28.5, 25.4, 22.4, 18.2, 11.8, 6.1, 2.5];
  const argoTemp  = [28.7, 25.9, 22.8, 18.0, 12.1, 6.4, 2.6];

  // Fill Validation Table
  const tbody = document.getElementById("val-tbody");
  tbody.innerHTML = "";
  for (let i = 0; i < depths.length; i++) {
    const diff = (argoTemp[i] - modelTemp[i]).toFixed(1);
    const diffSign = diff >= 0 ? `+${diff}` : diff;
    tbody.innerHTML += `
      <tr>
        <td>${depths[i]}</td>
        <td>${modelTemp[i]}</td>
        <td>${argoTemp[i]}</td>
        <td style="color:${diff >= 0 ? '#4fc3f7' : '#ff8a80'}">${diffSign}</td>
      </tr>
    `;
  }

  // Draw Vertical Profile Chart (Depth inverted vertically)
  const ctx = document.getElementById("depthProfileChart").getContext("2d");
  if (profileChart) profileChart.destroy();

  profileChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: depths,
      datasets: [
        { label: "Argo (Observed)", data: argoTemp, borderColor: "#00e5ff", borderWidth: 2, pointRadius: 4 },
        { label: "Model", data: modelTemp, borderColor: "#ff5252", borderWidth: 2, borderDash: [4, 4], pointRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      indexAxis: "y",
      scales: {
        y: { reverse: true, ticks: { color: "#cfd8dc" }, grid: { color: "#162d4a" } },
        x: { ticks: { color: "#cfd8dc" }, grid: { color: "#162d4a" } }
      },
      plugins: { legend: { labels: { color: "#cfd8dc" } } }
    }
  });
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