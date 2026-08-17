/**
 * Processes the Gemini-generated icon JPG into production-ready PNGs.
 *
 * Steps:
 *   1. Crop the white border padding (find tight bounding box of non-white pixels)
 *   2. Make outer-corner white pixels transparent (outside the rounded dark square)
 *   3. Resize to 128 / 48 / 16 px and write to public/icons/
 *
 * Usage:
 *   node scripts/process-icon.mjs <path-to-source.jpg>
 *
 * Requires: npm install --save-dev sharp
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];

if (!SRC) {
  console.error('Usage: node scripts/process-icon.mjs <source.jpg>');
  process.exit(1);
}

const OUT_DIR = join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// --- Step 1: load as raw RGBA ---
const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info; // channels === 4

function idx(x, y) { return (y * width + x) * channels; }
function isNearWhite(x, y, threshold = 230) {
  const i = idx(x, y);
  return data[i] > threshold && data[i + 1] > threshold && data[i + 2] > threshold;
}

// --- Step 2: find tight bounding box (first/last non-white row and column) ---
let top = 0, bottom = height - 1, left = 0, right = width - 1;

outer: for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (!isNearWhite(x, y)) { top = y; break outer; }
  }
}
outer: for (let y = height - 1; y >= 0; y--) {
  for (let x = 0; x < width; x++) {
    if (!isNearWhite(x, y)) { bottom = y; break outer; }
  }
}
outer: for (let x = 0; x < width; x++) {
  for (let y = 0; y < height; y++) {
    if (!isNearWhite(x, y)) { left = x; break outer; }
  }
}
outer: for (let x = width - 1; x >= 0; x--) {
  for (let y = 0; y < height; y++) {
    if (!isNearWhite(x, y)) { right = x; break outer; }
  }
}

const cropW = right - left + 1;
const cropH = bottom - top + 1;
console.log(`bounding box: (${left},${top}) → (${right},${bottom})  size: ${cropW}×${cropH}`);

// --- Step 3: copy cropped region into a new square buffer ---
// Use the larger dimension so the icon stays square (add equal padding if needed)
const side = Math.max(cropW, cropH);
const padX = Math.floor((side - cropW) / 2);
const padY = Math.floor((side - cropH) / 2);

const square = Buffer.alloc(side * side * 4, 0); // transparent

for (let sy = 0; sy < cropH; sy++) {
  for (let sx = 0; sx < cropW; sx++) {
    const srcI = idx(left + sx, top + sy);
    const dstI = ((padY + sy) * side + (padX + sx)) * 4;
    square[dstI]     = data[srcI];
    square[dstI + 1] = data[srcI + 1];
    square[dstI + 2] = data[srcI + 2];
    square[dstI + 3] = data[srcI + 3];
  }
}

// --- Step 4: make white corner pixels transparent ---
// The outer corners of the cropped square will still be white (outside the rounded
// dark square shape). Any pixel that is near-white gets alpha = 0.
// This is safe because the mic glow is very localised and the edges are dark.
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    const i = (y * side + x) * 4;
    const r = square[i], g = square[i + 1], b = square[i + 2];
    if (r > 230 && g > 230 && b > 230) {
      square[i + 3] = 0;
    }
  }
}

// --- Step 5: resize to each target size and write ---
const SIZES = [128, 48, 16];

for (const size of SIZES) {
  const outPath = join(OUT_DIR, `icon${size}.png`);
  await sharp(square, { raw: { width: side, height: side, channels: 4 } })
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(outPath);
  console.log(`wrote ${outPath}`);
}

console.log('done — reload the extension at opera://extensions to see the new icon');
