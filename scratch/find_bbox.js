import { readFileSync } from 'fs';
import { svgPathBbox } from 'svg-path-bbox';

const svg = readFileSync('src/assets/logo.svg', 'utf8');
const paths = [...svg.matchAll(/d="([^"]+)"/g)].map(m => m[1]);

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

paths.forEach(p => {
  const [x0, y0, x1, y1] = svgPathBbox(p);
  if (x0 < minX) minX = x0;
  if (y0 < minY) minY = y0;
  if (x1 > maxX) maxX = x1;
  if (y1 > maxY) maxY = y1;
});

console.log({ minX, minY, maxX, maxY });
