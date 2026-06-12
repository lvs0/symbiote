// Symbiote — Simulateur 3D d'ordinateurs symbiotiques
// Auteur: Zoe pour Lévy · 12 juin 2026
// Three.js + dataflow asynchrone pour explorer 4 prototypes matériels.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ─────────────────────────────────────────────
// État global
// ─────────────────────────────────────────────
const state = {
  proto: 'silicium',
  ram: 16,
  cpu: 8,
  gpu: 15,
  io: 4,
  running: true,
  highlight: null,
  graph: null,
};

const COLORS = {
  ram: 0x4dd0ff,
  cpu: 0xffd54d,
  gpu: 0xff5a8a,
  io:  0xb288ff,
  bus: 0x00ffd2,
  bg:  0x07080d,
};

// ─────────────────────────────────────────────
// Helper: métriques instantanées
// ─────────────────────────────────────────────
function compute() {
  const { ram, cpu, gpu, io } = state;
  let latency, parallel, tflops, efficiency, baseLat;
  switch (state.proto) {
    case 'silicium':
      baseLat = 12;
      latency = Math.max(2, baseLat - Math.log2(ram) * 0.8 + io * 0.4);
      parallel = Math.min(cpu * 1.4, 96);
      tflops = gpu * (1 + Math.log2(ram) / 8);
      efficiency = Math.min(95, 60 + Math.log2(cpu + 1) * 5 - io * 0.5);
      break;
    case 'decentralise':
      baseLat = 18;
      latency = Math.max(2, baseLat - Math.log2(ram) * 1.2 + io * 0.6);
      parallel = Math.min(cpu * 1.8, 128);
      tflops = gpu * (1 + Math.log2(ram) / 6);
      efficiency = Math.min(90, 55 + Math.log2(cpu + 1) * 6 - io * 0.8);
      break;
    case 'hbm':
      baseLat = 6;
      latency = Math.max(1, baseLat - Math.log2(ram) * 1.4 + io * 0.2);
      parallel = Math.min(cpu * 1.2, 80);
      tflops = gpu * (1 + Math.log2(ram) / 4);
      efficiency = Math.min(98, 70 + Math.log2(cpu + 1) * 4 - io * 0.3);
      break;
    case 'neuromorph':
      baseLat = 4;
      latency = Math.max(0.5, baseLat - Math.log2(ram) * 1.6 + io * 0.15);
      parallel = Math.min(cpu * 2.4, 256);
      tflops = gpu * (1 + Math.log2(ram) / 5);
      efficiency = Math.min(99, 75 + Math.log2(cpu + 1) * 3 - io * 0.2);
      break;
  }
  return {
    latency: latency.toFixed(1),
    parallel: parallel.toFixed(0),
    tflops: tflops.toFixed(1),
    efficiency: efficiency.toFixed(0),
  };
}

// ─────────────────────────────────────────────
// Génération du graphe (dataflow)
// ─────────────────────────────────────────────
function makeGraph(proto) {
  // Nettoyer l'ancien
  if (state.graph) {
    state.graph.group.parent?.remove(state.graph.group);
    state.graph.nodes.forEach(n => {
      n.mesh.geometry.dispose();
      n.mesh.material.dispose();
    });
    state.graph.edges.forEach(e => {
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    });
  }

  const group = new THREE.Group();
  scene.add(group);

  let nodes = [];
  let edges = [];

  // -------- helpers visuels --------
  const mat = (color, emissive = 0.0, opacity = 1.0) => new THREE.MeshStandardMaterial({
    color, emissive, transparent: opacity < 1.0, opacity,
    metalness: 0.4, roughness: 0.3,
  });
  const geom = (rad, seg = 24) => new THREE.SphereGeometry(rad, seg, seg);
  const cubeGeom = (s) => new THREE.BoxGeometry(s, s, s);

  // -------- Prototypes --------
  if (proto === 'silicium') {
    // Plaque de silicium centrale + composants intégrés
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.3, 8),
      new THREE.MeshStandardMaterial({
        color: 0x223322, emissive: 0x002211, metalness: 0.8, roughness: 0.2,
      })
    );
    group.add(plate);

    // Réseau de nœuds interconnectés directement sur la plaque
    const positions = [
      [-3, 0.5, -3, 'cpu'], [-1, 0.5, -2, 'cpu'],  [1, 0.5, -3, 'ram'],
      [ 3, 0.5,  2, 'ram'], [-2, 0.5,  3, 'gpu'],  [2, 0.5, 3, 'io'],
      [ 0, 0.5,  0, 'cpu'], [-3, 0.5,  1, 'ram'],  [3, 0.5, -1, 'io'],
    ];
    positions.forEach(([x, y, z, type]) => {
      const color = COLORS[type];
      const radius = type === 'cpu' ? 0.5 : 0.35;
      const mesh = new THREE.Mesh(geom(radius), mat(color, color, 0.95));
      mesh.position.set(x, y, z);
      group.add(mesh);
      nodes.push({ mesh, type, label: type.toUpperCase() });
    });
    // Connexions maillées (bus silicium)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.random() > 0.55) {
          edges.push(makeEdge(nodes[i].mesh, nodes[j].mesh, group, COLORS.bus, 0.35));
        }
      }
    }
  }

  else if (proto === 'decentralise') {
    // Sphère de nœuds autonomes reliés en mesh
    const N = 18;
    const positions = [];
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r = 3.5;
      positions.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      ));
    }
    const types = ['cpu','cpu','cpu','ram','ram','gpu','gpu','io','io'];
    positions.forEach((p, i) => {
      const type = types[i % types.length];
      const color = COLORS[type];
      const radius = type === 'gpu' ? 0.5 : 0.3;
      const mesh = new THREE.Mesh(geom(radius), mat(color, color * 0.4, 0.95));
      mesh.position.copy(p);
      group.add(mesh);
      nodes.push({ mesh, type, label: type.toUpperCase() });
    });
    // mesh full connectivity si distance < seuil
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = nodes[i].mesh.position.distanceTo(nodes[j].mesh.position);
        if (d < 4.0) edges.push(makeEdge(nodes[i].mesh, nodes[j].mesh, group, COLORS.bus, 0.25));
      }
    }
  }

  else if (proto === 'hbm') {
    // Stack vertical de HBM (mémoire empilée)
    const stacks = [
      { x: 0, z: 0, isHbm: true },
      { x: -2.5, z: 0, isHbm: true },
      { x: 2.5,  z: 0, isHbm: true },
    ];
    stacks.forEach(s => {
      for (let i = 0; i < 6; i++) {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.18, 1.6),
          mat(COLORS.ram, COLORS.ram * 0.3, 0.9)
        );
        slab.position.set(s.x, 0.5 + i * 0.22, s.z);
        group.add(slab);
        if (i === 0) {
          nodes.push({ mesh: slab, type: 'ram', label: `HBM-${stacks.indexOf(s)+1}` });
        }
      }
    });
    // GPU au sommet de la pile centrale
    const gpu = new THREE.Mesh(cubeGeom(1.5), mat(COLORS.gpu, COLORS.gpu * 0.4, 0.95));
    gpu.position.set(0, 2.5, 0);
    group.add(gpu);
    nodes.push({ mesh: gpu, type: 'gpu', label: 'GPU die' });
    // CPU nearby
    const cpu = new THREE.Mesh(cubeGeom(1.2), mat(COLORS.cpu, COLORS.cpu * 0.4, 0.95));
    cpu.position.set(-4.5, 0.8, 0);
    group.add(cpu);
    nodes.push({ mesh: cpu, type: 'cpu', label: 'CPU' });
    nodes.push({ mesh: cpu, type: 'cpu', label: 'CPU' });
    // Connexions verticales (TSV)
    nodes.forEach(n => edges.push(makeEdge(n.mesh, gpu, group, COLORS.bus, 0.6)));
  }

  else if (proto === 'neuromorph') {
    // Réseau de "neurones" — points reliés par pulses
    const N = 32;
    const fibers = [];
    for (let i = 0; i < N; i++) {
      const r = (i % 3 === 0) ? 4.0 : 2.6;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      const z = r * Math.cos(phi) * 0.8;
      const m = new THREE.Mesh(geom(0.13), mat(COLORS.io, COLORS.io * 0.5, 0.95));
      m.position.set(x, y, z);
      group.add(m);
      nodes.push({ mesh: m, type: 'io', label: `SN${i}` });
    }
    // Connexions plus denses
    for (let i = 0; i < nodes.length; i++) {
      const nearest = nodes
        .map((n,j)=>({j,d:n.mesh.position.distanceTo(nodes[i].mesh.position)}))
        .filter(o=>o.j!==i)
        .sort((a,b)=>a.d-b.d).slice(0,3);
      nearest.forEach(({j}) => {
        if (j > i) edges.push(makeEdge(nodes[i].mesh, nodes[j].mesh, group, COLORS.bus, 0.5));
      });
    }
  }

  state.graph = { group, nodes, edges };

  // Durée de pulse proportionnelle au nombre de nœuds
  updateMetrics();
}

// ─────────────────────────────────────────────
// Création d'un edge (ligne entre 2 nœuds)
// ─────────────────────────────────────────────
function makeEdge(a, b, group, color, opacity) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    a.position.clone(),
    b.position.clone(),
  ]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  group.add(line);
  return { mesh: line, a, b };
}

// ─────────────────────────────────────────────
// Scene / Render / Camera
// ─────────────────────────────────────────────
const host = document.getElementById('canvas-host');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(COLORS.bg, 0.045);

const camera = new THREE.PerspectiveCamera(48, host.clientWidth / host.clientHeight, 0.1, 1000);
camera.position.set(6, 5, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
host.appendChild(renderer.domElement);

// Post-process bloom léger
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(host.clientWidth, host.clientHeight),
  0.85, // strength
  0.55, // radius
  0.65  // threshold
);
composer.addPass(bloom);

// Contrôles orbit
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

// Lumières
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const dirLight = new THREE.DirectionalLight(0x00ffd2, 0.8);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xff3d8c, 0.5);
dirLight2.position.set(-5, 3, -3);
scene.add(dirLight2);

// Grille en arrière-plan
const grid = new THREE.GridHelper(40, 60, COLORS.bus, 0x1a2030);
grid.position.y = -4;
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

// Halo central
const halo = new THREE.Mesh(
  new THREE.RingGeometry(7, 9, 64),
  new THREE.MeshBasicMaterial({ color: COLORS.bus, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
);
halo.rotation.x = -Math.PI / 2;
halo.position.y = -3.9;
scene.add(halo);

// Étoiles
{
  const geo = new THREE.BufferGeometry();
  const N = 400;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    positions[i*3] = (Math.random()-0.5) * 200;
    positions[i*3+1] = (Math.random()-0.5) * 200;
    positions[i*3+2] = (Math.random()-0.5) * 200;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(geo, m));
}

// ─────────────────────────────────────────────
// Interaction: clic sur nœud
// ─────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  if (!state.graph) return;
  const meshes = state.graph.nodes.map(n => n.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) {
    const target = hits[0].object;
    state.highlight = target;
    target.scale.set(1.6, 1.6, 1.6);
    setTimeout(() => { target.scale.set(1,1,1); }, 400);
  }
});

// ─────────────────────────────────────────────
// Pulse des arêtes (dataflow simulé)
// ─────────────────────────────────────────────
function tickEdges(t) {
  if (!state.graph || !state.running) return;
  state.graph.edges.forEach((e, i) => {
    const phase = (t * 0.0015 + i * 0.31) % 1;
    const opacityBase = (state.highlight && (e.a === state.highlight || e.b === state.highlight)) ? 0.9 : 0.35;
    e.mesh.material.opacity = opacityBase * (0.4 + 0.6 * Math.sin(phase * Math.PI * 2));
  });

  state.graph.nodes.forEach((n, i) => {
    if (!state.running) return;
    const phase = (t * 0.002 + i * 0.27) % 1;
    const baseScale = 1.0;
    n.mesh.scale.setScalar(baseScale + 0.05 * Math.sin(phase * Math.PI * 2));
  });
}

// ─────────────────────────────────────────────
// FPS / Nodes HUD
// ─────────────────────────────────────────────
let fps = 0, frames = 0, fpsT0 = performance.now();
function updateHUD() {
  frames++;
  const now = performance.now();
  if (now - fpsT0 > 500) {
    fps = (frames / (now - fpsT0)) * 1000;
    document.getElementById('fps').textContent = `FPS: ${fps.toFixed(0)}`;
    document.getElementById('nodes').textContent = `Nodes: ${state.graph?.nodes.length ?? 0}`;
    frames = 0; fpsT0 = now;
  }
}

function updateMetrics() {
  const m = compute();
  document.getElementById('m-latency').textContent = m.latency;
  document.getElementById('m-parallel').textContent = m.parallel;
  document.getElementById('m-tflops').textContent = m.tflops;
  document.getElementById('m-eff').textContent = m.efficiency;
}

// ─────────────────────────────────────────────
// Animation loop
// ─────────────────────────────────────────────
let t = 0;
function animate(now) {
  requestAnimationFrame(animate);
  t = now;
  if (state.running) tickEdges(t);
  controls.update();
  composer.render();
  updateHUD();
}

// ─────────────────────────────────────────────
// Resize
// ─────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  composer.setSize(host.clientWidth, host.clientHeight);
});

// ─────────────────────────────────────────────
// UI bindings
// ─────────────────────────────────────────────
const sliders = ['ram','cpu','gpu','io'];
sliders.forEach(id => {
  const el = document.getElementById(id);
  const lbl = document.getElementById(id + '-val');
  el.addEventListener('input', () => {
    state[id] = parseInt(el.value, 10);
    lbl.textContent = el.value;
    updateMetrics();
  });
});

document.querySelectorAll('#proto-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#proto-buttons button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.proto = btn.dataset.proto;
    makeGraph(state.proto);
  });
});

document.getElementById('btn-pause').addEventListener('click', (e) => {
  state.running = !state.running;
  e.target.textContent = state.running ? 'Pause' : 'Reprendre';
});

document.getElementById('btn-reset').addEventListener('click', () => {
  state.ram = 16; state.cpu = 8; state.gpu = 15; state.io = 4;
  ['ram','cpu','gpu','io'].forEach(id => {
    document.getElementById(id).value = state[id];
    document.getElementById(id + '-val').textContent = state[id];
  });
  makeGraph(state.proto);
});

document.getElementById('btn-simulate').addEventListener('click', () => {
  state.highlight = null;
  // pulse tous les nodes
  state.graph.nodes.forEach((n, i) => {
    setTimeout(() => {
      n.mesh.scale.setScalar(1.8);
      setTimeout(() => n.mesh.scale.setScalar(1.0), 250);
    }, i * 35);
  });
});

// Init
makeGraph(state.proto);
animate(performance.now());
