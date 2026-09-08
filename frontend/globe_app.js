const container = document.getElementById("globe-container");
let profileChart = null;
let currentDepth = 100;
let currentVariable = 'temp';
let activeFloatData = { id: "12345", name: "Argo Float #12345", lat: 15.2, lon: 72.4 };

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

function drawOceanField(depth, variable) {
  ctx.clearRect(0, 0, oceanCanvas.width, oceanCanvas.height);
  const center = latLonToCanvasPixel(10.0, 75.0);
  const radiusX = 260;
  const radiusY = 160;

  const grad = ctx.createRadialGradient(center.x, center.y, 20, center.x, center.y, radiusX);

  if (variable === 'salinity') {
    grad.addColorStop(0, "rgba(80, 20, 120, 0.85)");
    grad.addColorStop(0.5, "rgba(30, 80, 140, 0.75)");
    grad.addColorStop(0.8, "rgba(70, 160, 180, 0.5)");
    grad.addColorStop(1, "rgba(160, 220, 210, 0)");
  } else if (variable === 'ssh') {
    grad.addColorStop(0, "rgba(220, 20, 20, 0.8)");
    grad.addColorStop(0.5, "rgba(240, 240, 240, 0.4)");
    grad.addColorStop(0.8, "rgba(20, 80, 220, 0.7)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  } else if (variable === 'currents') {
    grad.addColorStop(0, "rgba(0, 180, 216, 0.65)");
    grad.addColorStop(0.6, "rgba(0, 119, 182, 0.4)");
    grad.addColorStop(1, "rgba(3, 4, 94, 0)");
  } else {
    if (depth <= 50) {
      grad.addColorStop(0, "rgba(255, 40, 0, 0.85)");
      grad.addColorStop(0.5, "rgba(255, 180, 0, 0.75)");
      grad.addColorStop(0.8, "rgba(0, 220, 180, 0.5)");
      grad.addColorStop(1, "rgba(0, 30, 120, 0)");
    } else if (depth <= 200) {
      grad.addColorStop(0, "rgba(255, 120, 0, 0.8)");
      grad.addColorStop(0.5, "rgba(0, 200, 180, 0.6)");
      grad.addColorStop(1, "rgba(0, 20, 90, 0)");
    } else {
      grad.addColorStop(0, "rgba(0, 110, 255, 0.7)");
      grad.addColorStop(0.7, "rgba(0, 20, 80, 0.4)");
      grad.addColorStop(1, "rgba(0, 5, 30, 0)");
    }
  }

  ctx.save();
  ctx.scale(1, radiusY / radiusX);
  ctx.beginPath();
  ctx.arc(center.x, center.y * (radiusX / radiusY), radiusX, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  oceanTexture.needsUpdate = true;
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
    this.lon += (u * 0.4) + (Math.sin(this.life * 0.1) * 0.05);
    this.lat += (v * 0.4) + (Math.cos(this.life * 0.1) * 0.05);

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
const argoData = [
  { id: "12345", name: "Argo Float #12345", lat: 15.2, lon: 72.4 },
  { id: "12346", name: "Argo Float #12346", lat: 12.0, lon: 86.5 },
  { id: "12347", name: "Argo Float #12347", lat: -3.0, lon: 68.0 }
];

const pinGroup = new THREE.Group();
scene.add(pinGroup);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

argoData.forEach(float => {
  const pos = latLonToVector3(float.lat, float.lon, RADIUS + 0.12);
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  pin.position.copy(pos);
  pin.userData = float;
  pinGroup.add(pin);
});

window.addEventListener("click", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pinGroup.children);
  if (hits.length > 0) openArgoProfile(hits[0].object.userData);
});

// --- 6. Chart.js In-situ vs Model Comparison with Safe Fallbacks ---
async function openArgoProfile(float) {
  activeFloatData = float;
  
  const detailPanel = document.getElementById("detail-panel");
  if (detailPanel) detailPanel.style.display = "block";

  const floatNameEl = document.getElementById("float-name");
  const floatLocEl = document.getElementById("float-loc");
  if (floatNameEl) floatNameEl.innerText = float.name;
  if (floatLocEl) floatLocEl.innerText = `${float.lat}° N, ${float.lon}° E`;

  // Default fallback data in case the backend is offline
  let depths = [0, 10, 20, 30, 50, 75, 100];
  let modelVals = [29.1, 28.8, 28.2, 27.4, 25.1, 23.0, 21.2];
  let argoVals  = [29.3, 28.6, 28.4, 27.1, 25.5, 22.8, 21.5];
  let unit = "°C";

  // Attempt to fetch live NetCDF data from FastAPI backend
  try {
    const res = await fetch(`http://127.0.0.1:8000/api/validate-profile?lat=${float.lat}&lon=${float.lon}`);
    if (res.ok) {
      const data = await res.json();
      depths = data.depths;
      modelVals = data.model_values;
      argoVals = data.observed_values;
      unit = data.unit || "°C";
    }
  } catch (err) {
    console.warn("Backend API unavailable, using offline profile data.", err);
  }

  // Populate comparison table
  const tbody = document.getElementById("val-tbody");
  if (tbody) {
    tbody.innerHTML = "";
    for (let i = 0; i < depths.length; i++) {
      const diff = (argoVals[i] - modelVals[i]).toFixed(2);
      const sign = diff >= 0 ? `+${diff}` : diff;
      tbody.innerHTML += `
        <tr>
          <td>${depths[i]}</td>
          <td>${modelVals[i]}</td>
          <td>${argoVals[i]}</td>
          <td style="color:${diff >= 0 ? '#4fc3f7' : '#ff8a80'}">${sign}</td>
        </tr>`;
    }
  }

  // Draw chart safely
  const canvas = document.getElementById("depthProfileChart");
  if (!canvas) {
    console.error("Canvas element #depthProfileChart not found in HTML!");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (profileChart) profileChart.destroy();

  profileChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: depths,
      datasets: [
        { label: `Argo Observed (${unit})`, data: argoVals, borderColor: "#00e5ff", borderWidth: 2, pointRadius: 3 },
        { label: `Model (${unit})`, data: modelVals, borderColor: "#ff5252", borderWidth: 2, borderDash: [4, 4], pointRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        y: { reverse: true, ticks: { color: "#cfd8dc", font: { size: 10 } }, grid: { color: "#162d4a" } },
        x: { ticks: { color: "#cfd8dc", font: { size: 10 } }, grid: { color: "#162d4a" } }
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

function setDepth(val, targetEl) {
  currentDepth = parseInt(val);
  const slider = document.getElementById("depth-slider");
  const display = document.getElementById("depth-val-display");
  if (slider) slider.value = currentDepth;
  if (display) display.innerText = `${currentDepth} m`;

  if (targetEl) {
    document.querySelectorAll(".slice-card").forEach(el => el.classList.remove("active"));
    targetEl.classList.add("active");
  }

  drawOceanField(currentDepth, currentVariable);
}

const sliderEl = document.getElementById("depth-slider");
if (sliderEl) {
  sliderEl.addEventListener("input", (e) => setDepth(e.target.value));
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
drawOceanField(100, 'temp');

// Load initial float profile
openArgoProfile(argoData[0]);

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