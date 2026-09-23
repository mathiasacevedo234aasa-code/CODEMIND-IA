import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Genera el icono de la aplicacion como PNG de 512x512.
 *
 * Se dibuja pixel a pixel en lugar de depender de una herramienta de imagen
 * externa: asi el icono se puede regenerar en cualquier equipo con solo Node.
 * electron-builder convierte este PNG al .ico que necesita Windows.
 *
 * El dibujo es la marca de CodeMind AI: un cuadrado redondeado con degradado
 * y un signo de mayor/menor con una barra, el gesto de "codigo" mas sobrio.
 */

const SIZE = 512;
const RADIUS = 112;

// Mismos colores que la interfaz (--accent y el violeta del degradado).
const FROM = [0x5b, 0x8c, 0xff];
const TO = [0x8b, 0x5b, 0xff];
const INK = [0xff, 0xff, 0xff];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Distancia al borde de un rectangulo redondeado; negativa dentro. */
function roundedRectDistance(x, y, size, radius) {
  const half = size / 2;
  const dx = Math.abs(x - half) - (half - radius);
  const dy = Math.abs(y - half) - (half - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - radius;
}

/** Distancia de un punto al segmento AB, para dibujar trazos con grosor. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

// Trazos de la marca: chevron izquierdo, chevron derecho y barra central.
const STROKE = 26;
const GLYPH = [
  [[196, 186], [136, 256]],
  [[136, 256], [196, 326]],
  [[316, 186], [376, 256]],
  [[376, 256], [316, 326]],
  [[288, 166], [224, 346]],
];

/** Antialiasing simple: cobertura suave en un borde de un pixel. */
const coverage = (distance) => Math.max(0, Math.min(1, 0.5 - distance));

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let offset = 0;

for (let y = 0; y < SIZE; y++) {
  raw[offset++] = 0; // filtro de fila PNG: ninguno
  for (let x = 0; x < SIZE; x++) {
    const inside = coverage(roundedRectDistance(x + 0.5, y + 0.5, SIZE, RADIUS));

    // Degradado diagonal, como la marca de la barra superior.
    const base = mix(FROM, TO, (x / SIZE) * 0.5 + (y / SIZE) * 0.5);

    let glyph = 0;
    for (const [[ax, ay], [bx, by]] of GLYPH) {
      glyph = Math.max(glyph, coverage(segmentDistance(x + 0.5, y + 0.5, ax, ay, bx, by) - STROKE / 2));
    }

    const color = mix(base, INK, glyph);
    raw[offset++] = color[0];
    raw[offset++] = color[1];
    raw[offset++] = color[2];
    raw[offset++] = Math.round(inside * 255);
  }
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

let table;
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // 8 bits por canal
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build', 'icon.png');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, png);
console.log(`Icono generado: build/icon.png (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} kB)`);
