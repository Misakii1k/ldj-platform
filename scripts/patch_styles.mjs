import fs from 'node:fs';

const filePath = 'packages/client/src/styles.css';
let css = fs.readFileSync(filePath, 'utf8');

// Remove the orphan font-family snippet after :focus-visible
css = css.replace(
  /\:focus-visible\s*\{[\s\S]*?\}I', 'PingFang SC'[\s\S]*?-webkit-text-size-adjust: 100%;\s*\}/,
  `:focus-visible {
  outline: 2.5px solid var(--home-yellow, #f8c822) !important;
  outline-offset: 2px;
}`
);

fs.writeFileSync(filePath, css, 'utf8');
console.log('Successfully cleaned styles.css');
