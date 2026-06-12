// Injecte un badge "ecosystem NYX" en haut à gauche pour relier les produits
(function() {
  const product = document.body.dataset.product || 'Vortex';
  const link = document.createElement('a');
  link.href = 'https://lvs0.github.io/nyx/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'nyx-frame';
  link.title = 'NYX — écosystème de souveraineté';
  link.innerHTML = `
    <img src="https://lvs0.github.io/nyx/brand/logo-horizontal.svg" alt="NYX" />
    <span class="nyx-frame__sep"></span>
    <span class="nyx-frame__ecosystem">ecosystem</span>
    <span class="nyx-frame__sep" style="opacity:0.4"></span>
    <span class="nyx-frame__product">${product}</span>
  `;
  document.body.appendChild(link);
})();
