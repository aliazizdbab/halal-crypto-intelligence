import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function makePng(size) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter none
    const ny = (y - half) / half;

    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half;
      const off = rowStart + 1 + x * 4;

      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      const cornerSq = Math.max(ax - 0.56, 0) ** 2 + Math.max(ay - 0.56, 0) ** 2;

      if (cornerSq > 0.44 * 0.44) {
        raw[off] = 0;
        raw[off + 1] = 0;
        raw[off + 2] = 0;
        raw[off + 3] = 0;
        continue;
      }

      let r = 11, g = 19, b = 37;
      if (cornerSq > 0.39 * 0.39) {
        r = 16; g = 185; b = 129;
      }

      const dist = Math.hypot(nx, ny);
      if (Math.abs(dist - 0.62) < 0.065) {
        r = 16; g = 185; b = 129;
      } else if (dist < 0.58) {
        r = 14; g = 42; b = 48;
      }

      const d1 = segDist(nx, ny, -0.22, 0.02, -0.04, 0.20);
      const d2 = segDist(nx, ny, -0.04, 0.20, 0.26, -0.16);
      if (Math.min(d1, d2) < 0.075) {
        r = 52; g = 211; b = 153;
      }

      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = 255;
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

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeIcoFromPng256(pngBuf) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(1, 4); // 1 image
  header[6] = 0; // 256px
  header[7] = 0; // 256px
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuf.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, pngBuf]);
}

const root = process.cwd();
fs.mkdirSync(path.join(root, "public", "icons"), { recursive: true });
fs.mkdirSync(path.join(root, "desktop"), { recursive: true });

fs.writeFileSync(path.join(root, "public", "icons", "icon-192.png"), makePng(192));
fs.writeFileSync(path.join(root, "public", "icons", "icon-512.png"), makePng(512));

const png256 = makePng(256);
fs.writeFileSync(path.join(root, "desktop", "icon.png"), png256);
fs.writeFileSync(path.join(root, "desktop", "icon.ico"), makeIcoFromPng256(png256));

console.log("Generated PWA PNG icons (192, 512) and Desktop ICO/PNG (256) successfully.");
