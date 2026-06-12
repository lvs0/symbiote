# Symbiote — ère symbiotique

> *« On nous enseigne que chaque matériau a un potentiel fixe.
> On dit : c'est l'architecture logicielle qui libère ou qui étouffe le silicium. »*

Trois artefacts:

```
symbiote/
├── site/         Landing page (HTML/CSS/JS vanilla + Three.js)
├── simulator/    Simulateur 3D interactif (4 prototypes matériels)
└── docs/         Notes de recherche, références
```

## 🚀 Lancer

```bash
# ouvrir le site (juste ouvrir un navigateur)
xdg-open site/index.html         # Linux
open site/index.html             # Mac
start site/index.html            # Windows

# ou en local (recommandé)
python3 -m http.server 8000 -d site
# puis http://localhost:8000
```

Tout est statique. Pas de build, pas de `npm install`. Three.js se charge
depuis le Cloudflare CDN. Les seuls assets requis sont les fichiers du repo.

## 🔬 Les 4 prototypes

| Prototype | Concept | Métrique emblématique |
|-----------|---------|----------------------|
| Plaque de silicium vivante | Une seule plaque où CPU/RAM/GPU/I/O sont soudés en maillage. Le courant ne quitte jamais le substrat. | Latence ≈ 12 - log2(RAM) × 0.8 ms |
| Maillage décentralisé | 18 nœuds autonomes, pas de CPU central, intelligence par consensus local. | Parallélisme max : 128× |
| HBM verticale + TMFC | Mémoire 3D empilée + in-memory computing. La donnée est calculée là où elle réside. | Latence < 1 ms, TFLOPs × 5 |
| Neurmorphique | 32 neurones-spikes, arêtes événements, inspiration Loihi / Akida / TrueNorth. | Parallélisme max : 256×, efficience 99% |

Les chiffres viennent d'un modèle physique simple (script `simulator/main.js`,
fonction `compute()`). **Toutes les courbes sont ajustables** dans le code.

## 🛠 Stack

- `simulator/main.js` — Three.js v0.165 avec `OrbitControls`, `EffectComposer`, `UnrealBloomPass`
- `site/hero.js` — Three.js vanilla, sphère de nœuds + dataflow pulse
- `site/style.css` — design system complet, palette dark + accents néon
- `site/index.html` — landing avec sections : vision, prototypes, laboratoire, simulateur, manifeste

## ✍️ Auteur

Lévy & Zoe — 12 juin 2026 — Paris.
MIT licence.
