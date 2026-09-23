import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Comprueba que el paquete generado contiene TODO lo que debia contener.
 *
 * Existe por un fallo real: con las dependencias anidadas, las rutas
 * rebasaban el limite de Windows y algunos archivos no se copiaban sin dar
 * ningun error. El instalador se generaba bien y la aplicacion instalada
 * fallaba al arrancar con "Cannot find module './implementation'". Comparar
 * el numero de archivos habria cazado eso antes de publicar nada.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = path.join(root, 'release', 'win-unpacked', 'resources', 'app');

async function countFiles(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? await countFiles(path.join(dir, entry.name)) : 1;
  }
  return total;
}

const exists = (p) => fs.access(p).then(() => true).catch(() => false);

if (!(await exists(packaged))) {
  console.error(`No se encontro el paquete en ${packaged}. Ejecuta primero electron-builder.`);
  process.exit(1);
}

const problemas = [];

// 1. Las dependencias del backend deben llegar completas.
const origen = path.join(root, 'desktop', 'runtime', 'node_modules');
const destino = path.join(packaged, 'node_modules');
const esperados = await countFiles(origen);
const copiados = (await exists(destino)) ? await countFiles(destino) : 0;

console.log(`Dependencias: ${copiados} de ${esperados} archivos.`);
if (copiados !== esperados) {
  problemas.push(`Faltan ${esperados - copiados} archivo(s) de node_modules en el paquete.`);
}

// 2. Archivos concretos sin los que la aplicacion no arranca.
const criticos = [
  'server/src/app.js',
  'server/src/index.js',
  'server/src/env.js',
  'server/src/git-askpass.cjs',
  'server/src/services/git.js',
  'server/src/services/github.js',
  'server/src/services/runner.js',
  'server/src/services/fsbrowse.js',
  'server/src/services/store.js',
  'web/dist/index.html',
  'node_modules/express/package.json',
  'node_modules/function-bind/implementation.js',
  'node_modules/function-bind/package.json',
];

for (const rel of criticos) {
  if (!(await exists(path.join(packaged, rel.replace(/\//g, path.sep))))) {
    problemas.push(`Falta un archivo imprescindible: ${rel}`);
  }
}

// 3. Nada que no deba viajar en el paquete.
const prohibidos = ['server/data', '.env', 'server/.env'];
for (const rel of prohibidos) {
  if (await exists(path.join(packaged, rel.replace(/\//g, path.sep)))) {
    problemas.push(`El paquete incluye algo que no debe: ${rel}`);
  }
}

// 4. Margen de longitud de ruta para la instalacion real.
async function longest(dir, prefix = '') {
  let max = '';
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}\\${entry.name}` : entry.name;
    const candidate = entry.isDirectory() ? await longest(path.join(dir, entry.name), rel) : rel;
    if (candidate.length > max.length) max = candidate;
  }
  return max;
}

const DESTINO = 'C:\\Program Files\\CodeMind AI\\resources\\app\\';
const masLarga = await longest(packaged);
const total = DESTINO.length + masLarga.length;
console.log(`Ruta mas larga instalada: ${total} de 260 caracteres.`);
if (total > 240) problemas.push(`Las rutas llegan a ${total} caracteres: demasiado cerca del limite de Windows.`);

if (problemas.length) {
  console.error('\nEl paquete NO es valido:');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('\nPaquete correcto: completo, sin datos privados y con margen de ruta suficiente.');
