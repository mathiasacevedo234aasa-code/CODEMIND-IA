/**
 * Pruebas de lo "avanzado" de git: traer cambios con historial divergido
 * (vista previa, fusion, rebase, conflicto y deshacer), deshacer el ultimo
 * commit, stash y las dos versiones para comparar lado a lado.
 *
 * No necesita GitHub ni el servidor: el "origin" es un repositorio desnudo en
 * una carpeta temporal, y el token es de mentira (git local no lo usa). Los
 * datos de la aplicacion van tambien a una carpeta temporal, asi que no toca
 * tu configuracion real.
 *
 *   node tests/git-avanzado.mjs
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-git-'));
process.env.CODEMIND_DATA_DIR = path.join(tmp, 'datos');
await fs.mkdir(process.env.CODEMIND_DATA_DIR, { recursive: true });
await fs.writeFile(path.join(process.env.CODEMIND_DATA_DIR, 'secrets.json'), JSON.stringify({ githubToken: 'token-de-prueba' }));

const git = await import('../server/src/services/git.js');
const gh = await import('../server/src/services/github.js');

let fallos = 0;
const ok = (cond, que) => { console.log(`${cond ? '  ok ' : '  FALLO'} ${que}`); if (!cond) fallos++; };
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const escribir = (cwd, f, t) => fs.writeFile(path.join(cwd, f), t);
const lanza = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

// origin desnudo + dos clones: "yo" y "otro"
const origen = path.join(tmp, 'origen.git');
g(tmp, 'init', '-q', '--bare', '-b', 'main', origen);
const yo = path.join(tmp, 'yo');
const otro = path.join(tmp, 'otro');
for (const d of [yo, otro]) {
  g(tmp, 'clone', '-q', origen, d);
  g(d, 'config', 'user.email', 'p@p');
  g(d, 'config', 'user.name', 'Prueba');
  g(d, 'config', 'core.autocrlf', 'false');
  g(d, 'checkout', '-q', '-B', 'main');
}
await escribir(yo, 'a.txt', 'uno\n');
await escribir(yo, 'b.txt', 'b\n');
g(yo, 'add', '.'); g(yo, 'commit', '-qm', 'inicio'); g(yo, 'push', '-q', '-u', 'origin', 'main');
g(otro, 'pull', '-q', 'origin', 'main');

console.log('Traer cambios con historial divergido');
await escribir(otro, 'b.txt', 'b del otro\n');
g(otro, 'commit', '-qam', 'cambio del otro'); g(otro, 'push', '-q', 'origin', 'main');
await escribir(yo, 'a.txt', 'uno\ndos\n');
g(yo, 'commit', '-qam', 'cambio mio');

const previa = await gh.previaPull(yo, 'main');
ok(previa.divergido && previa.tuyos === 1 && previa.suyos === 1, 'la vista previa detecta la divergencia (1 y 1)');
ok(previa.commits[0]?.asunto === 'cambio del otro', 'enseña el commit que llega');
ok(previa.enAmbos.length === 0, 'sin archivos tocados en los dos lados');

const ff = await lanza(() => gh.pullCon(yo, 'main', 'ff'));
ok(ff && ff.status === 409, 'solo avanzar se niega con divergencia');

await escribir(yo, 'sucio.txt', 'x');
const sucio = await lanza(() => gh.pullCon(yo, 'main', 'merge'));
ok(sucio && /sin confirmar/.test(sucio.message), 'no fusiona con cambios sin confirmar');
await fs.rm(path.join(yo, 'sucio.txt'));

await gh.pullCon(yo, 'main', 'merge');
ok(g(yo, 'log', '-1', '--format=%p').split(' ').length === 2, 'merge crea un commit de fusion');
g(yo, 'push', '-q', 'origin', 'main');

console.log('Rebase');
g(otro, 'pull', '-q', 'origin', 'main');
await escribir(otro, 'b.txt', 'b otra vez\n'); g(otro, 'commit', '-qam', 'otro 2'); g(otro, 'push', '-q', 'origin', 'main');
await escribir(yo, 'a.txt', 'uno\ndos\ntres\n'); g(yo, 'commit', '-qam', 'mio 2');
await gh.pullCon(yo, 'main', 'rebase');
ok(g(yo, 'log', '-1', '--format=%s') === 'mio 2' && g(yo, 'log', '-2', '--format=%s').includes('otro 2'), 'rebase deja mis commits encima');
g(yo, 'push', '-q', 'origin', 'main');

console.log('Conflicto y deshacer');
g(otro, 'pull', '-q', 'origin', 'main');
await escribir(otro, 'a.txt', 'version del otro\n'); g(otro, 'commit', '-qam', 'choca'); g(otro, 'push', '-q', 'origin', 'main');
await escribir(yo, 'a.txt', 'version mia\n'); g(yo, 'commit', '-qam', 'choca tambien');
ok((await gh.previaPull(yo, 'main')).enAmbos.includes('a.txt'), 'avisa de a.txt cambiado en los dos lados');
const antes = g(yo, 'rev-parse', 'HEAD');
const conflicto = await lanza(() => gh.pullCon(yo, 'main', 'merge'));
ok(conflicto && /conflictos/.test(conflicto.message) && conflicto.message.includes('a.txt'), 'para y nombra el archivo en conflicto');
const ab = await gh.abortarPull(yo);
ok(ab.deshecho === 'fusion' && g(yo, 'rev-parse', 'HEAD') === antes && !g(yo, 'status', '--porcelain'), 'deshacer deja todo como estaba');
ok(Boolean(await lanza(() => gh.abortarPull(yo))), 'deshacer sin nada a medias se niega');

console.log('Deshacer el ultimo commit');
const subido = await lanza(() => git.deshacerUltimoCommit(otro));
ok(subido && /ya se subio/.test(subido.message), 'no deshace un commit que ya esta en el remoto');
const r = await git.deshacerUltimoCommit(yo);
ok(r.deshecho === 'choca tambien' && g(yo, 'diff', '--cached', '--name-only') === 'a.txt', 'deshace y deja los cambios preparados');

console.log('Stash y lado a lado');
const v = await git.versiones(yo, 'a.txt', true);
ok(v.antes.includes('dos') && v.despues === 'version mia\n', 'versiones HEAD -> preparado');
await escribir(yo, 'nuevo.txt', 'n');
await git.stashGuardar(yo, 'a medias');
ok(!g(yo, 'status', '--porcelain') && (await git.stashListar(yo))[0]?.mensaje.includes('a medias'), 'stash aparta todo, tambien lo nuevo');
await git.stashRecuperar(yo, 'stash@{0}');
ok(g(yo, 'status', '--porcelain').includes('nuevo.txt') && (await git.stashListar(yo)).length === 0, 'stash se recupera');
ok(Boolean(await lanza(() => git.stashDescartar(yo, '--all'))), 'rechaza referencias de stash raras');

console.log('Un proyecto interno no ve el repositorio de fuera');
// La carpeta de datos (y con ella los proyectos internos) dentro de otro
// repositorio: es lo que pasa en desarrollo, con los datos dentro del repo de
// la aplicacion. git no debe subir hasta el de fuera.
g(tmp, 'init', '-q');
const interno = path.join(process.env.CODEMIND_DATA_DIR, 'projects', 'prj_x', 'workspace');
await fs.mkdir(interno, { recursive: true });
await escribir(interno, 'a.js', 'x');
const st = await git.status(interno);
ok(!st.isRepo, 'el estado de git del proyecto interno no es el del repositorio que lo contiene');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
