// =========================================================
// 3D OCEAN DIGITAL WORLD - GLOBE APPLICATION ENGINE
// =========================================================

const container = document.getElementById("globe-container");
let profileChart = null;
let currentDepth = 0; // Starts at 0m (Surface)
let currentVariable = 'temperature';
let argoData = [];

// Dynamic Zoom Range Limits
const MIN_CAMERA_DIST = 8.5;  // Zoomed in at deep ocean
const MAX_CAMERA_DIST = 18.0; // Zoomed out at surface (0m)
const MAX_DEPTH_RANGE = 92.0; // Max depth slider range

// Color Palettes Definitions per Variable
const VARIABLE_PALETTES = {
  temperature: {
    title: "Temperature (°C)",
    ramp: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000, #8b0000)",
    minText: "0°C (Deep)",
    midText: "15°C",
    maxText: "30°C (Surface)",
    desc: "Red: Surface Warmth | Blue: Deep Cold",
    unit: "°C",
    colorRgb: (n) => {
      if (n < 0.25) return `rgb(0, ${Math.round(255 * (n / 0.25))}, 255)`;
      if (n < 0.5) return `rgb(0, 255, ${Math.round(255 * (1 - (n - 0.25) / 0.25))})`;
      if (n < 0.75) return `rgb(${Math.round(255 * ((n - 0.5) / 0.25))}, 255, 0)`;
      return `rgb(255, ${Math.round(255 * (1 - (n - 0.75) / 0.25))}, 0)`;
    }
  },
  salinity: {
    title: "Salinity Scale (PSU)",
    ramp: "linear-gradient(to right, #a0dcd2, #46a0b4, #1e508c, #501478)",
    minText: "32 PSU",
    midText: "35 PSU",
    maxText: "38 PSU",
    desc: "Purple: High Salinity | Light Teal: Low Salinity",
    unit: "PSU",
    colorRgb: (n) => `rgb(${Math.round(160 - 80 * n)}, ${Math.round(220 - 200 * n)}, ${Math.round(210 - 90 * n)})`
  },
  currents: {
    title: "Current Velocity (m/s)",
    ramp: "linear-gradient(to right, #03045e, #0077b6, #00b4d8, #90e0ef)",
    minText: "0.0 m/s",
    midText: "0.75 m/s",
    maxText: "1.5 m/s",
    desc: "Light Cyan: High Speed | Dark Blue: Calm",
    unit: "m/s",
    colorRgb: (n) => `rgb(0, ${Math.round(180 * n + 50)}, ${Math.round(200 * n + 55)})`
  }
};

if (!container) {
  console.error("Critical Error: Element #globe-container not found in HTML!");
}

// =========================================================
// 1. THREE.JS SCENE, CAMERA, & CONTROLS
// =========================================================

const scene = new THREE.Scene();
const width = container ? (container.clientWidth || window.innerWidth * 0.5) : window.innerWidth * 0.5;
const height = container ? (container.clientHeight || window.innerHeight * 0.7) : window.innerHeight * 0.7;

const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(0, 0, MAX_CAMERA_DIST);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
if (container) {
  container.appendChild(renderer.domElement);
}

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 7.5;
controls.maxDistance = 28;

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(20, 10, 20);
scene.add(sunLight);

// Interactive Hover Tooltip Popup Element
const popup = document.createElement("div");
popup.id = "globe-popup";
popup.className = "data-popup";
popup.style.display = "none";
document.body.appendChild(popup);

// =========================================================
// 2. GLOBE MESH & HEATMAP OVERLAY
// =========================================================

const RADIUS = 6.5;
const globeGeo = new THREE.SphereGeometry(RADIUS, 64, 64);
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

const earthMat = new THREE.MeshStandardMaterial({
  map: loader.load("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"),
  bumpMap: loader.load("https://unpkg.com/three-globe/example/img/earth-topology.png"),
  bumpScale: 0.12,
  roughness: 0.6,
  metalness: 0.1
});
const earthMesh = new THREE.Mesh(globeGeo, earthMat);
scene.add(earthMesh);

// Atmosphere Shader Layer
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
      gl_FragColor = vec4(0.0, 0.9, 1.0, 1.0) * intensity;
    }
  `
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS + 0.12, 64, 64), atmosphereMat));

// Focus Location Pin Marker
const focusPin = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xff0055 })
);
focusPin.visible = false;
scene.add(focusPin);

// Ocean Overlay Canvas Texture
const oceanCanvas = document.createElement("canvas");
oceanCanvas.width = 2048;
oceanCanvas.height = 1024;
const ctx = oceanCanvas.getContext("2d");
const oceanTexture = new THREE.CanvasTexture(oceanCanvas);

const oceanOverlayMat = new THREE.MeshBasicMaterial({
  map: oceanTexture,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending
});
const oceanOverlayMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS + 0.04, 64, 64), oceanOverlayMat);
scene.add(oceanOverlayMesh);

function latLonToCanvasPixel(lat, lon) {
  return {
    x: ((lon + 180) / 360) * oceanCanvas.width,
    y: ((90 - lat) / 180) * oceanCanvas.height
  };
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Draw Heatmap Field on Globe Sphere
async function drawOceanField(depth, variable) {
  ctx.clearRect(0, 0, oceanCanvas.width, oceanCanvas.height);
  const palette = VARIABLE_PALETTES[variable] || VARIABLE_PALETTES.temperature;

  try {
    const res = await fetch(`http://127.0.0.1:8000/api/temperature?depth=${depth}`);
    if (res.ok) {
      const result = await res.json();
      if (result.status === "success" && result.data) {
        const values = result.data.map(p => p.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);

        result.data.forEach(point => {
          const pixel = latLonToCanvasPixel(point.lat, point.lon);
          const norm = (point.value - minVal) / (maxVal - minVal || 1);
          ctx.fillStyle = palette.colorRgb(norm);
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(pixel.x, pixel.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  } catch (err) {
    // Fallback simulation with depth attenuation
    for (let lat = -60; lat <= 60; lat += 3) {
      for (let lon = -180; lon <= 180; lon += 3) {
        const pixel = latLonToCanvasPixel(lat, lon);
        const depthFactor = Math.max(0.1, 1 - (depth / 100));
        const norm = Math.abs(Math.sin(lat * 0.05) * Math.cos(lon * 0.05)) * depthFactor;
        
        ctx.fillStyle = palette.colorRgb(norm);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(pixel.x, pixel.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.globalAlpha = 1.0;
  oceanTexture.needsUpdate = true;
}

// =========================================================
// 3. CURRENTS & STREAMLINE PARTICLES
// =========================================================

const particleGroup = new THREE.Group();
scene.add(particleGroup);

class CurrentStreamline {
  constructor() {
    this.historyLength = 8;
    this.positions = new Float32Array(this.historyLength * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    this.line = new THREE.Line(this.geometry, this.material);
    particleGroup.add(this.line);
    this.reset();
  }

  reset() {
    this.lat = -20 + Math.random() * 50;
    this.lon = 40 + Math.random() * 60;
    this.life = 0;
    this.maxLife = 50 + Math.random() * 60;
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

    const u = Math.sin(this.lat * 0.1) * 0.2;
    const v = Math.cos(this.lon * 0.1) * 0.15;

    this.lon += u * 0.12;
    this.lat += v * 0.12;

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
for (let i = 0; i < 300; i++) streamlines.push(new CurrentStreamline());

// =========================================================
// 4. ARGO FLOATS & CLICK/HOVER INTERACTIONS
// =========================================================

const pinGroup = new THREE.Group();
scene.add(pinGroup);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function drawArgoFloats() {
  while (pinGroup.children.length > 0) {
    const pin = pinGroup.children[0];
    pin.geometry.dispose();
    pin.material.dispose();
    pinGroup.remove(pin);
  }

  argoData.forEach(float => {
    const pos = latLonToVector3(float.lat, float.lon, RADIUS + 0.12);
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ff88 })
    );
    pin.position.copy(pos);
    pin.userData = float;
    pinGroup.add(pin);
  });
}

async function loadArgoFloats() {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/argo-floats");
    if (res.ok) {
      const result = await res.json();
      if (result.status === "success") {
        argoData = result.floats;
        drawArgoFloats();
      }
    }
  } catch (e) {
    console.warn("Argo Floats offline.");
  }
}

// Replace the click event handler in globe_app_2.js around line 268:
window.addEventListener("click", (e) => {
  if (!container) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // 1. Check for clicks on Argo float markers
  const hits = raycaster.intersectObjects(pinGroup.children);
  if (hits.length > 0) {
    const float = hits[0].object.userData;
    // Navigate to visualization page with parameters
    window.location.href = `visualization.html?lat=${float.lat}&lon=${float.lon}&depth=${currentDepth}&var=${currentVariable}`;
    return;
  }

  // 2. Check for clicks on any point on the Globe surface
  const globeHits = raycaster.intersectObject(earthMesh);
  if (globeHits.length > 0) {
    const point = globeHits[0].point;
    const lat = (90 - (Math.acos(point.y / RADIUS) * 180 / Math.PI)).toFixed(2);
    const lon = (((Math.atan2(point.z, -point.x) * 180 / Math.PI) - 180)).toFixed(2);
    
    // Navigate to visualization page for the clicked coordinate
    window.location.href = `visualization.html?lat=${lat}&lon=${lon}&depth=${currentDepth}&var=${currentVariable}`;
  }
});

// Raycasting Hover for Popups
window.addEventListener("mousemove", (e) => {
  if (!container) return;
  const rect = renderer.domElement.getBoundingClientRect();
  
  if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(earthMesh);

    if (hits.length > 0) {
      const point = hits[0].point;
      const lat = (90 - (Math.acos(point.y / RADIUS) * 180 / Math.PI)).toFixed(1);
      const lon = (((Math.atan2(point.z, -point.x) * 180 / Math.PI) - 180)).toFixed(1);

      const simTemp = Math.max(2.0, 28.5 - (currentDepth * 0.22) + Math.sin(lat * 0.1) * 2);
      const simSal = 34.5 + Math.cos(lon * 0.05) * 1.2 + (currentDepth * 0.008);

      popup.style.display = "block";
      popup.style.left = `${e.clientX + 12}px`;
      popup.style.top = `${e.clientY + 12}px`;
      popup.innerHTML = `
        <div style="font-weight: bold; color: #00e5ff; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 3px; margin-bottom: 4px;">
          Depth: ${currentDepth} m (${lat}°N, ${lon}°E)
        </div>
        <div>🌡️ <strong>Temp:</strong> ${simTemp.toFixed(1)} °C</div>
        <div>💧 <strong>Salinity:</strong> ${simSal.toFixed(1)} PSU</div>
      `;
    } else {
      popup.style.display = "none";
    }
  } else {
    popup.style.display = "none";
  }
});

// =========================================================
// 5. CAMERA AUTO-ZOOM & TARGETING
// =========================================================

function updateZoomByDepth(depth) {
  const depthRatio = Math.min(Math.max(depth / MAX_DEPTH_RANGE, 0), 1);
  const targetDistance = MAX_CAMERA_DIST - (depthRatio * (MAX_CAMERA_DIST - MIN_CAMERA_DIST));

  const direction = camera.position.clone().sub(controls.target).normalize();
  const newCameraPos = controls.target.clone().add(direction.multiplyScalar(targetDistance));

  let t = 0;
  const startPos = camera.position.clone();
  
  function step() {
    t += 0.08;
    if (t <= 1) {
      camera.position.lerpVectors(startPos, newCameraPos, t);
      controls.update();
      requestAnimationFrame(step);
    }
  }
  step();
}

function focusCameraToLocation(lat, lon) {
  const targetPos = latLonToVector3(lat, lon, RADIUS);
  const cameraPos = latLonToVector3(lat, lon, 11.5);

  focusPin.position.copy(latLonToVector3(lat, lon, RADIUS + 0.15));
  focusPin.visible = true;

  let startPos = camera.position.clone();
  let startTarget = controls.target.clone();
  let t = 0;

  function stepZoom() {
    t += 0.04;
    if (t <= 1) {
      camera.position.lerpVectors(startPos, cameraPos, t);
      controls.target.lerpVectors(startTarget, targetPos, t);
      controls.update();
      requestAnimationFrame(stepZoom);
    }
  }
  stepZoom();
}

// =========================================================
// 6. PROFILE DATA RENDERING (GRAPH + COMPARISON TABLE)
// =========================================================

async function handleVisualization() {
  const lat = parseFloat(document.getElementById("lat-input").value) || 15.0;
  const lon = parseFloat(document.getElementById("lon-input").value) || 85.0;
  const date = document.getElementById("date-input").value || "2023-05-15";
  const dataset = document.getElementById("dataset-select").value;

  const activeVarBtn = document.querySelector(".var-btn.active");
  const selectedVar = activeVarBtn ? activeVarBtn.dataset.var : "temperature";

  focusCameraToLocation(lat, lon);

  if (dataset === "glider") {
    alert("Underwater Glider selected: Integration coming soon! Showing demo dataset.");
  }

  // Update Metadata
  document.getElementById("meta-loc").innerText = `${lat}° N, ${lon}° E`;
  document.getElementById("meta-dataset").innerText = dataset.toUpperCase().replace("_", " ");
  document.getElementById("meta-date").innerText = date;

  const detailPanel = document.getElementById("detail-panel");
  if (detailPanel) detailPanel.style.display = "block";

  const graphSec = document.getElementById("graph-section");
  const tableSec = document.getElementById("table-section");

  if (selectedVar === "currents") {
    if (graphSec) graphSec.style.display = "none";
    if (tableSec) tableSec.style.display = "block";

    const tbody = document.getElementById("currents-tbody");
    if (tbody) {
      tbody.innerHTML = "";
      const depths = [0, 5, 10, 20, 50, 90];
      depths.forEach(d => {
        const u = (Math.sin(lat * 0.1 + d * 0.02) * 0.4).toFixed(3);
        const v = (Math.cos(lon * 0.1 + d * 0.02) * 0.3).toFixed(3);
        const speed = Math.hypot(u, v).toFixed(3);
        tbody.innerHTML += `
          <tr>
            <td>${d} m</td>
            <td>${u}</td>
            <td>${v}</td>
            <td><strong>${speed}</strong></td>
          </tr>
        `;
      });
    }
  } else {
    if (tableSec) tableSec.style.display = "none";
    if (graphSec) graphSec.style.display = "block";

    const depths = [0, 5, 10, 20, 50, 90];
    let observed = [];
    let model = [];
    const unit = selectedVar === "temperature" ? "°C" : "PSU";

    if (selectedVar === "temperature") {
      observed = [28.5, 28.2, 27.8, 26.0, 21.4, 16.2];
      model = [28.1, 28.0, 27.5, 25.8, 21.0, 15.9];
    } else {
      observed = [34.8, 34.9, 35.0, 35.1, 35.3, 35.0];
      model = [34.7, 34.8, 34.9, 35.0, 35.2, 34.9];
    }

    renderProfileChart(depths, observed, model, selectedVar);

    const tbody = document.getElementById("val-tbody");
    if (tbody) {
      tbody.innerHTML = "";
      depths.forEach((d, i) => {
        const argoVal = observed[i];
        const modelVal = model[i];
        const diff = (argoVal - modelVal).toFixed(2);
        const diffFormatted = (diff >= 0 ? "+" : "") + diff;

        tbody.innerHTML += `
          <tr>
            <td>${d} m</td>
            <td>${argoVal} ${unit}</td>
            <td>${modelVal} ${unit}</td>
            <td style="color: ${diff >= 0 ? '#00e676' : '#ff5252'}; font-weight: bold;">${diffFormatted} ${unit}</td>
          </tr>
        `;
      });
    }
  }
}

function renderProfileChart(depths, observed, model, variableName) {
  const canvas = document.getElementById("depthProfileChart");
  if (!canvas) return;

  const ctxChart = canvas.getContext("2d");
  if (profileChart) profileChart.destroy();

  const unit = variableName === "temperature" ? "°C" : "PSU";
  document.getElementById("chart-heading").innerText = `Vertical ${variableName.toUpperCase()} Profile (${unit})`;

  profileChart = new Chart(ctxChart, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: `Argo Data (${unit})`,
          data: depths.map((d, i) => ({ x: observed[i], y: d })),
          borderColor: "#00e5ff",
          backgroundColor: "#00e5ff",
          showLine: true,
          tension: 0.3
        },
        {
          label: `Ocean Model Data (${unit})`,
          data: depths.map((d, i) => ({ x: model[i], y: d })),
          borderColor: "#ff5252",
          backgroundColor: "#ff5252",
          borderDash: [5, 5],
          showLine: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: { display: true, text: `Value (${unit})`, color: "#94a3b8" },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        },
        y: {
          type: 'linear',
          reverse: true,
          title: { display: true, text: "Depth (m)", color: "#94a3b8" },
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        }
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } }
      }
    }
  });
}

// =========================================================
// 7. VARIABLE & DEPTH CONTROLS & PALETTES
// =========================================================

function switchVariable(variableKey) {
  currentVariable = variableKey;
  const palette = VARIABLE_PALETTES[variableKey] || VARIABLE_PALETTES.temperature;

  const legendTitle = document.getElementById("legend-title");
  const colorRamp = document.getElementById("color-ramp") || document.getElementById("legend-gradient");
  const legendMin = document.getElementById("legend-min");
  const legendMid = document.getElementById("legend-mid");
  const legendMax = document.getElementById("legend-max");
  const legendDesc = document.getElementById("legend-description");

  if (legendTitle) legendTitle.innerText = palette.title;
  if (colorRamp) colorRamp.style.background = palette.ramp;
  if (legendMin) legendMin.innerText = palette.minText;
  if (legendMid) legendMid.innerText = palette.midText || "";
  if (legendMax) legendMax.innerText = palette.maxText;
  if (legendDesc) legendDesc.innerText = palette.desc;

  drawOceanField(currentDepth, currentVariable);
  handleVisualization();
}

function setDepth(depthValue, targetEl) {
  currentDepth = parseFloat(depthValue);

  const slider = document.getElementById("depth-slider");
  const display = document.getElementById("depth-val-display");

  if (slider) slider.value = currentDepth;
  if (display) display.innerText = `${currentDepth} m`;

  document.querySelectorAll(".slice-card").forEach(card => {
    if (parseFloat(card.dataset.depth) === currentDepth || card === targetEl) {
      card.classList.add("active");
    } else {
      card.classList.remove("active");
    }
  });

  updateZoomByDepth(currentDepth);
  drawOceanField(currentDepth, currentVariable);
}

function setupOverlayToggles() {
  const argoCheck = document.getElementById("check-argo");
  if (argoCheck) {
    argoCheck.addEventListener("change", (e) => {
      pinGroup.visible = e.target.checked;
    });
  }

  const currentsCheck = document.getElementById("check-currents");
  if (currentsCheck) {
    currentsCheck.addEventListener("change", (e) => {
      particleGroup.visible = e.target.checked;
    });
  }
}

// =========================================================
// 8. EVENT BINDINGS & ANIMATION LOOP
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  const btnFetch = document.getElementById("btn-fetch");
  if (btnFetch) btnFetch.addEventListener("click", handleVisualization);

  const sliderEl = document.getElementById("depth-slider");
  if (sliderEl) sliderEl.addEventListener("input", (e) => setDepth(e.target.value));

  document.querySelectorAll(".var-btn").forEach(btn => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".var-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      switchVariable(this.dataset.var);
    });
  });

  const closeBtn = document.getElementById("close-panel-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("detail-panel").style.display = "none";
    });
  }

  setupOverlayToggles();
  loadArgoFloats();

  // Initialized at Depth 0m
  setDepth(0);
  switchVariable("temperature");
});

function animate() {
  requestAnimationFrame(animate);
  streamlines.forEach(s => s.update());
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});