const container = document.getElementById("globe-container");
let profileChart = null;
let currentDepth = 5;
let currentVariable = 'temp';
let activeFloatData = null;
let profileRequestId = 0;
// Ensure container exists
if (!container) {
  console.error("Critical Error: Element #globe-container not found in HTML!");
}

// --- 1. Scene, Camera, & WebGL Setup ---
const scene = new THREE.Scene();
const width = container.clientWidth || window.innerWidth * 0.5;
const height = container.clientHeight || window.innerHeight * 0.7;

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(0, 0, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 9;
controls.maxDistance = 25;

// --- 2. 3D Earth Globe Construction ---
const RADIUS = 6.5;
const globeGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

// Blue Marble Earth textures
const earthDayMap = loader.load("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg");
const earthBumpMap = loader.load("https://unpkg.com/three-globe/example/img/earth-topology.png");

const earthMat = new THREE.MeshStandardMaterial({
  map: earthDayMap,
  bumpMap: earthBumpMap,
  bumpScale: 0.12,
  roughness: 0.6,
  metalness: 0.1
});
const earthMesh = new THREE.Mesh(globeGeo, earthMat);
scene.add(earthMesh);

// Atmospheric Rim Glow
const atmosphereGeo = new THREE.SphereGeometry(RADIUS + 0.12, 64, 64);
const atmosphereMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  transparent: true,
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
      gl_FragColor = vec4(0.2, 0.65, 1.0, 1.0) * intensity;
    }
  `
});
scene.add(new THREE.Mesh(atmosphereGeo, atmosphereMat));

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(20, 10, 20);
scene.add(sunLight);

// --- 3. Dynamic Ocean Heatmap Overlay ---
const oceanCanvas = document.createElement("canvas");
oceanCanvas.width = 2048;
oceanCanvas.height = 1024;
const ctx = oceanCanvas.getContext("2d");
const oceanTexture = new THREE.CanvasTexture(oceanCanvas);

const oceanOverlayMat = new THREE.MeshBasicMaterial({
  map: oceanTexture,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending
});
const oceanOverlayMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS + 0.03, 64, 64), oceanOverlayMat);
scene.add(oceanOverlayMesh);

function latLonToCanvasPixel(lat, lon) {
  return {
    x: ((lon + 180) / 360) * oceanCanvas.width,
    y: ((90 - lat) / 180) * oceanCanvas.height
  };
}

async function drawOceanField(depth, variable) {

  // For now, only temperature is connected to real Copernicus data.
  if (variable !== "temp") {
    ctx.clearRect(0, 0, oceanCanvas.width, oceanCanvas.height);
    oceanTexture.needsUpdate = true;
    return;
  }

  try {

    console.log(`Loading Copernicus temperature at depth ${depth}m...`);

    const response = await fetch(
      `http://127.0.0.1:8000/api/temperature?depth=${depth}`
    );

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.status !== "success") {
      throw new Error(result.message || "Temperature API failed");
    }

    console.log(
      `Received ${result.count} real Copernicus temperature points`
    );

    // Clear previous field
    ctx.clearRect(
      0,
      0,
      oceanCanvas.width,
      oceanCanvas.height
    );


    // Find temperature range
    const values = result.data.map(point => point.value);

    const minTemp = Math.min(...values);
    const maxTemp = Math.max(...values);


    // Draw each Copernicus grid point
    result.data.forEach(point => {

      const pixel = latLonToCanvasPixel(
        point.lat,
        point.lon
      );

      // Normalize temperature
      const normalized =
        (point.value - minTemp) /
        (maxTemp - minTemp || 1);


      // Blue → cyan → yellow → red
      let color;

      if (normalized < 0.33) {

        const t = normalized / 0.33;

        color = `rgb(
          ${Math.round(0 + 0 * t)},
          ${Math.round(80 + 175 * t)},
          ${Math.round(255 - 0 * t)}
        )`;

      } else if (normalized < 0.66) {

        const t = (normalized - 0.33) / 0.33;

        color = `rgb(
          ${Math.round(0 + 255 * t)},
          ${Math.round(255)},
          ${Math.round(255 - 255 * t)}
        )`;

      } else {

        const t = (normalized - 0.66) / 0.34;

        color = `rgb(
          255,
          ${Math.round(255 - 255 * t)},
          0
        )`;
      }


      ctx.fillStyle = color;

      // Small glow around each grid point
      ctx.globalAlpha = 0.55;

      ctx.beginPath();

      ctx.arc(
        pixel.x,
        pixel.y,
        3,
        0,
        Math.PI * 2
      );

      ctx.fill();
    });


    ctx.globalAlpha = 1.0;

    oceanTexture.needsUpdate = true;


    console.log(
      `Copernicus temperature range: ${minTemp.toFixed(2)}°C - ${maxTemp.toFixed(2)}°C`
    );

  } catch (error) {

    console.error(
      "Could not load Copernicus temperature data:",
      error
    );

  }
}

// --- 4. Dynamic Ocean Current Particles ---
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function getOceanCurrentVector(lat, lon) {
  let u = 0.0, v = 0.0;
  if (lat >= -5 && lat <= 3) {
    u = 0.6; v = 0.05;
  } else if (lat > 3 && lat <= 22 && lon >= 50 && lon <= 78) {
    u = (lat - 12) * 0.04; v = -(lon - 65) * 0.03;
  } else if (lat > 3 && lat <= 22 && lon > 78 && lon <= 95) {
    u = -(lat - 12) * 0.03; v = (lon - 87) * 0.03;
  }
  return { u, v };
}

const NUM_PARTICLES = 400;
const particleGroup = new THREE.Group();
scene.add(particleGroup);

class CurrentStreamline {
  constructor() {
    this.historyLength = 8;
    this.positions = new Float32Array(this.historyLength * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0x80deea,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    this.line = new THREE.Line(this.geometry, this.material);
    particleGroup.add(this.line);
    this.reset();
  }

  reset() {
    this.lat = -15 + Math.random() * 38;
    this.lon = 50 + Math.random() * 48;
    this.life = 0;
    this.maxLife = 60 + Math.random() * 80;

    const pos = latLonToVector3(this.lat, this.lon, RADIUS + 0.08);
    for (let i = 0; i < this.historyLength; i++) {
      this.positions[i * 3] = pos.x;
      this.positions[i * 3 + 1] = pos.y;
      this.positions[i * 3 + 2] = pos.z;
    }
  }

  update() {
    this.life++;
    if (this.life > this.maxLife) {
      this.reset();
      return;
    }

    const { u, v } = getOceanCurrentVector(this.lat, this.lon);
// --- AFTER (Smooth, Gentle Drift) ---
this.lon += (u * 0.1) + (Math.sin(this.life * 0.05) * 0.015);
this.lat += (v * 0.1) + (Math.cos(this.life * 0.05) * 0.015);
    for (let i = this.historyLength - 1; i > 0; i--) {
      this.positions[i * 3] = this.positions[(i - 1) * 3];
      this.positions[i * 3 + 1] = this.positions[(i - 1) * 3 + 1];
      this.positions[i * 3 + 2] = this.positions[(i - 1) * 3 + 2];
    }

    const head = latLonToVector3(this.lat, this.lon, RADIUS + 0.08);
    this.positions[0] = head.x;
    this.positions[1] = head.y;
    this.positions[2] = head.z;

    this.geometry.attributes.position.needsUpdate = true;
  }
}

const streamlines = [];
for (let i = 0; i < NUM_PARTICLES; i++) {
  streamlines.push(new CurrentStreamline());
}

// --- 5. Argo Float Interactive Pins ---
let argoData = [];

const pinGroup = new THREE.Group();
scene.add(pinGroup);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function drawArgoFloats() {
  // Remove existing pins before drawing fresh data
  while (pinGroup.children.length > 0) {
    const pin = pinGroup.children[0];

    pin.geometry.dispose();
    pin.material.dispose();

    pinGroup.remove(pin);
  }

  // Create one pin for every real Argo float
  argoData.forEach(float => {
    const pos = latLonToVector3(
      float.lat,
      float.lon,
      RADIUS + 0.12
    );

    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x00ff88
      })
    );

    pin.position.copy(pos);

    // Store complete real Argo float information
    pin.userData = float;

    pinGroup.add(pin);
  });

  console.log(`Drew ${argoData.length} real Argo float pins`);
}

window.addEventListener("click", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pinGroup.children);
  if (hits.length > 0) openArgoProfile(hits[0].object.userData);
});
async function loadArgoFloats() {
  try {
    console.log("Loading real Argo floats...");

    const response = await fetch(
      "http://127.0.0.1:8000/api/argo-floats"
    );

    if (!response.ok) {
      throw new Error(`Argo API failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.status !== "success") {
      throw new Error(result.message || "Argo API failed");
    }

    argoData = result.floats;

    console.log(
      `Loaded ${argoData.length} real Argo floats`
    );

    console.log(argoData);

    // Draw the real floats on the globe
    drawArgoFloats();

    // Open the first real float
    if (argoData.length > 0) {
      openArgoProfile(argoData[0]);
    }

  } catch (error) {
    console.error(
      "Could not load real Argo floats:",
      error
    );
  }
}
// --- 6. Chart.js In-situ vs Model Comparison with Safe Fallbacks ---
async function openArgoProfile(float) {
  const requestId = ++profileRequestId;
  activeFloatData = float;

  const detailPanel = document.getElementById("detail-panel");
  if (detailPanel) detailPanel.style.display = "block";

  const formatTimestamp = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toISOString().slice(0, 19).replace("T", " ");
  };

  const setMetadata = (metadata) => {
    if (!detailPanel) return;

    let metadataPanel = document.getElementById("profile-metadata");
    if (!metadataPanel) {
      metadataPanel = document.createElement("div");
      metadataPanel.id = "profile-metadata";
      const locationRow = document.getElementById("float-loc")?.closest(".meta-row");
      if (locationRow) locationRow.insertAdjacentElement("afterend", metadataPanel);
      else detailPanel.insertBefore(metadataPanel, detailPanel.querySelector(".divider"));
    }

    metadataPanel.innerHTML = "";
    Object.entries(metadata).forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "meta-row";
      row.innerHTML = "<span>" + label + ":</span> ";
      const valueElement = document.createElement("strong");
      valueElement.textContent = value;
      row.appendChild(valueElement);
      metadataPanel.appendChild(row);
    });
  };

  if (document.getElementById("float-name")) {
    document.getElementById("float-name").innerText = float.name || "Argo Float #" + float.id;
  }

  let depths = [];
  let observedValues = [];
  let modelValues = [];
  let differences = [];
  let unit = "°C";
  let argoTime = float.time || "—";
  let copernicusTime = "—";
  let errorMessage = null;

  try {
    const res = await fetch(`http://127.0.0.1:8000/api/argo-profile?platform_number=${float.id}`);
    if (!res.ok) {
      throw new Error(`Argo profile request failed: ${res.status}`);
    }

    const data = await res.json();
    console.log("REAL ARGO PROFILE:", data);
    if (data.status !== "success") {
      throw new Error(data.message || "Argo profile API failed");
    }

    depths = Array.isArray(data.depths) ? data.depths : [];
    observedValues = Array.isArray(data.observed_values)
      ? data.observed_values
      : (Array.isArray(data.temperatures) ? data.temperatures : []);
    modelValues = Array.isArray(data.model_values) ? data.model_values : [];
    differences = Array.isArray(data.differences) ? data.differences : [];
    unit = data.unit || "°C";
    argoTime = data.profile_time || float.time || "—";

    const modelTimes = Array.isArray(data.copernicus_times)
      ? [...new Set(data.copernicus_times.filter(Boolean))]
      : [];
    copernicusTime = modelTimes.length === 1
      ? formatTimestamp(modelTimes[0])
      : (modelTimes.length > 1 ? modelTimes.map(formatTimestamp).join(", ") : "—");
  } catch (error) {
    console.error("Could not load real Argo profile data:", error);
    errorMessage = "Could not load profile data";
  }

  // Ignore a slower response from an earlier float click.
  if (requestId !== profileRequestId) return;

  setMetadata({
    "Float ID": String(float.id),
    "Latitude": `${float.lat}° N`,
    "Longitude": `${float.lon}° E`,
    "Argo Profile Time": formatTimestamp(argoTime),
    "Copernicus Model Time": copernicusTime,
    "Matched Observations": errorMessage ? "0 matched observations" : `${depths.length} matched observations`
  });

  const tableHeaders = document.querySelectorAll(".val-table thead th");
  ["Depth (m)", `Argo Observed (${unit})`, `Copernicus Model (${unit})`, `Difference (${unit})`]
    .forEach((header, index) => {
      if (tableHeaders[index]) tableHeaders[index].textContent = header;
    });

  const tbody = document.getElementById("val-tbody");
  if (tbody) {
    tbody.innerHTML = "";

    if (errorMessage || depths.length === 0) {
      tbody.innerHTML = "<tr><td colspan=\"4\" style=\"color:#ffcc80; text-align:center; padding:18px 8px;\">"
        + (errorMessage || "No profile data available")
        + "</td></tr>";
    } else {
      for (let i = 0; i < depths.length; i++) {
        const observedValue = observedValues[i];
        const modelValue = modelValues[i];
        const difference = differences[i];
        const observedText = Number.isFinite(observedValue) ? observedValue.toFixed(2) : "—";
        const modelText = Number.isFinite(modelValue) ? modelValue.toFixed(2) : "—";
        const differenceText = Number.isFinite(difference)
          ? (difference >= 0 ? "+" : "") + difference.toFixed(2)
          : "—";
        const differenceColor = !Number.isFinite(difference)
          ? "#b0bec5"
          : (difference >= 0 ? "#4fc3f7" : "#ff8a80");

        tbody.innerHTML += "<tr>"
          + "<td>" + depths[i] + "</td>"
          + "<td>" + observedText + "</td>"
          + "<td>" + modelText + "</td>"
          + "<td style=\"color:" + differenceColor + "\">" + differenceText + "</td>"
          + "</tr>";
      }
    }
  }

  const canvas = document.getElementById("depthProfileChart");
  if (!canvas) {
    console.error("Canvas element #depthProfileChart not found in HTML!");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (profileChart) profileChart.destroy();

  profileChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: `Argo Observed (${unit})`,
          data: depths.map((depth, index) => ({
            x: observedValues[index],
            y: depth
          })),
          borderColor: "#00e5ff",
          borderWidth: 2,
          pointRadius: 3,
          showLine: true,
          spanGaps: true
        },
        {
          label: `Copernicus Model (${unit})`,
          data: depths.map((depth, index) => ({
            x: modelValues[index],
            y: depth
          })),
          borderColor: "#ff5252",
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 3,
          showLine: true,
          spanGaps: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: {
          title: { display: true, text: "Temperature (°C)", color: "#cfd8dc" },
          ticks: { color: "#cfd8dc", font: { size: 10 } },
          grid: { color: "#162d4a" }
        },
        y: {
          title: { display: true, text: "Depth (m)", color: "#cfd8dc" },
          reverse: true,
          ticks: { color: "#cfd8dc", font: { size: 10 } },
          grid: { color: "#162d4a" }
        }
      },
      plugins: { legend: { labels: { color: "#cfd8dc", boxWidth: 12, font: { size: 10 } } } }
    }
  });
}

// --- 7. Controls & Event Handlers ---
function switchVariable(variableKey) {
  currentVariable = variableKey;

  const btnMap = { temp: 'btn-temp', salinity: 'btn-salinity', currents: 'btn-currents', ssh: 'btn-ssh' };
  document.querySelectorAll('.var-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(btnMap[variableKey]);
  if (activeBtn) activeBtn.classList.add('active');

  const legendTitle = document.getElementById('legend-title');
  const colorRamp = document.getElementById('color-ramp');
  const legendScale = document.getElementById('legend-scale');

  if (variableKey === 'temp') {
    if (legendTitle) legendTitle.innerText = "Temperature (°C)";
    if (colorRamp) colorRamp.style.background = "linear-gradient(to right, #00008b, #00ffff, #ffff00, #ff0000)";
    if (legendScale) legendScale.innerHTML = "<span>0°C</span><span>10°C</span><span>20°C</span><span>30°C</span>";
    particleGroup.visible = true;
  } else if (variableKey === 'salinity') {
    if (legendTitle) legendTitle.innerText = "Salinity (PSU)";
    if (colorRamp) colorRamp.style.background = "linear-gradient(to right, #a0dcd2, #46a0b4, #1e508c, #501478)";
    if (legendScale) legendScale.innerHTML = "<span>32</span><span>34</span><span>35.5</span><span>37 PSU</span>";
    particleGroup.visible = false;
  } else if (variableKey === 'currents') {
    if (legendTitle) legendTitle.innerText = "Current Velocity (m/s)";
    if (colorRamp) colorRamp.style.background = "linear-gradient(to right, #03045e, #0077b6, #00b4d8, #90e0ef)";
    if (legendScale) legendScale.innerHTML = "<span>0.0</span><span>0.3</span><span>0.8</span><span>1.5 m/s</span>";
    particleGroup.visible = true;
  } else if (variableKey === 'ssh') {
    if (legendTitle) legendTitle.innerText = "Sea Surface Height (m)";
    if (colorRamp) colorRamp.style.background = "linear-gradient(to right, #1450dc, #f0f0f0, #dc1414)";
    if (legendScale) legendScale.innerHTML = "<span>-0.5m</span><span>0.0m</span><span>+0.5m</span>";
    particleGroup.visible = false;
  }

  drawOceanField(currentDepth, currentVariable);
  if (activeFloatData) openArgoProfile(activeFloatData);
}

async function setDepth(val, targetEl) {

  currentDepth = parseFloat(val);

  const slider = document.getElementById("depth-slider");
  const display = document.getElementById("depth-val-display");

  if (slider) {
    slider.value = currentDepth;
  }

  if (display) {
    display.innerText = `${currentDepth} m`;
  }


  // Highlight selected depth card
  if (targetEl) {

    document
      .querySelectorAll(".slice-card")
      .forEach(el => el.classList.remove("active"));

    targetEl.classList.add("active");
  }


  // Load real Copernicus data for the selected depth
  await drawOceanField(
    currentDepth,
    currentVariable
  );
}
const sliderEl = document.getElementById("depth-slider");

if (sliderEl) {

  sliderEl.addEventListener("change", (e) => {

    setDepth(
      e.target.value
    );

  });

}
function setGlobeOrientation(rotY, rotX) {
  earthMesh.rotation.y = rotY;
  earthMesh.rotation.x = rotX;
  oceanOverlayMesh.rotation.y = rotY;
  oceanOverlayMesh.rotation.x = rotX;
  particleGroup.rotation.y = rotY;
  particleGroup.rotation.x = rotX;
  pinGroup.rotation.y = rotY;
  pinGroup.rotation.x = rotX;
}

// Orient toward Indian Ocean / India
setGlobeOrientation(3.65, 0.0);
drawOceanField(5, 'temp');
loadArgoFloats();

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  if (particleGroup.visible) {
    streamlines.forEach(stream => stream.update());
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});