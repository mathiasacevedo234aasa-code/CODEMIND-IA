import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { analyzeFile } = await import(pathToFileURL(path.join(raiz, 'web/src/lib/analyzer/index.ts')).href);
const { construirMapa, calcularPosiciones } = await import(pathToFileURL(path.join(raiz, 'web/src/lib/projectMap.ts')).href);

/** Proyecto de mentira con dependencias de todos los tipos, y un ciclo a propósito. */
const archivos = {
  'index.html': `<!doctype html><html><head>
    <link rel="stylesheet" href="css/estilos.css">
  </head><body>
    <script src="js/app.js"></script>
  </body></html>`,

  'css/estilos.css': `@import "base.css";
    .caja { color: red; }`,

  'css/base.css': `:root { --c: #000; }`,

  'js/app.js': `import { calcular } from './calculo.js';
    import { formatear } from './formato.js';
    import React from 'react';
    export function iniciar() { return formatear(calcular(1)); }`,

  'js/calculo.js': `import { redondear } from './formato.js';
    export function calcular(n) { return redondear(n * 2); }`,

  // Ciclo a propósito: formato -> calculo -> formato
  'js/formato.js': `import { calcular } from './calculo.js';
    export function formatear(v) { return String(v); }
    export function redondear(v) { return Math.round(v); }`,

  'js/olvidado.js': `export function nadieMeUsa() { return 1; }`,
};

const analysis = {};
for (const [ruta, contenido] of Object.entries(archivos)) {
  const res = analyzeFile(ruta, contenido);
  analysis[ruta] = { symbols: res.symbols, imports: res.imports };
}

const mapa = construirMapa(analysis, new Set());
const fallos = [];
const hayArista = (a, b) => mapa.aristas.some((x) => x.desde === a && x.hasta === b);

console.log('=== Dependencias detectadas');
for (const a of mapa.aristas) console.log(`  ${a.desde}  →  ${a.hasta}   (via ${a.via})`);

// El HTML debe enlazar con su script y su hoja de estilos
if (!hayArista('index.html', 'js/app.js')) fallos.push('no enlaza index.html con su <script src>');
if (!hayArista('index.html', 'css/estilos.css')) fallos.push('no enlaza index.html con su <link href>');
// El CSS con su @import
if (!hayArista('css/estilos.css', 'css/base.css')) fallos.push('no sigue el @import del CSS');
// Los imports de JavaScript, resolviendo la extension
if (!hayArista('js/app.js', 'js/calculo.js')) fallos.push('no resuelve el import relativo de JS');

console.log('\n=== Ciclos');
for (const c of mapa.ciclos) console.log('  ' + [...c, c[0]].join(' → '));
if (!mapa.ciclos.length) fallos.push('no detecto el ciclo calculo <-> formato');

console.log('\n=== Archivos que nadie importa');
console.log('  ' + (mapa.sinEntradas.join(', ') || '(ninguno)'));
if (!mapa.sinEntradas.includes('js/olvidado.js')) fallos.push('no senalo el archivo que nadie importa');
if (mapa.sinEntradas.includes('index.html')) fallos.push('marco index.html como huerfano siendo un punto de entrada');

console.log('\n=== Mas usados');
for (const f of mapa.masUsados) console.log(`  ${f.path}: ${f.entrantes} archivo(s) dependen de el`);

console.log('\n=== Dependencias externas');
console.log('  ' + (mapa.externos.join(', ') || '(ninguna)'));
if (!mapa.externos.includes('react')) fallos.push('no clasifico "react" como dependencia externa');

// La disposicion debe caber en el lienzo y no apilar todo en el mismo punto
const pos = calcularPosiciones(mapa, 880, 460);
const fuera = pos.filter((p) => p.x < 0 || p.x > 880 || p.y < 0 || p.y > 460);
if (fuera.length) fallos.push(`${fuera.length} nodo(s) fuera del lienzo`);
const distintos = new Set(pos.map((p) => `${Math.round(p.x / 10)},${Math.round(p.y / 10)}`));
if (distintos.size < pos.length * 0.8) fallos.push('los nodos se amontonan en el mismo sitio');

// La disposicion debe ser reproducible: el mapa no puede cambiar de forma sola
const pos2 = calcularPosiciones(mapa, 880, 460);
if (JSON.stringify(pos) !== JSON.stringify(pos2)) fallos.push('la disposicion no es reproducible');

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log(`  Todo correcto: ${mapa.nodos.length} archivos, ${mapa.aristas.length} dependencias, ${mapa.ciclos.length} ciclo(s).`);
