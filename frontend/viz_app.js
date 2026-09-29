// =========================================================
// OCEAN DATA VISUALIZATION - COLOR PALETTE OVERLAY & ANALYSIS
// =========================================================

const urlParams = new URLSearchParams(window.location.search);
let targetLat = parseFloat(urlParams.get('lat')) || 14.28;
let rawLon = parseFloat(urlParams.get('lon')) || -274.62;

function normalizeLongitude(lon) {
  let normalized = ((lon + 180) % 360);
  if (normalized < 0) normalized += 360;
  return normalized - 180;
}

const targetLon = normalizeLongitude(rawLon);
const targetDepth = parseFloat(urlParams.get('depth')) || 0;
const targetVar = urlParams.get('var') || 'temperature';

document.getElementById('selected-depth').innerText = `${targetDepth} m`;
document.getElementById('selected-var').innerText = targetVar.toUpperCase();

// Color Palettes Setup
const PALETTES = {
  temperature: {
    title: "Temperature Color Scale (°C)",
    ramp: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000, #8b0000)",
    min: "0°C", mid: "15°C", max: "30°C", unit: "°C",
    getColor: (val) => {
      const norm = Math.min(Math.max(val / 30.0, 0), 1);
      if (norm > 0.85) return { hex: "#8b0000", name: "Dark Red", desc: "Warmest Layer (> 26°C)" };
      if (norm > 0.70) return { hex: "#ff0000", name: "Red", desc: "Warm Region (21°C - 26°C)" };
      if (norm > 0.50) return { hex: "#ffff00", name: "Yellow", desc: "Moderate (16°C - 21°C)" };
      if (norm > 0.30) return { hex: "#00ff00", name: "Green", desc: "Cool Thermocline (11°C - 16°C)" };
      if (norm > 0.15) return { hex: "#00ffff", name: "Cyan", desc: "Chilly Layer (5°C - 11°C)" };
      return { hex: "#0000ff", name: "Blue", desc: "Deep Cold Layer (< 5°C)" };
    },
    guideItems: [
      { color: "#8b0000", label: "Dark Red: Warmest Shallow (> 26°C)" },
      { color: "#ff0000", label: "Red: Warm Region (21°C - 26°C)" },
      { color: "#ffff00", label: "Yellow: Moderate (16°C - 21°C)" },
      { color: "#00ff00", label: "Green: Cool Thermocline (11°C - 16°C)" },
      { color: "#0000ff", label: "Blue: Deep Cold Layer (< 5°C)" }
    ]
  },
  salinity: {
    title: "Salinity Color Scale (PSU)",
    ramp: "linear-gradient(to right, #a0dcd2, #46a0b4, #1e508c, #501478)",
    min: "32 PSU", mid: "35 PSU", max: "38 PSU", unit: "PSU",
    getColor: (sal) => {
      const norm = Math.min(Math.max((sal - 32) / 6.0, 0), 1);
      if (norm > 0.75) return { hex: "#501478", name: "Dark Purple", desc: "High Salinity (> 36.5 PSU)" };
      if (norm > 0.50) return { hex: "#1e508c", name: "Dark Blue", desc: "Standard Salinity (35 - 36.5 PSU)" };
      if (norm > 0.25) return { hex: "#46a0b4", name: "Cyan", desc: "Low Salinity Zone (33.5 - 35 PSU)" };
      return { hex: "#a0dcd2", name: "Teal", desc: "Freshwater Diluted (< 33.5 PSU)" };
    },
    guideItems: [
      { color: "#501478", label: "Dark Purple: High Salinity (> 36.5 PSU)" },
      { color: "#1e508c", label: "Dark Blue: Standard Marine (35.0 - 36.5 PSU)" },
      { color: "#46a0b4", label: "Cyan: Low Salinity Zone (33.5 - 35.0 PSU)" },
      { color: "#a0dcd2", label: "Teal: Diluted Zone (< 33.5 PSU)" }
    ]
  }
};

const activePalette = PALETTES[targetVar] || PALETTES.temperature;

// Side Panel UI Guide Setup
document.getElementById('color-panel-title').innerText = activePalette.title;
document.getElementById('color-scale-bar').style.background = activePalette.ramp;
document.getElementById('scale-min').innerText = activePalette.min;
document.getElementById('scale-mid').innerText = activePalette.mid;
document.getElementById('scale-max').innerText = activePalette.max;

const guideList = document.getElementById('color-description-list');
if (guideList) {
  guideList.innerHTML = "";
  activePalette.guideItems.forEach(item => {
    guideList.innerHTML += `
      <li>
        <span class="color-dot" style="background: ${item.color};"></span>
        <span>${item.label}</span>
      </li>
    `;
  });
}

// Popup Overlay Container Setup (Positioned without covering point)
let popupContainer = document.getElementById('globe-popup-panel');
if (!popupContainer) {
  popupContainer = document.createElement('div');
  popupContainer.id = 'globe-popup-panel';
  popupContainer.style.cssText = `
    position: absolute;
    display: none;
    background: rgba(8, 15, 30, 0.95);
    border: 2px solid #00e5ff;
    border-radius: 10px;
    padding: 12px 16px;
    color: #fff;
    font-family: sans-serif;
    font-size: 12px;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
    pointer-events: auto;
    z-index: 1000;
    transform: translate(15px, -50%);
  `;
  document.body.appendChild(popupContainer);
}

// Three.js Engine Setup
const container = document.getElementById("viz-canvas-container");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(10, 15, 20);
scene.add(sunLight);

const RADIUS = 6.5;

// Earth Globe Sphere
const loader = new THREE.TextureLoader();
const globeMat = new THREE.MeshStandardMaterial({
  color: 0x112233,
  roughness: 0.6
});

loader.load(
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  (texture) => {
    globeMat.map = texture;
    globeMat.color.setHex(0xffffff);
    globeMat.needsUpdate = true;
  }
);

const globe = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 64), globeMat);
scene.add(globe);

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function calculateValueAtDepth(lat, lon, depth, variable) {
  if (variable === 'temperature') {
    const surface = 29.0 + Math.sin(lat * 0.08) * 3.5 + Math.cos(lon * 0.05) * 1.5;
    const dropRate = 0.28;
    return Math.max(2.0, parseFloat((surface - (depth * dropRate)).toFixed(1)));
  } else {
    const surfaceSal = 34.2 + Math.cos(lat * 0.06) * 1.8;
    const salRise = depth * 0.015;
    return parseFloat((surfaceSal + salRise).toFixed(1));
  }
}

let patchMesh = null;
let vizChart = null;
let activeData = null;
let isAnalysisOpen = false;

// 1. Render Palette Color Patch on Globe Surface
function renderPaletteColorPatch(lat, lon) {
  const normLon = normalizeLongitude(lon);
  const val = calculateValueAtDepth(lat, normLon, targetDepth, targetVar);
  const colorInfo = activePalette.getColor(val);

  const centerPos = latLonToVector3(lat, normLon, RADIUS);
  const normal = centerPos.clone().normalize();

  // Create Color Zone Patch on Globe Surface
  const patchGeo = new THREE.RingGeometry(0.05, 0.9, 32);
  const patchMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorInfo.hex),
    emissive: new THREE.Color(colorInfo.hex),
    emissiveIntensity: 0.7,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85
  });

  patchMesh = new THREE.Mesh(patchGeo, patchMat);
  patchMesh.position.copy(centerPos.clone().add(normal.clone().multiplyScalar(0.03)));
  patchMesh.lookAt(centerPos.clone().add(normal));
  scene.add(patchMesh);

  // Focus Camera onto the Location
  camera.position.copy(centerPos.clone().multiplyScalar(2.3));
  controls.target.copy(centerPos);
  controls.update();

  activeData = {
    lat: lat,
    lon: normLon,
    val: val,
    colorHex: colorInfo.hex,
    colorName: colorInfo.name,
    desc: colorInfo.desc,
    pos3D: centerPos
  };

  // Update Right Panel Info Initially
  document.getElementById("point-lat").innerText = `${lat}° N`;
  document.getElementById("point-lon").innerText = `${normLon}° E`;
  document.getElementById("point-value").innerText = `${val} ${activePalette.unit}`;
  document.getElementById("point-color-dot").style.background = colorInfo.hex;
  document.getElementById("point-color-hex").innerText = `${colorInfo.hex} (${colorInfo.desc})`;

  // Render Graph
  const sampleDepths = [0, 10, 20, 30, 50, 75, 100];
  const profileValues = sampleDepths.map(d => calculateValueAtDepth(lat, normLon, d, targetVar));
  renderChart(sampleDepths, profileValues);
}

// 2. Click Event on Globe Color Zone Patch
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("click", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects([patchMesh, globe]);
  if (intersects.length > 0) {
    isAnalysisOpen = true;
    showAnalysisPanel();
  }
});

function showAnalysisPanel() {
  if (!activeData) return;

  popupContainer.innerHTML = `
    <div style="font-weight: bold; color: #00e5ff; font-size:13px; margin-bottom:4px;">📊 Depth Layer Analysis</div>
    <div><strong>Coordinates:</strong> ${activeData.lat}° N, ${activeData.lon}° E</div>
    <div><strong>Selected Depth:</strong> ${targetDepth} m</div>
    <div style="margin-top: 4px;"><strong>${targetVar.toUpperCase()}:</strong> <span style="color:${activeData.colorHex}; font-weight:bold; font-size:13px;">${activeData.val} ${activePalette.unit}</span></div>
    <div style="margin-top:4px; font-size:10px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.15); padding-top:4px;">
      Color Profile: <span style="color:${activeData.colorHex};">■</span> <strong>${activeData.colorName}</strong>
    </div>
  `;

  popupContainer.style.display = 'block';
  updatePopupPosition();
}

function updatePopupPosition() {
  if (!activeData || !isAnalysisOpen) return;

  const vector = activeData.pos3D.clone();
  vector.project(camera);

  if (vector.z > 1) {
    popupContainer.style.display = 'none';
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-(vector.y * 0.5) + 0.5) * rect.height + rect.top;

  popupContainer.style.left = `${x}px`;
  popupContainer.style.top = `${y}px`;
  popupContainer.style.display = 'block';
}

function renderChart(depths, values) {
  const ctx = document.getElementById("vizChart").getContext("2d");
  if (vizChart) vizChart.destroy();

  vizChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: depths.map(d => `${d}m`),
      datasets: [{
        label: `${targetVar.toUpperCase()} Variation by Depth (${activePalette.unit})`,
        data: values,
        borderColor: activeData.colorHex,
        backgroundColor: "rgba(0, 229, 255, 0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.05)" } }
      },
      plugins: { legend: { labels: { color: "#e2e8f0" } } }
    }
  });
}

// Initial Rendering
renderPaletteColorPatch(targetLat, targetLon);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updatePopupPosition();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  updatePopupPosition();
});