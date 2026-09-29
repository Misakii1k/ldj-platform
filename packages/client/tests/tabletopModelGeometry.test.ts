import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHEESE_PORES, cheesePoreDepth, createCheeseGeometry } from '../src/game/cheese-thief/cheeseModelGeometry.ts';
import { createDiceCupShellGeometry } from '../src/shared-ui/diceCupGeometry.ts';

test('cheese cavity is smooth, finite and never protrudes beyond its face', () => {
  assert.equal(cheesePoreDepth(0, 0.2, 0.15), 0.15);
  assert.equal(cheesePoreDepth(0.2, 0.2, 0.15), 0);
  assert.equal(cheesePoreDepth(1, 0.2, 0.15), 0);
  let previous = 0.15;
  for (let distance = 0; distance <= 0.3; distance += 0.001) {
    const value = cheesePoreDepth(distance, 0.2, 0.15);
    assert.ok(value <= previous && value >= 0);
    previous = value;
  }
});

test('cheese has real recessed top and cut-face pores, not painted circles', () => {
  const geometry = createCheeseGeometry();
  // Restore extrusion coordinates to ray-test the physical hole depth.
  geometry.rotateY(0.42); geometry.translate(1.35, -0.13, 0); geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster();
  for (const pore of CHEESE_PORES) {
    if (pore.face === 'top') {
      ray.set(new THREE.Vector3(pore.u, pore.v, 2), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, 'top must be closed');
      assert.ok(hit.point.z < 1.015 - pore.depth * 0.65, `top pore ${pore.u} must have actual depth: ${hit.point.z}`);
    } else {
      const sign = pore.face === 'front' ? -1 : 1;
      const normal = new THREE.Vector3(-Math.sin(0.55), sign * Math.cos(0.55), 0);
      const center = new THREE.Vector3(pore.u * Math.cos(0.55), pore.u * sign * Math.sin(0.55), pore.v).addScaledVector(normal, 0.065);
      ray.set(center.clone().add(normal), normal.clone().negate());
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit && hit.distance > 1 + pore.depth * 0.65, `cut face ${pore.u}: ${hit?.distance}`);
    }
  }
  geometry.dispose(); material.dispose();
});

test('cheese geometry is deterministic, valid and within mobile mesh budget', () => {
  const geometry = createCheeseGeometry();
  const duplicate = createCheeseGeometry();
  assert.deepEqual(geometry.getAttribute('position').array, duplicate.getAttribute('position').array);
  assert.ok(geometry.getIndex()!.count / 3 < 30000);
  for (const name of ['position', 'normal', 'color', 'uv']) {
    assert.ok(Array.from(geometry.getAttribute(name).array).every(Number.isFinite), name);
  }
  assert.ok(geometry.boundingBox!.min.y > 0.03, 'no sinking into platter');
  geometry.dispose(); duplicate.dispose();
});

test('dice cup exterior has a closed crown, rounded lip and an open mouth', () => {
  const geometry = createDiceCupShellGeometry();
  assert.ok(geometry.getIndex()!.count / 3 < 4000, 'exterior-only mesh budget');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(0.1, 4, 0), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(mesh)[0]!.point.y > 2.5, 'crown covers private dice');
  ray.set(new THREE.Vector3(0.1, -1, 0), new THREE.Vector3(0, 1, 0));
  assert.ok(ray.intersectObject(mesh)[0]!.point.y > 2.3, 'mouth stays open up to inner ceiling');
  ray.set(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  const inside = ray.intersectObject(mesh)[0]!;
  assert.ok(inside.point.x > 1.4 && inside.point.x < 1.7);
  geometry.dispose(); material.dispose();
});
