import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Comprime el codigo fuente para compartirlo o guardarlo.
 *
 *   npm run fuente
 *
 * Usa `git archive`, que mete exactamente lo que esta en el ultimo commit:
 * nada de release/ (los instaladores, cientos de megas), node_modules,
 * web/dist, server/data ni claves. Por eso un .rar hecho a mano de la carpeta
 * pesaba 500 MB y este pesa unos pocos.
 *
 * Si hay cambios sin confirmar se avisa: no entran en el archivo.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
const commit = git('rev-parse', '--short', 'HEAD');
const destinoDir = path.join(raiz, 'release');
fs.mkdirSync(destinoDir, { recursive: true });
const destino = path.join(destinoDir, `codemind-ai-fuente-${version}-${commit}.zip`);

const pendientes = git('status', '--porcelain');
if (pendientes) {
  console.warn('Aviso: hay cambios sin confirmar y NO van en el archivo:');
  console.warn(pendientes.split('\n').map((l) => `  ${l}`).join('\n'));
}

git('archive', '--format=zip', `--prefix=codemind-ai/`, '-o', destino, 'HEAD');
const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(2);
console.log(`Listo: ${path.relative(raiz, destino)} (${mb} MB, commit ${commit})`);
