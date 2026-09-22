import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small, deterministic cavities cut into the two faces and the upper surface. */
export const CHEESE_PORES = [
  { face: 'top', u: 0.72, v: 0.0, radius: 0.15, depth: 0.12 },
  { face: 'top', u: 1.26, v: -0.25, radius: 0.22, depth: 0.17 },
  { face: 'top', u: 1.83, v: 0.30, radius: 0.27, depth: 0.21 },
  { face: 'top', u: 2.12, v: -0.43, radius: 0.14, depth: 0.12 },
  { face: 'top', u: 1.44, v: 0.43, radius: 0.14, depth: 0.08 },
  { face: 'front', u: 0.68, v: 0.43, radius: 0.16, depth: 0.12 },
  { face: 'front', u: 1.23, v: 0.68, radius: 0.20, depth: 0.17 },
  { face: 'front', u: 1.73, v: 0.35, radius: 0.24, depth: 0.20 },
  { face: 'front', u: 2.16, v: 0.72, radius: 0.13, depth: 0.11 },
  { face: 'back', u: 1.12, v: 0.48, radius: 0.19, depth: 0.15 },
  { face: 'back', u: 1.90, v: 0.53, radius: 0.23, depth: 0.18 },
] as const;

export function cheesePoreDepth(distance: number, radius: number, depth: number): number {
  if (distance >= radius) return 0;
  // Smooth at both the lip and the bottom: no dark painted rings or sharp spikes.
  const t = Math.max(0, distance / radius);
  return depth * (1 - t * t) ** 2;
}

/** Rounded wedge with tessellated, physically recessed pores; no CSG dependency. */
export function createCheeseGeometry(): THREE.BufferGeometry {
  const angle = 0.55;
  const radius = 2.45;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(radius * Math.cos(-angle), radius * Math.sin(-angle));
  shape.absarc(0, 0, radius, -angle, angle, false);
  shape.closePath();
  const source = new THREE.ExtrudeGeometry(shape, {
    depth: 0.95, bevelEnabled: true, bevelThickness: 0.065,
    bevelSize: 0.065, bevelSegments: 3, curveSegments: 18, steps: 1,
  });
  const positions = source.getAttribute('position');
  const vertices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3();
  let triangleFace: 'top' | 'front' | 'back' | undefined;
  const flesh = new THREE.Color('#f6c653');
  const cavity = new THREE.Color('#bc791f');
  const rind = new THREE.Color('#e4a333');
  const color = new THREE.Color();
  const emit = (u: number, v: number) => {
    point.set(
      a.x + (b.x - a.x) * u + (c.x - a.x) * v,
      a.y + (b.y - a.y) * u + (c.y - a.y) * v,
      a.z + (b.z - a.z) * u + (c.z - a.z) * v,
    );
    const x = point.x, y = point.y, z = point.z;
    let recess = 0;
    const face = triangleFace;
    let surfaceU = x, surfaceV = y;
    if (face && face !== 'top') {
      const sign = face === 'front' ? -1 : 1;
      surfaceU = x * Math.cos(angle) + y * sign * Math.sin(angle);
      surfaceV = z;
    }
    for (const pore of CHEESE_PORES) {
      if (pore.face !== face) continue;
      recess = Math.max(recess, cheesePoreDepth(Math.hypot(surfaceU - pore.u, surfaceV - pore.v), pore.radius, pore.depth));
    }
    if (face === 'top') point.z -= recess;
    else if (face) {
      const sign = face === 'front' ? -1 : 1;
      point.x += Math.sin(angle) * recess;
      point.y -= sign * Math.cos(angle) * recess;
    }
    const isRind = Math.hypot(x, y) > radius - 0.018;
    color.copy(isRind ? rind : flesh).lerp(cavity, Math.min(0.6, recess * 2.7));
    // Tiny color variation is deterministic and never substitutes for cavity geometry.
    color.multiplyScalar(1 + 0.012 * Math.sin(x * 93 + y * 77 + z * 51));
    vertices.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
    uvs.push((x + y * 0.3) * 0.6, (z + y * 0.65) * 0.6);
  };
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    triangleFace = undefined;
    if (normal.z > 0.999 && a.z > 1) triangleFace = 'top';
    else if (Math.abs(normal.z) < 0.001) {
      for (const sign of [-1, 1]) {
        const alignment = normal.x * -Math.sin(angle) + normal.y * sign * Math.cos(angle);
        if (alignment > 0.999) triangleFace = sign < 0 ? 'front' : 'back';
      }
    }
    const divisions = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.115));
    for (let row = 0; row < divisions; row++) {
      for (let col = 0; col < divisions - row; col++) {
        emit(row / divisions, col / divisions);
        emit((row + 1) / divisions, col / divisions);
        emit(row / divisions, (col + 1) / divisions);
        if (col + row < divisions - 1) {
          emit((row + 1) / divisions, col / divisions);
          emit((row + 1) / divisions, (col + 1) / divisions);
          emit(row / divisions, (col + 1) / divisions);
        }
      }
    }
  }
  source.dispose();
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  raw.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  raw.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const geometry = mergeVertices(raw, 0.0001);
  raw.dispose();
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(-1.35, 0.13, 0);
  geometry.rotateY(-0.42);
  geometry.computeBoundingBox();
  return geometry;
}
