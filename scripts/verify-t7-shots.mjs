import fs from 'node:fs';


const content = fs.readFileSync('docs/plans/2026-09-26-cards-trio-visual/reports/T7-screenshots.md', 'utf8');
const lines = content.split('\n');

const pathLines = lines.filter((l) => l.includes('baseline\\') && l.includes('.png'));
console.log('Found', pathLines.length, 'screenshot rows');

let missing = 0;
for (const line of pathLines) {
  const parts = line.split('|').map((s) => s.trim());
  const filePath = parts[2];
  if (!fs.existsSync(filePath)) {
    console.error('MISSING:', filePath);
    missing++;
  }
}

if (missing === 0) {
  console.log('SUCCESS: All', pathLines.length, 'screenshot paths exist on disk!');
} else {
  console.error('FAILURE:', missing, 'paths missing');
  process.exit(1);
}
