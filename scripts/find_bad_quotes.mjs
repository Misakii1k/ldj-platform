import fs from 'node:fs';

const lines = fs.readFileSync('packages/client/src/styles.css', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // ignore comments
  if (line.trim().startsWith('/*') && line.trim().endsWith('*/')) continue;
  let s = 0, d = 0;
  for (let j = 0; j < line.length; j++) {
    if (line[j] === "'" && (j === 0 || line[j - 1] !== '\\')) s++;
    if (line[j] === '"' && (j === 0 || line[j - 1] !== '\\')) d++;
  }
  if (s % 2 !== 0 || d % 2 !== 0) {
    console.log(`Line ${i + 1}: (single=${s}, double=${d}) ${line}`);
  }
}
