import * as THREE from 'three';

// groups.start/count 是 index buffer 范围：取组内首三角形叉积求面法向
const geo = new THREE.BoxGeometry(1, 1, 1);
const idxAttr = geo.index;
const pos = geo.attributes.position;

console.log('BoxGeometry groups（three', THREE.REVISION, '）:');
for (const g of geo.groups) {
  const a = idxAttr.getX(g.start);
  const b = idxAttr.getX(g.start + 1);
  const c = idxAttr.getX(g.start + 2);
  const A = new THREE.Vector3().fromBufferAttribute(pos, a);
  const B = new THREE.Vector3().fromBufferAttribute(pos, b);
  const C = new THREE.Vector3().fromBufferAttribute(pos, c);
  const fn = new THREE.Vector3()
    .subVectors(B, A)
    .cross(new THREE.Vector3().subVectors(C, A))
    .normalize();
  const label =
    Math.abs(fn.x) > 0.9 ? (fn.x > 0 ? '+X' : '-X') :
    Math.abs(fn.y) > 0.9 ? (fn.y > 0 ? '+Y' : '-Y') :
    fn.z > 0 ? '+Z' : '-Z';
  console.log(`materialIndex ${g.materialIndex} -> ${label}  normal=(${fn.x.toFixed(2)},${fn.y.toFixed(2)},${fn.z.toFixed(2)})`);
}
