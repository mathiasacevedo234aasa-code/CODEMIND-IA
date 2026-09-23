import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prepara las dependencias de ejecucion del backend para el instalador.
 *
 * En el repositorio, express y compania viven en el node_modules de la raiz,
 * mezcladas con Electron, Vite y Monaco, que no deben viajar en el paquete.
 * Aqui se instala un arbol limpio con solo lo que el backend necesita en
 * tiempo de ejecucion, y ese arbol es el que electron-builder copia.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'desktop', 'runtime');

const serverPkg = JSON.parse(await fs.readFile(path.join(root, 'server', 'package.json'), 'utf8'));
const deps = serverPkg.dependencies ?? {};

const manifest = {
  name: 'codemind-runtime',
  private: true,
  version: serverPkg.version ?? '0.1.0',
  description: 'Dependencias de ejecucion del backend para el paquete de escritorio',
  dependencies: deps,
};

await fs.mkdir(runtime, { recursive: true });
await fs.writeFile(path.join(runtime, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Instalando ${Object.keys(deps).length} dependencia(s) de ejecucion en desktop/runtime...`);
for (const [name, range] of Object.entries(deps)) console.log(`  ${name} ${range}`);

// --omit=dev y sin workspaces: este arbol debe ser autonomo.
await new Promise((resolve, reject) => {
  execFile(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--install-strategy=nested', '--ignore-scripts'],
    { cwd: runtime, shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (err) return reject(new Error(`npm install fallo en desktop/runtime: ${stderr || stdout || err.message}`));
      resolve();
    },
  );
});

const installed = await fs.readdir(path.join(runtime, 'node_modules'));
console.log(`Listo: ${installed.filter((n) => !n.startsWith('.')).length} paquetes en desktop/runtime/node_modules`);
