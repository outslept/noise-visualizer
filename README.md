# noise-studio.

Interactive 2D/3D procedural noise visualizer featuring **Worley**, **Perlin**, and **Simplex** noise.

## Modes

- **`1` worley** - cellular Voronoi distance field (`F1` & `F2 - F1` membrane ridges) with repulsive nuclei.
- **`2` perlin** - quintic-interpolated Cartesian gradient lattice noise (`fBm`) with isoline contours and vector field ticks.
- **`3` simplex** - skewed equilateral simplex lattice noise with domain-warped ridges and strata trails.

## Controls & Metrics

- **`scl` (28–96)** - feature wavelength / cellular radius scale.
- **`spd` (1–8)** - simulation steps per frame.
- **`nds` / `cls`** - active warp vortices or cell nuclei vs. maximum capacity.
- **`len` / `dst`** - total isoline perimeter length or mean nearest-neighbor cell distance.
