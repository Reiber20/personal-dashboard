import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(px - nx, py - ny);
}

function createIconPng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const s = size / 512;
  const points = [
    [96, 276],
    [170, 276],
    [208, 168],
    [270, 352],
    [322, 216],
    [354, 276],
    [416, 276],
  ].map(([x, y]) => [x * s, y * s]);
  const strokeHalf = 17 * s;
  const dotX = 408 * s;
  const dotY = 140 * s;
  const dotR = 24 * s;
  const cornerR = 112 * s;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;

      // Rounded rect alpha
      const cx = Math.min(Math.max(x, cornerR), size - 1 - cornerR);
      const cy = Math.min(Math.max(y, cornerR), size - 1 - cornerR);
      const cornerDist = Math.hypot(x - cx, y - cy);
      if (cornerDist > cornerR + 0.8) {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
        continue;
      }

      // Gradient from #4f46e5 (79,70,229) to #0ea5e9 (14,165,233)
      const t = (x + y) / (2 * size);
      let r = Math.round(79 * (1 - t) + 14 * t);
      let g = Math.round(70 * (1 - t) + 165 * t);
      let b = Math.round(229 * (1 - t) + 233 * t);

      // Pulse line
      let minDist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[i + 1];
        minDist = Math.min(minDist, distToSegment(x, y, x1, y1, x2, y2));
      }
      if (minDist <= strokeHalf) {
        r = 255;
        g = 255;
        b = 255;
      } else if (minDist <= strokeHalf + 1.2) {
        const blend = 1 - (minDist - strokeHalf) / 1.2;
        r = Math.round(r * (1 - blend) + 255 * blend);
        g = Math.round(g * (1 - blend) + 255 * blend);
        b = Math.round(b * (1 - blend) + 255 * blend);
      }

      // Gold dot (#fde047 -> 253, 224, 71)
      const dotDist = Math.hypot(x - dotX, y - dotY);
      if (dotDist <= dotR) {
        r = 253;
        g = 224;
        b = 71;
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon-192.png"), createIconPng(192));
fs.writeFileSync(path.join(outDir, "icon-512.png"), createIconPng(512));
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), createIconPng(180));
console.log("Generated PWA icons in public/icons");
