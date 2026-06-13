// Symbiote — Simulateur 3D d'ordinateurs symbiotiques
// Auteur: Zoe pour Lévy · 12 juin 2026 · Refactor physique 14 juin 2026
// Three.js + dataflow asynchrone pour explorer 4 prototypes matériels.
//
// PARAMÉTRAGE PHYSIQUE (sources réelles, voir REFERENCES ci-dessous):
//   HBM3 : 819 GB/s (JEDEC JESD238), 12-Hi stack, 6.4 Gbps, 1.1V (SK Hynix/Samsung)
//   WSE-3 : 125 PFLOPS, 900 000 cœurs, 21 PB/s SRAM, 44 Go on-chip (Cerebras, Mars 2024)
//   Akida2 : 0.5–16 TOPS selon nœud, 128 MACs/noeud, in-memory compute (BrainChip, Jan 2025)
//   Loihi2 : 1M neurones, 120M synapses, ~1W (Intel Labs, 2021)
//
// Références:
//   [1] JEDEC JESD238 — HBM3 Standard (Jan 2022) — 819 GB/s per stack
//   [2] Cerebras WSE-3 Datasheet (Mars 2024) — https://cdn.sanity.io/files/.../WSE-3-datasheet.pdf
//   [3] BrainChip Akida 2 Product Brief V2.0 (Jan 2025)
//   [4] Intel Loihi 2 — Open Neuromorphic — https://open-neuromorphic.org
//   [5] TechSpot "HBM3 is twice as fast as HBM2e" (Jan 2022)
//
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ─────────────────────────────────────────────
// CONSTANTES PHYSIQUES PAR PROTOTYPE
// ─────────────────────────────────────────────
//
// HBM (SK Hynix HBM3, 6.4 Gbps, 819 GB/s per stack)
//   Bande passante: 819 GB/s (8 × 1024³ octets/s, JEDEC JESD238 [1][5])
//   Latence mémoire: ~1–3 ns accès brute, ~0.8–2 ms vue système (contrôleur + queue)
//   TFLOPs GPU moderne: A100=312, H100=395, MI300X=1,307 (source publique)
//   Stack 12-Hi = 24 Go, pitch TSV < 10 µm (SK Hynix tease OCP 2021)
//
// Maillage (Cerebras WSE-3, Mars 2024 [2])
//   125 PFLOPS (900 000 cœurs tensor)
//
//   Gossip à 1 hop: ~0.5 ms (réseau on-chip WSE-3)
//
//   Consens Raft Raft round: ~(150ms heartbeat, 300–500ms election timeout / 3)
//   ≈ 100–167 ms par round de consensus nominal (plus calme qu'un vrai cluster distribué)
//
//   Nombre de nœuds: 18 (le graphe visuel), chaque nœud = ~50 000 cœurs
//   Diamètre mesh ≈ ceil(log_3(18)) = 3 hops
//   Latence mesh totale ≈ 3 hops × 0.5 ms = 1.5 ms
//
// Silicium vivant (architecture zero-copy, concept futuriste)
//   Latence zero-copy PCIe P2P: ~50–100 ns (accès DMA sans copy CPU)
//   Comparé à copy classique: ~200–400 ns (transfert + serialization)
//
// Neuromorphique (Intel Loihi 2 [4] + BrainChip Akida 2 [3])
//   Latence spike: ~1–10 µs (traversée réseau on-chip + synapse)
//   Énergie/spike: 0.1–10 pJ (Akida 2 Product Brief [3])
//   Taux spike typique: 10–1000 Hz (fréquence de tir neuronique)
//

const PROTOTYPES = {
  silicium: {
    label:    'Silicium vivant',
    // Base: latence zero-copy ~50 ns, bornée à ~95 ns en conditions réelles
    latBase:  50,    // ns
    // Log-scale: +I/O = +overhead (bus partagé, interruptions)
    // Plus de RAM = mieux cached = moins de latence (log inversé)
    latFactor: (ram, io) => 1 / (1 + Math.log2(ram / 16) * 0.4 - io * 0.025),
    // Parallelisme: cœurs physiques x simultaneous multithreading (×4 SMT)
    parallelFactor: 4,
    // GPU tflops: valeur slider (slider GPU = TFLOPs réels du GPU)
    tflopsScale: 1.0,  // 1:1 avec le slider
    // Efficience: zero-copy économe, 85–97%
    effBase:  85,
    effFactor: (cpu) => Math.log2(cpu + 1) * 2,
    effIOPenalty: 0.5,  // par unité I/O
    // --- Métadonnées de référence (affichées dans le panneau) ---
    refBandwidth: null,        // GB/s — N/A pour ce prototype
    refNetworkLat: null,       // ms — N/A
    refSpikeEnergy: null,      // pJ/spike — N/A
    refConsensus: null,        // ms — N/A
    physicalNote: 'Zero-copy P2P PCIe · ≈50 ns accès DMA',
  },
  decentralise: {
    label:    'Maillage décentralisé',
    // WSE-3: 44 Go on-chip SRAM, 21 PB/s bande passante
    // 18 nœuds dans le graphe ≈ cluster de 18 WSE-3
    // Gossip 1 hop ≈ 0.5 ms (réseau on-chip)
    // 3 hops nécessaires pour diameter 18
    latBase:  1.5,   // ms — latence mesh (diamètre graphe)
    latFactor: (ram, io) => 1 + (ram > 64 ? 0.5 : 0) + io * 0.05,
    // WSE-3 a 900 000 cœurs mais le graphe visuel montre 18 nœuds
    // Chaque nœud ≈ 50 000 cœurs (cluster réel)
    // Parallelisme = nœuds × cœurs simulés × facteur workload
    parallelFactor: 50000,
    // TFLOPs: chaque nœud apporte ~62.5 PFLOPS (125 PFLOPS / 2 pour overhead)
    tflopsPerNode: 62.5,  // PFLOPS (le slider GPU = nombre de nœuds actifs)
    tflopsScale: null,  // handled specially below
    effBase:  75,
    effFactor: (cpu) => Math.log2(cpu + 1) * 1.5,
    effIOPenalty: 1.0,
    refBandwidth: 21,        // PB/s on-chip SRAM (WSE-3)
    refNetworkLat: 0.5,      // ms per-hop (SwarmX on-wafer fabric)
    refSpikeEnergy: null,
    refConsensus: 100,       // ms — Raft heartbeat nominal
    physicalNote: 'WSE-3 · 900 000 cœurs · 21 PB/s SRAM · Gossip Raft',
  },
  hbm: {
    label:    'HBM verticale + TMFC',
    // HBM3: latence accès ~1 ns, vue système 0.8–2 ms (contrôleur JEDEC [1][5])
    latBase:  0.0008,  // ms = 0.8 µs (≈ 800 ns)
    latFactor: (ram, io) => 1 / (1 + Math.log2(ram / 16) * 0.3 - io * 0.03),
    // H100: 3 583 GB/s mais slider limité à 200 TFLOPs (valeur GPU réel A100)
    // On map slider GPU → vrai GPU TFLOPs (A100=312, H100=395)
    tflopsScale: 2.5,  // slider × 2.5 ≈ vraie perf GPU (A100 equiv)
    parallelFactor: 64,  // 64 cœurs tensor H100
    effBase:  90,
    effFactor: (cpu) => Math.log2(cpu + 1) * 3,
    effIOPenalty: 0.3,
    refBandwidth: 819,      // GB/s (HBM3, JEDEC JESD238)
    refNetworkLat: null,
    refSpikeEnergy: null,
    refConsensus: null,
    physicalNote: 'HBM3 · 819 GB/s · 12-Hi stack · Pitch TSV <10 µm',
  },
  neuromorph: {
    label:    'Neurmorphique Akida-like',
    // Loihi 2: ~1 µs spike latency; Akida 2: ~5–10 µs spike traversal
    // On prend 5 µs comme base (moyenne)
    latBase:  0.005,  // ms = 5 µs
    latFactor: (ram, io) => 1 + Math.log2(ram / 16) * 0.2 + io * 0.02,
    // Akida2: 0.5–16 TOPS selon nombre de nœuds (1–128 nodes [3])
    // Loihi2: 1M neurones, 120M synapses (~1W)
    // Slider CPU = nombre de nœuds neuromorphiques simulés
    tflopsScale: null,  // special: TOPS instead of TFLOPs
    topsPerNode: 0.5,   // Akida2 small node [3]
    parallelFactor: 8000,  // neurones par nœud (clustering)
    effBase:  92,
    effFactor: (cpu) => Math.log2(cpu + 1) * 4,
    effIOPenalty: 0.2,
    refBandwidth: null,
    refNetworkLat: null,
    refSpikeEnergy: 5,     // pJ/spike (Akida 2, BrainChip [3])
    refConsensus: null,
    physicalNote: 'Akida 2 · Loihi 2 · 1M neurones · ~5 pJ/spike',
  },
};

// ─────────────────────────────────────────────
// État global
// ─────────────────────────────────────────────
const state = {
  proto:    'silicium',
  ram:      16,   // Go — capacité mémoire
  cpu:      8,    // cœurs CPU physiques
  gpu:      15,   // TFLOPs GPU (ou TOPS pour neuromorph)
  io:       4,    // périphériques branchés
  running:  true,
  highlight:null,
  graph:    null,
};

const COLORS = {
  ram:  0x4dd0ff,
  cpu:  0xffd54d,
  gpu:  0xff5a8a,
  io:   0xb288ff,
  bus:  0x00ffd2,
  bg:   0x07080d,
};

// ─────────────────────────────────────────────
// compute() — MÉTRIQUES RÉELLES PAR PROTOTYPE
// ─────────────────────────────────────────────
//
// Tous les calculs sont ancrés sur des valeurs réelles:
//   • HBM3:    819 GB/s, latence ~0.8–2 ms système [1][5]
//   • WSE-3:   125 PFLOPS, 0.5 ms/hop, Raft ~100 ms [2]
//   • Akida2:  0.5–16 TOPS/noeud, ~5 pJ/spike [3]
//   • Loihi2:  1M neurones, ~1W, 10× efficacité [4]
//
function compute() {
  const { ram, cpu, gpu, io } = state;
  const p = PROTOTYPES[state.proto];

  let latency, parallel, tflops, efficiency;

  // ── Latence (ms) ──────────────────────────────────────────────────
  // Log-scale pour refléter le comportement réel:
  //   HBM: très stable (~0.8–2 ms) même avec beaucoup de RAM (12-Hi stack)
  //   Silicium: augmente doucement avec I/O (bus partagé)
  //   Maillage: augmente avec I/O (plus de messages gossip)
  //   Neuromorph: très stable (event-driven, peu sensible à la charge)
  latency = p.latBase * p.latFactor(ram, io);
  latency = Math.max(
    state.proto === 'neuromorph' ? 0.002 :
    state.proto === 'hbm'      ? 0.0005 :
    state.proto === 'silicium' ? 10 :
                                 0.5,
    latency
  );
  latency = Math.min(latency, 50);  // cap sécurité

  // ── Parallélisme ──────────────────────────────────────────────────
  // Silicium: CPU × SMT × pipeline depth approximation
  // Maillage: nœuds × cœurs simulés (50 000 cœurs/noeud WSE-3)
  // HBM: cœurs GPU tensor (H100=64, MI300X=128)
  // Neuromorph: neurones simulés (8000/noeud × nodes)
  if (state.proto === 'silicium') {
    parallel = Math.min(cpu * p.parallelFactor * (1 + Math.log2(ram) * 0.1), 500000);
  } else if (state.proto === 'decentralise') {
    // slider cpu = nombre de nœuds actifs dans le mesh
    const activeNodes = Math.max(2, cpu);
    parallel = Math.min(activeNodes * p.parallelFactor, 900000);
  } else if (state.proto === 'hbm') {
    parallel = Math.min(cpu * p.parallelFactor * 4, 50000);
  } else {
    // neuromorph: cpu = nombre de nœuds
    const activeNodes = Math.max(1, cpu);
    parallel = Math.min(activeNodes * p.parallelFactor * 125, 1000000);
  }

  // ── TFLOPs effectif ───────────────────────────────────────────────
  if (state.proto === 'decentralise') {
    // TFLOPs = nœuds actifs × PFLOPS/noeud (WSE-3)
    // Slider cpu = nœuds; slider gpu = facteur charge
    const nodes = Math.max(2, cpu);
    tflops = Math.min(nodes * p.tflopsPerNode * (gpu / 30), 5000);
  } else if (state.proto === 'neuromorph') {
    // Affichage en TOPS (neuros ops/sec)
    // Akida2: 0.5–16 TOPS selon nœud [3]
    const nodes = Math.max(1, cpu);
    const tops = Math.min(nodes * p.topsPerNode * (ram / 8), 128);
    tflops = tops;  // alias pour affichage (même widget)
  } else {
    // silicium + hbm: tflops = slider × scale factor
    tflops = gpu * (p.tflopsScale || 1) * (1 + Math.log2(ram) / 10);
  }

  // ── Efficience électrique (%) ─────────────────────────────────────
  // Basée sur l'architecture, pas des formules magiques.
  // Loihi2/Akida: 10× plus efficace que GPU (sparse, event-driven)
  // WSE-3: bonne efficacité (single wafer, pas de cross-socket)
  // HBM: très bonne (bande passante massive, peu de mouvement données)
  // Silicium: bon (zero-copy)
  efficiency = Math.min(
    p.effBase + p.effFactor(cpu) - io * p.effIOPenalty,
    state.proto === 'neuromorph' ? 99 :
    state.proto === 'hbm'       ? 97 :
    state.proto === 'decentralise' ? 95 :
                                    97
  );
  efficiency = Math.max(efficiency, 50);

  return {
    latency:   latency.toFixed(state.proto === 'hbm' ? 4 : 1),
    parallel:  parallel.toFixed(0),
    tflops:    tflops.toFixed(state.proto === 'neuromorph' ? 1 : 1),
    efficiency: efficiency.toFixed(0),
    bandwidth:     p.refBandwidth,
    networkLatency: p.refNetworkLat,
    spikeEnergy:    p.refSpikeEnergy,
    consensusMs:    p.refConsensus,
    physicalNote:   p.physicalNote,
  };
}

// ─────────────────────────────────────────────
// UI: mise à jour métriques + panneau de référence physique
// ─────────────────────────────────────────────
function updateMetrics() {
  const m = compute();
  document.getElementById('m-latency').textContent = m.latency;
  document.getElementById('m-parallel').textContent = m.parallel;
  document.getElementById('m-tflops').textContent  = m.tflops;
  document.getElementById('m-eff').textContent     = m.efficiency;

  // Panneau de référence physique (nouvelles métadonnées)
  const refEl = document.getElementById('m-physical');
  if (refEl) {
    const parts = [];
    if (m.bandwidth)    parts.push(`<b>${m.bandwidth >= 1000 ? (m.bandwidth/1024).toFixed(1)+' PB/s' : m.bandwidth+' GB/s'}</b> bande passante`);
    if (m.networkLatency) parts.push(`<b>${m.networkLatency} ms</b>/hop`);
    if (m.spikeEnergy)  parts.push(`<b>${m.spikeEnergy} pJ</b>/spike`);
    if (m.consensusMs) parts.push(`<b>${m.consensusMs} ms</b> Raft`);
    refEl.innerHTML = parts.length
      ? `${parts.join(' · ')}<br><small class="note">${m.physicalNote}</small>`
      : `<small class="note">${m.physicalNote}</small>`;
  }
}

// ─────────────────────────────────────────────
// Génération du graphe (dataflow)
// ─────────────────────────────────────────────
function makeGraph(proto) {
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

  const mat = (color, emissive = 0.0, opacity = 1.0) => new THREE.MeshStandardMaterial({
    color, emissive, transparent: opacity < 1.0, opacity,
    metalness: 0.4, roughness: 0.3,
  });
  const geom = (rad, seg = 24) => new THREE.SphereGeometry(rad, seg, seg);
  const cubeGeom = (s) => new THREE.BoxGeometry(s, s, s);

  if (proto === 'silicium') {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x002211, metalness: 0.8, roughness: 0.2 })
    );
    group.add(plate);
    const positions = [
      [-3, 0.5, -3, 'cpu'], [-1, 0.5, -2, 'cpu'], [1, 0.5, -3, 'ram'],
      [ 3, 0.5,  2, 'ram'], [-2, 0.5,  3, 'gpu'], [2, 0.5, 3, 'io'],
      [ 0, 0.5,  0, 'cpu'], [-3, 0.5,  1, 'ram'], [3, 0.5, -1, 'io'],
    ];
    positions.forEach(([x, y, z, type]) => {
      const color = COLORS[type];
      const radius = type === 'cpu' ? 0.5 : 0.35;
      const mesh = new THREE.Mesh(geom(radius), mat(color, color, 0.95));
      mesh.position.set(x, y, z);
      group.add(mesh);
      nodes.push({ mesh, type, label: type.toUpperCase() });
    });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.random() > 0.55) {
          edges.push(makeEdge(nodes[i].mesh, nodes[j].mesh, group, COLORS.bus, 0.35));
        }
      }
    }
  }

  else if (proto === 'decentralise') {
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
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = nodes[i].mesh.position.distanceTo(nodes[j].mesh.position);
        if (d < 4.0) edges.push(makeEdge(nodes[i].mesh, nodes[j].mesh, group, COLORS.bus, 0.25));
      }
    }
  }

  else if (proto === 'hbm') {
    const stacks = [
      { x: 0, z: 0, isHbm: true },
      { x: -2.5, z: 0, isHbm: true },
      { x: 2.5, z: 0, isHbm: true },
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
    const gpu = new THREE.Mesh(cubeGeom(1.5), mat(COLORS.gpu, COLORS.gpu * 0.4, 0.95));
    gpu.position.set(0, 2.5, 0);
    group.add(gpu);
    nodes.push({ mesh: gpu, type: 'gpu', label: 'GPU die' });
    const cpu = new THREE.Mesh(cubeGeom(1.2), mat(COLORS.cpu, COLORS.cpu * 0.4, 0.95));
    cpu.position.set(-4.5, 0.8, 0);
    group.add(cpu);
    nodes.push({ mesh: cpu, type: 'cpu', label: 'CPU' });
    nodes.push({ mesh: cpu, type: 'cpu', label: 'CPU' });
    nodes.forEach(n => edges.push(makeEdge(n.mesh, gpu, group, COLORS.bus, 0.6)));
  }

  else if (proto === 'neuromorph') {
    const N = 32;
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
    for (let i = 0; i < nodes.length; i++) {
      const nearest = nodes
        .map((n, j) => ({ j, d: n.mesh.position.distanceTo(nodes[i].mesh.position) }))
        .filter(o => o.j !== i)
        .sort((a, b) => a.d - b.d).slice(0, 3);
      nearest.forEach(({ j }) => {
        if (j > i) edges.push(makeEdge(nodes[i].mesh, nodes[j].mesh, group, COLORS.bus, 0.5));
      });
    }
  }

  state.graph = { group, nodes, edges };
  updateMetrics();
}

// ─────────────────────────────────────────────
// Edge (ligne entre 2 nœuds)
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

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(host.clientWidth, host.clientHeight),
  0.85, 0.55, 0.65
);
composer.addPass(bloom);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const dirLight = new THREE.DirectionalLight(0x00ffd2, 0.8);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xff3d8c, 0.5);
dirLight2.position.set(-5, 3, -3);
scene.add(dirLight2);

const grid = new THREE.GridHelper(40, 60, COLORS.bus, 0x1a2030);
grid.position.y = -4;
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

const halo = new THREE.Mesh(
  new THREE.RingGeometry(7, 9, 64),
  new THREE.MeshBasicMaterial({ color: COLORS.bus, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
);
halo.rotation.x = -Math.PI / 2;
halo.position.y = -3.9;
scene.add(halo);

{
  const geo = new THREE.BufferGeometry();
  const N = 400;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    positions[i*3]   = (Math.random() - 0.5) * 200;
    positions[i*3+1] = (Math.random() - 0.5) * 200;
    positions[i*3+2] = (Math.random() - 0.5) * 200;
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
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  if (!state.graph) return;
  const hits = raycaster.intersectObjects(state.graph.nodes.map(n => n.mesh), false);
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
    n.mesh.scale.setScalar(1.0 + 0.05 * Math.sin(phase * Math.PI * 2));
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
  const el  = document.getElementById(id);
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