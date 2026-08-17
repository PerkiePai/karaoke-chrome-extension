/**
 * Generates placeholder extension icons as PNG files using the Canvas API
 * (available in Node 18+ via --experimental-vm-modules or via the built-in
 * canvas polyfill path; we use the @napi-rs/canvas or raw Buffer trick here).
 *
 * Since Node's built-in doesn't expose Canvas, we write raw PNG bytes directly.
 * A minimal PNG is: signature + IHDR + IDAT + IEND.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

mkdirSync(OUT_DIR, { recursive: true });

// CRC-32 table for PNG chunk checksums
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBytes, data]));
  return Buffer.concat([uint32be(data.length), typeBytes, data, uint32be(crc)]);
}

// Deflate raw (no compression) for small images — zlib header + stored block
function deflateStored(data) {
  // zlib header: CMF=0x78, FLG that makes FCHECK work: 0x01
  const cmf = 0x78;
  const flg = 0x01;
  // stored block: BFINAL=1, BTYPE=00 (no compression)
  const len = data.length;
  const nlen = (~len) & 0xffff;
  const block = Buffer.alloc(5 + len);
  block[0] = 0x01; // BFINAL=1, BTYPE=00
  block.writeUInt16LE(len, 1);
  block.writeUInt16LE(nlen, 3);
  data.copy(block, 5);

  // Adler-32 checksum
  let s1 = 1, s2 = 0;
  for (const b of data) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((s2 << 16) | s1) >>> 0);

  return Buffer.concat([Buffer.from([cmf, flg]), block, adler]);
}

function makePng(size, r, g, b) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data: one filter byte per row + RGB pixels
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const row = y * rowBytes;
    raw[row] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      // Rounded corners: darken corners slightly by blending with dark
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const radius = size * 0.38;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.min(1, Math.max(0, radius - dist + 1));
      raw[row + 1 + x * 3] = Math.round(r * alpha + 30 * (1 - alpha));
      raw[row + 2 + x * 3] = Math.round(g * alpha + 30 * (1 - alpha));
      raw[row + 3 + x * 3] = Math.round(b * alpha + 30 * (1 - alpha));
    }
  }

  // Microphone symbol — draw a white rectangle in the center
  const cx = Math.floor(size / 2);
  const mw = Math.max(2, Math.floor(size * 0.18));
  const mh = Math.max(3, Math.floor(size * 0.30));
  const mx = cx - Math.floor(mw / 2);
  const my = Math.floor(size * 0.22);
  for (let py = my; py < my + mh && py < size; py++) {
    for (let px = mx; px < mx + mw && px < size; px++) {
      const row = py * rowBytes;
      raw[row + 1 + px * 3] = 255;
      raw[row + 2 + px * 3] = 255;
      raw[row + 3 + px * 3] = 255;
    }
  }
  // Stand line
  const sy = my + mh;
  for (let px = cx - 1; px <= cx + 1 && px < size; px++) {
    for (let py = sy; py < sy + Math.max(2, Math.floor(size * 0.12)) && py < size; py++) {
      const row = py * rowBytes;
      raw[row + 1 + px * 3] = 255;
      raw[row + 2 + px * 3] = 255;
      raw[row + 3 + px * 3] = 255;
    }
  }

  const idat = chunk('IDAT', deflateStored(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), idat, iend]);
}

// Brand color: dark teal-blue (#1a3a5c) background with white mic
const BG_R = 26, BG_G = 58, BG_B = 92;

for (const size of [16, 48, 128]) {
  const png = makePng(size, BG_R, BG_G, BG_B);
  const outPath = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}
