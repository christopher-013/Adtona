// Builds /favicon.ico from the PNG icon set.
//
// Google reads the <link rel="icon"> PNGs, which is why adtona.com already shows a
// favicon there. Bing's icon service goes looking for /favicon.ico at the site root
// and falls back to a generic globe when it 404s — so the root file is what puts the
// Adtona mark next to the Bing result.
//
// The .ico carries 16, 32 and 48 px entries. 48 is the size Bing and Google render at
// on high-density screens; without it the 32 gets upscaled and looks soft.
//
// Pure Node — no image dependency. PNGs decode with zlib, downscale by an exact
// integer box filter (192 -> 48 is 4:1), and re-encode. PNG-compressed ICO entries are
// understood by every browser and crawler that matters.

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = 4;

function decodePng(path) {
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${path} is not a PNG`);

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) {
    throw new Error(`${path} must be 8-bit RGBA and non-interlaced`);
  }

  const idat = [];
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * CHANNELS;
  const pixels = Buffer.alloc(height * stride);

  // Undo the per-scanline filters (PNG spec 9.2). Each row is prefixed by its filter type.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= CHANNELS ? row[x - CHANNELS] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= CHANNELS ? prior[x - CHANNELS] : 0;
      let value = source[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter} in ${path}`);
      row[x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

// Box filter over an exact integer ratio, averaging in premultiplied alpha so that
// transparent pixels cannot bleed their colour into the result.
function downscale(image, size) {
  const factor = image.width / size;
  if (!Number.isInteger(factor)) throw new Error(`${image.width} does not divide evenly into ${size}`);
  if (factor === 1) return image;

  const out = Buffer.alloc(size * size * CHANNELS);
  const samples = factor * factor;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const i = ((y * factor + sy) * image.width + (x * factor + sx)) * CHANNELS;
          const alpha = image.pixels[i + 3];
          r += image.pixels[i] * alpha;
          g += image.pixels[i + 1] * alpha;
          b += image.pixels[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * size + x) * CHANNELS;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / samples);
    }
  }

  return { width: size, height: size, pixels: out };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crcTable = (chunk.table ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([head.subarray(4), body])) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
}

function encodePng({ width, height, pixels }) {
  const stride = width * CHANNELS;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // Filter 0: these are tiny, so plain rows compress fine.
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const sources = { 16: "icons/favicon-16.png", 32: "icons/favicon-32.png", 48: "icons/icon-192.png" };
const images = Object.entries(sources).map(([size, path]) => ({
  size: Number(size),
  png: encodePng(downscale(decodePng(path), Number(size)))
}));

const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // 1 = icon resource
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const directory = images.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

const ico = Buffer.concat([header, ...directory, ...images.map((image) => image.png)]);
writeFileSync("favicon.ico", ico);
console.log(`Wrote favicon.ico (${images.map((i) => `${i.size}px`).join(", ")}, ${ico.length} bytes).`);
