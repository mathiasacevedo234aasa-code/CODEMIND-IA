import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Arranca la aplicacion de escritorio, comprueba contra su backend interno y
 * la cierra. Todo dentro de un unico proceso para que Electron no tenga que
 * sobrevivir entre llamadas.
 *
 *   node tests/escritorio.mjs             el codigo, con el Electron del repo
 *   node tests/escritorio.mjs --paquete   el .exe ya construido en release/
 *
 * La segunda forma es la que importa antes de publicar: comprueba el programa
 * que va a recibir el usuario, no el que tenemos nosotros en el repositorio.
 * Ahi es donde han aparecido los fallos de empaquetado, que no se ven de
 * ninguna otra manera.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usarPaquete = process.argv.includes('--paquete');

const empaquetado = path.join(ROOT, 'release', 'win-unpacked', 'CodeMind AI.exe');
if (usarPaquete && !(await fs.access(empaquetado).then(() => true).catch(() => false))) {
  console.error(`No existe ${empaquetado}. Ejecuta "npm run desktop:build" antes.`);
  process.exit(1);
}

const ejecutable = usarPaquete
  ? empaquetado
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const argumentos = usarPaquete ? [] : [path.join(ROOT, 'desktop')];
const proceso = usarPaquete ? 'CodeMind AI.exe' : 'electron.exe';

console.log(`=== ${usarPaquete ? 'Aplicacion empaquetada' : 'Aplicacion en desarrollo'}`);
console.log('  ' + ejecutable);

const fallos = [];
const comprobar = (condicion, texto) => { if (!condicion) fallos.push(texto); };

const child = spawn(ejecutable, argumentos, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });

const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('El backend no anuncio su URL en 60 s.\n' + out)), 60000);
  const iv = setInterval(() => {
    const m = /backend en (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
    if (m) { clearInterval(iv); clearTimeout(timer); resolve(m[1]); }
  }, 300);
});

console.log('  Backend interno:', url);

const get = async (p) => {
  const r = await fetch(url + p);
  return { status: r.status, text: await r.text(), tipo: r.headers.get('content-type') ?? '' };
};
const json = async (p) => JSON.parse((await get(p)).text);

const page = await get('/');
const cargaLaApp = page.status === 200 && page.text.includes('CodeMind AI');
console.log('  La ventana carga la aplicacion:', cargaLaApp ? 'si' : `NO (${page.status})`);
comprobar(cargaLaApp, 'la ventana no carga la aplicacion');

const health = await json('/api/health');
console.log(`  Salud: ia=${health.ia.nombre} (${health.ia.configured ? 'con clave' : 'sin clave'}) git=${health.git.available}`);
comprobar(Boolean(health.ia?.nombre), 'el estado no informa del proveedor de IA');

const { proveedores } = await json('/api/ai/proveedores');
console.log('  Proveedores de IA:', proveedores.map((p) => p.id).join(', '));
comprobar(proveedores.length >= 5, 'faltan proveedores de IA en el paquete');
comprobar(proveedores.some((p) => p.local), 'no esta la opcion local (Ollama)');

// El terminal es lo que mas puede romper el empaquetado: lleva un modulo
// nativo, y un nativo mal empaquetado no falla hasta que se usa.
const consola = await json('/api/terminal/disponibilidad');
console.log(`  Consola: ${consola.shell}, modo ${consola.modo}${consola.motivo ? ` (${consola.motivo})` : ''}`);
comprobar(consola.modo === 'terminal', `el terminal nativo no carga en el paquete: ${consola.motivo}`);

const projects = await json('/api/projects');
console.log('  Proyectos visibles:', projects.projects.length ? projects.projects.map((p) => p.name).join(', ') : '(ninguno)');

const { roots } = await json('/api/fs/roots');
const unidades = roots.filter((r) => r.kind === 'unidad').map((r) => r.label);
console.log('  Discos del equipo:', unidades.join(', '));
comprobar(unidades.length > 0, 'no se ve ninguna unidad de disco');

const assets = await get('/assets/' + (page.text.match(/assets\/(index-[\w-]+\.js)/) ?? [])[1]);
console.log('  El paquete del frontend se sirve:', assets.status === 200 ? 'si' : `NO (${assets.status})`);
comprobar(assets.status === 200, 'el paquete del frontend no se sirve');

// Las gramaticas son 23 MB de binarios que se copian aparte: si el
// empaquetado se los deja, el analisis de Python o Java falla en silencio.
const gramatica = await get('/gramaticas/tree-sitter-python.wasm');
const bytes = gramatica.text.length;
console.log(`  Gramatica de Python servida: ${gramatica.status === 200 ? `si (${(bytes / 1024).toFixed(0)} KB)` : `NO (${gramatica.status})`}`);
comprobar(gramatica.status === 200 && bytes > 100000, 'la gramatica de tree-sitter no llega al navegador');

// Cierre ordenado
child.kill();
await new Promise((r) => setTimeout(r, 2500));
execFile('taskkill', ['/IM', proceso, '/F', '/T'], () => {});
await new Promise((r) => setTimeout(r, 1500));

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log('  Todo correcto: arranca, sirve el frontend, ve el disco, carga el terminal nativo y las gramaticas.');
process.exit(0);
