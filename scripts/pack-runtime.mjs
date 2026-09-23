import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prepara las dependencias de ejecucion del backend para el instalador.
 *
 * En el repositorio, express y compania viven en el node_modules de la raiz,
 * mezcladas con Electron, Vite y Monaco, que no deben viajar en el paquete.
 * Aqui se instala un arbol limpio con solo lo que el backend necesita.
 *
 * La instalacion se hace en una carpeta temporal FUERA del monorepo. Dentro,
 * npm ve el node_modules del padre y acaba anidando las dependencias
 * transitivas unas dentro de otras, generando rutas de casi 200 caracteres.
 * Sumadas al prefijo de instalacion real (C:\\Program Files\\CodeMind AI\\...)
 * rebasan el limite de 260 caracteres de Windows y algunos archivos no se
 * copian, sin ningun error visible: la aplicacion instalada fallaba con
 * "Cannot find module './implementation'" porque a function-bind le faltaban
 * implementation.js y package.json. Fuera del monorepo npm reparte plano y la
 * ruta mas larga se queda en unas decenas de caracteres.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'desktop', 'runtime');
const staging = path.join(os.tmpdir(), 'codemind-runtime-build');

const serverPkg = JSON.parse(await fs.readFile(path.join(root, 'server', 'package.json'), 'utf8'));
const deps = serverPkg.dependencies ?? {};

console.log(`Instalando ${Object.keys(deps).length} dependencia(s) de ejecucion del backend:`);
for (const [name, range] of Object.entries(deps)) console.log(`  ${name} ${range}`);

await fs.rm(staging, { recursive: true, force: true });
await fs.mkdir(staging, { recursive: true });
await fs.writeFile(
  path.join(staging, 'package.json'),
  `${JSON.stringify({ name: 'codemind-runtime', private: true, version: '1.0.0', dependencies: deps }, null, 2)}\n`,
  'utf8',
);

await new Promise((resolve, reject) => {
  execFile(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'],
    { cwd: staging, shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (err) return reject(new Error(`npm install fallo: ${stderr || stdout || err.message}`));
      resolve();
    },
  );
});

// El arbol resultante sustituye por completo al anterior.
await fs.rm(path.join(runtime, 'node_modules'), { recursive: true, force: true });
await fs.mkdir(runtime, { recursive: true });
await fs.cp(path.join(staging, 'node_modules'), path.join(runtime, 'node_modules'), { recursive: true });
await fs.copyFile(path.join(staging, 'package.json'), path.join(runtime, 'package.json'));
await fs.rm(staging, { recursive: true, force: true });

const modules = path.join(runtime, 'node_modules');
const installed = (await fs.readdir(modules)).filter((n) => !n.startsWith('.'));

/** Recorre el arbol contando archivos y midiendo la ruta relativa mas larga. */
async function measure(dir, prefix = '') {
  let files = 0;
  let longest = '';
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}\\${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const inner = await measure(path.join(dir, entry.name), rel);
      files += inner.files;
      if (inner.longest.length > longest.length) longest = inner.longest;
    } else {
      files++;
      if (rel.length > longest.length) longest = rel;
    }
  }
  return { files, longest };
}

const { files, longest } = await measure(modules);

// Presupuesto: la ruta de instalacion mas larga que hay que soportar.
const DESTINO = 'C:\\Program Files\\CodeMind AI\\resources\\app\\node_modules\\';
const total = DESTINO.length + longest.length;

console.log(`\nListo: ${installed.length} paquetes, ${files} archivos.`);
console.log(`Ruta relativa mas larga: ${longest.length} caracteres`);
console.log(`Instalada en Program Files ocuparia ${total} de los 260 que admite Windows.`);

if (total > 240) {
  console.error(
    '\nERROR: las rutas son demasiado largas. Instalado en Program Files se perderian archivos sin\n' +
      'aviso y la aplicacion no arrancaria. Revisa como se genera este arbol de dependencias.',
  );
  process.exit(1);
}
