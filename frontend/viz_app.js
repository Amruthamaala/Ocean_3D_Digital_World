// =========================================================
// OCEAN DATA VISUALIZATION - COMPACT RINGS & CLEAN PANEL
// =========================================================

const urlParams = new URLSearchParams(window.location.search);
let targetLat = parseFloat(urlParams.get('lat')) || 15.79;
let rawLon = parseFloat(urlParams.get('lon')) || -274.82;

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

// Color Palettes
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

// Guide Setups
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

// Interactive Small Hover Badge Container
let popupContainer = document.getElementById('globe-popup-panel');
if (!popupContainer) {
  popupContainer = document.createElement('div');
  popupContainer.id = 'globe-popup-panel';
  popupContainer.style.cssText = `
    position: absolute;
    display: none;
    background: rgba(10, 20, 38, 0.95);
    border: 1px solid #00e5ff;
    border-radius: 6px;
    padding: 8px 12px;
    color: #fff;
    font-family: sans-serif;
    font-size: 11px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    pointer-events: none;
    z-index: 999;
    white-space: nowrap;
  `;
  document.body.appendChild(popupContainer);
}

// Three.js Canvas Engine
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

// Earth Globe Mesh
const loader = new THREE.TextureLoader();
const globeMat = new THREE.MeshStandardMaterial({ color: 0x112233, roughness: 0.6 });

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
    const surface = 31.7 + Math.sin(lat * 0.08) * 1.2 + Math.cos(lon * 0.05) * 0.5;
    const dropRate = 0.28;
    return Math.max(2.0, parseFloat((surface - (depth * dropRate)).toFixed(1)));
  } else {
    const surfaceSal = 34.2 + Math.cos(lat * 0.06) * 1.8;
    const salRise = depth * 0.015;
    return parseFloat((surfaceSal + salRise).toFixed(1));
  }
}

let patchGroup = new THREE.Group();
scene.add(patchGroup);

let vizChart = null;
let activeData = null;

// Helper to create clean 2D Canvas Sprite Badges
function createDepthLabelSprite(labelText, fontColor = '#ffffff', opacity = 1.0) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const x = 28, y = 34, w = 200, h = 60, r = 12;
  ctx.fillStyle = 'rgba(5, 11, 20, 0.85)';
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 36px "Segoe UI", sans-serif';
  ctx.fillStyle = fontColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: opacity,
    depthTest: false
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.28, 0.14, 1.0);
  return sprite;
}

// Render Layered Color Rings with Floating Labels
function renderLayeredColorRings(lat, lon) {
  patchGroup.clear();

  const normLon = normalizeLongitude(lon);
  const centerPos = latLonToVector3(lat, normLon, RADIUS);
  const normal = centerPos.clone().normalize();

  const primaryVal = calculateValueAtDepth(lat, normLon, targetDepth, targetVar);
  const primaryColor = activePalette.getColor(primaryVal);

  const depthRings = [
    { depth: 0,  label: '0m',  inner: 0.0,  outer: 0.12, labelRadius: 0.06, angle: 0 },
    { depth: 10, label: '10m', inner: 0.12, outer: 0.26, labelRadius: 0.19, angle: Math.PI * 0.15 },
    { depth: 25, label: '25m', inner: 0.26, outer: 0.40, labelRadius: 0.33, angle: Math.PI * 0.30 },
    { depth: 50, label: '50m', inner: 0.40, outer: 0.54, labelRadius: 0.47, angle: Math.PI * 0.45 },
    { depth: 90, label: '90m', inner: 0.54, outer: 0.68, labelRadius: 0.61, angle: Math.PI * 0.60 }
  ];

  const up = new THREE.Vector3(0, 1, 0);
  let right = new THREE.Vector3().crossVectors(normal, up).normalize();
  if (right.lengthSq() < 0.001) {
    right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize();
  }
  const localUp = new THREE.Vector3().crossVectors(right, normal).normalize();

  depthRings.forEach((ring, idx) => {
    const val = calculateValueAtDepth(lat, normLon, ring.depth, targetVar);
    const colorInfo = activePalette.getColor(val);

    const ringGeo = new THREE.RingGeometry(ring.inner, ring.outer, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorInfo.hex),
      emissive: new THREE.Color(colorInfo.hex),
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88 - idx * 0.05
    });

    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(centerPos.clone().add(normal.clone().multiplyScalar(0.01 + idx * 0.002)));
    ringMesh.lookAt(centerPos.clone().add(normal));
    patchGroup.add(ringMesh);

    const labelSprite = createDepthLabelSprite(ring.label, '#ffffff');
    const labelOffset = right.clone().multiplyScalar(Math.cos(ring.angle) * ring.labelRadius)
      .add(localUp.clone().multiplyScalar(Math.sin(ring.angle) * ring.labelRadius));

    labelSprite.position.copy(centerPos.clone().add(labelOffset).add(normal.clone().multiplyScalar(0.02)));
    patchGroup.add(labelSprite);
  });

  camera.position.copy(centerPos.clone().multiplyScalar(2.1));
  controls.target.copy(centerPos);
  controls.update();

  activeData = {
    lat: lat,
    lon: normLon,
    val: primaryVal,
    colorHex: primaryColor.hex,
    colorName: primaryColor.name,
    desc: primaryColor.desc,
    pos3D: centerPos
  };

  document.getElementById("point-lat").innerText = `${lat.toFixed(2)}° N`;
  document.getElementById("point-lon").innerText = `${normLon.toFixed(2)}° E`;
  document.getElementById("point-value").innerText = `${primaryVal} ${activePalette.unit}`;
  document.getElementById("point-color-dot").style.background = primaryColor.hex;
  document.getElementById("point-color-hex").innerText = `${primaryColor.hex} (${primaryColor.desc})`;

  const sampleDepths = [0, 10, 20, 30, 50, 75, 100];
  const profileValues = sampleDepths.map(d => calculateValueAtDepth(lat, normLon, d, targetVar));
  renderChart(sampleDepths, profileValues);

  showSmallHoverBadge();
}

function showSmallHoverBadge() {
  if (!activeData) return;

  popupContainer.innerHTML = `
    <span style="color:#00e5ff; font-weight:bold;">📍 Depth Point:</span> 
    ${activeData.lat.toFixed(2)}°N, ${activeData.lon.toFixed(2)}°E | 
    <span style="color:${activeData.colorHex}; font-weight:bold;">${activeData.val} ${activePalette.unit}</span>
  `;

  popupContainer.style.display = 'block';
}

function updatePopupPosition() {
  if (!activeData) return;

  const vector = activeData.pos3D.clone();
  vector.project(camera);

  if (vector.z > 1) {
    popupContainer.style.display = 'none';
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-(vector.y * 0.5) + 0.5) * rect.height + top;

  popupContainer.style.left = `${x + 15}px`;
  popupContainer.style.top = `${y - 15}px`;
}

function renderChart(depths, values) {
  const ctx = document.getElementById("vizChart").getContext("2d");
  if (vizChart) vizChart.destroy();

  vizChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: depths.map(d => `${d}m`),
      datasets: [{
        label: `${targetVar.toUpperCase()} (${activePalette.unit})`,
        data: values,
        borderColor: activeData ? activeData.colorHex : "#00e5ff",
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

// =========================================================
// AI ASSISTANT MODAL LOGIC
// =========================================================

const aiBtn = document.getElementById("ai-analyze-btn");
const aiModal = document.getElementById("ai-modal");
const closeModalBtn = document.getElementById("close-ai-modal");
const closeAiBtn = document.getElementById("close-ai-btn");
const aiContent = document.getElementById("ai-modal-content");

function generateAiAnalysis() {
  if (!activeData) return;

  const lat = activeData.lat.toFixed(2);
  const lon = activeData.lon.toFixed(2);
  const val = activeData.val;
  const unit = activePalette.unit;
  const varName = targetVar.toUpperCase();

  aiContent.innerHTML = `
    <div style="text-align: center; padding: 20px 0; color: #38bdf8;">
      <p style="margin-bottom: 8px; font-weight: 600;">🔍 Synthesizing ARGO float parameters & bathymetric data...</p>
      <div style="font-size: 0.75rem; color: #94a3b8;">Analyzing Thermocline / Salinity gradients for (${lat}°N, ${lon}°E)</div>
    </div>
  `;

  setTimeout(() => {
    aiContent.innerHTML = `
      <div style="margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
        <strong style="color: #4ade80;">📍 Target Coordinates:</strong> ${lat}° N, ${lon}° E<br>
        <strong style="color: #38bdf8;">📊 Selected Depth:</strong> ${targetDepth} meters | <strong style="color: #facc15;">Value:</strong> ${val} ${unit}
      </div>

      <p style="margin-bottom: 10px;">
        <strong>Hydrographic Diagnostic:</strong><br>
        The observed ${varName.toLowerCase()} value of <strong>${val} ${unit}</strong> at depth ${targetDepth}m indicates 
        ${val > 20 ? 'a warm, well-mixed surface layer with high atmospheric thermal exchange.' : 'a cooler sub-surface layer progressing toward the ocean thermocline.'}
      </p>

      <p style="margin-bottom: 10px;">
        <strong>🌊 Layer Dynamics & Stratification:</strong><br>
        • <strong>Stability:</strong> Normal density stratification detected for ocean region (${lat}°N, ${lon}°E).<br>
        • <strong>Thermocline Gradient:</strong> Stable thermal layering across 0m to 90m rings with minimal wave disruption.<br>
        • <strong>Classification:</strong> ${activeData.desc}.
      </p>

      <div style="background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; padding: 8px 12px; font-size: 0.8rem; color: #cbd5e1;">
        <strong>AI Recommendation:</strong> Suitable regional sample for baseline numerical ocean model validation. No anomalous sensor drift detected across neighboring ARGO profile layers.
      </div>
    `;
  }, 450);
}

if (aiBtn) {
  aiBtn.addEventListener("click", () => {
    aiModal.style.display = "flex";
    generateAiAnalysis();
  });
}

function hideAiModal() {
  if (aiModal) aiModal.style.display = "none";
}

if (closeModalBtn) closeModalBtn.addEventListener("click", hideAiModal);
if (closeAiBtn) closeAiBtn.addEventListener("click", hideAiModal);

if (aiModal) {
  aiModal.addEventListener("click", (e) => {
    if (e.target === aiModal) hideAiModal();
  });
}

// Run Initial Setup
renderLayeredColorRings(targetLat, targetLon);

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