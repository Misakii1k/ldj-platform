import * as THREE from 'three';

// 原版 orientDie 的欧拉
const CASES = {
  1: new THREE.Euler(0, 0, -Math.PI / 2),
  2: new THREE.Euler(0, 0, 0),
  3: new THREE.Euler(Math.PI / 2, 0, 0),
  4: new THREE.Euler(-Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI, 0, 0),
  6: new THREE.Euler(0, 0, Math.PI / 2),
};

// BoxGeometry 材质槽位 [+X,-X,+Y,-Y,+Z,-Z] → 点数 [1,6,2,5,3,4]
const FACES = [
  { n: new THREE.Vector3(1, 0, 0), v: 1 },
  { n: new THREE.Vector3(-1, 0, 0), v: 6 },
  { n: new THREE.Vector3(0, 1, 0), v: 2 },
  { n: new THREE.Vector3(0, -1, 0), v: 5 },
  { n: new THREE.Vector3(0, 0, 1), v: 3 },
  { n: new THREE.Vector3(0, 0, -1), v: 4 },
];

for (const [want, euler] of Object.entries(CASES)) {
  const q = new THREE.Quaternion().setFromEuler(euler);
  const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
  let best = FACES[0];
  for (const f of FACES) if (f.n.dot(worldUp) > best.n.dot(worldUp)) best = f;
  console.log(`want ${want} -> top face shows ${best.v} ${Number(want) === best.v ? 'OK' : '** WRONG **'}`);
}
