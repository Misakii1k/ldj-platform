import * as THREE from 'three';

/** Visible turned silhouette: rolled mouth, curved shoulder and closed crown. */
export function createDiceCupShellGeometry(): THREE.LatheGeometry {
  const outer = [
    [1.77, 0.035], [1.815, 0.045], [1.84, 0.085], [1.825, 0.15],
    [1.79, 0.25], [1.74, 0.46], [1.665, 0.72], [1.575, 0.99],
    [1.485, 1.26], [1.397, 1.54], [1.327, 1.81], [1.282, 2.03],
    [1.263, 2.20], [1.255, 2.34], [1.239, 2.42], [1.20, 2.47],
    [1.08, 2.50], [0.84, 2.52], [0.44, 2.535], [0, 2.54],
  ];
  const profile = outer.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(profile, 80);
}
