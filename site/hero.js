// Hero — visualisation Three.js inline (mini dataflow sphere)
// Auteur: Zoe pour Lévy · 12 juin 2026

(function () {
  'use strict';

  // ---- Loads Three.js dynamic ----
  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }

  async function init() {
    // Si importmap déjà présent (depuis simulator/main.js)... on l'utilise pas car pages différentes
    // On charge three avec UMD si possible — sinon ESM dynamic
    await loadScript('https://unpkg.com/[email protected]/build/three.min.js');
    const cv = document.getElementById('hero-canvas');
    if (!cv || !window.THREE) return;

    const w = () => cv.parentElement.clientWidth;
    const h = () => cv.parentElement.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w()/h(), 0.1, 100);
    camera.position.set(0, 0, 7);

    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w(), h(), false);

    const C = { c1: 0x00ffd2, c2: 0xff3d8c, c3: 0xb288ff };

    // Icosahedron frame
    const R = 2.2;
    const N = 32;
    const nodeGeom = new THREE.SphereGeometry(0.08, 16, 16);
    const meshes = [];
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r = R * (0.85 + Math.random() * 0.3);
      const colors = [C.c1, C.c2, C.c3];
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i%3], transparent: true, opacity: 0.95
      });
      const m = new THREE.Mesh(nodeGeom, mat);
      m.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      m.userData = {
        v0: m.position.clone(),
        phase: Math.random() * Math.PI * 2
      };
      scene.add(m);
      meshes.push(m);
    }

    // Edges (3 plus proches voisins par nœud)
    const edges = [];
    for (let i = 0; i < meshes.length; i++) {
      const distances = meshes
        .map((m,j)=>({j, d: m.position.distanceTo(meshes[i].position)}))
        .filter(o=>o.j!==i)
        .sort((a,b)=>a.d-b.d)
        .slice(0,3);
      distances.forEach(({j}) => {
        if (j > i) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            meshes[i].position.clone(),
            meshes[j].position.clone()
          ]);
          const mat = new THREE.LineBasicMaterial({ color: C.c1, transparent: true, opacity: 0.35 });
          const ln = new THREE.Line(geo, mat);
          scene.add(ln);
          edges.push({ mesh: ln, a: meshes[i], b: meshes[j] });
        }
      });
    }

    // Stars
    const starsGeom = new THREE.BufferGeometry();
    const starsArr = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i++) {
      starsArr[i*3]   = (Math.random() - 0.5) * 30;
      starsArr[i*3+1] = (Math.random() - 0.5) * 30;
      starsArr[i*3+2] = (Math.random() - 0.5) * 30;
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starsArr, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.04, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Points(starsGeom, starsMat));

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Animation
    function animate(t) {
      requestAnimationFrame(animate);
      const time = t * 0.001;
      meshes.forEach((m) => {
        const p = m.userData.phase + time * 0.6;
        const scale = 1 + 0.4 * Math.sin(p);
        m.scale.setScalar(scale);
        const v = m.userData.v0;
        m.position.copy(v).multiplyScalar(1 + 0.04 * Math.sin(p * 0.7));
      });
      edges.forEach((e, i) => {
        const phase = (time * 0.6 + i * 0.07) % 2;
        e.mesh.material.opacity = 0.15 + 0.45 * Math.max(0, Math.sin(phase * Math.PI));
      });
      scene.rotation.y = time * 0.05;
      scene.rotation.x = Math.sin(time * 0.2) * 0.1;
      renderer.render(scene, camera);
    }
    animate(0);

    // Resize
    window.addEventListener('resize', () => {
      camera.aspect = w()/h();
      camera.updateProjectionMatrix();
      renderer.setSize(w(), h(), false);
    });

    // Cursor follow
    const parent = cv.parentElement;
    parent.addEventListener('pointermove', (e) => {
      const rect = parent.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      scene.rotation.y += (x * 0.5 - scene.rotation.y) * 0.05;
      scene.rotation.x += (-y * 0.3 - scene.rotation.x) * 0.05;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Mouse-follow glow sur les proto-cards (effet subtil mais quali)
document.querySelectorAll('.proto-card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const el = document.querySelector(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
