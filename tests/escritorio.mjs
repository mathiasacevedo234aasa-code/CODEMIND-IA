import { spawn, execFile } from 'node:child_process';
import path from 'node:path';

/**
 * Arranca la aplicacion de escritorio, comprueba contra su backend interno y
 * la cierra. Todo dentro de un unico proceso para que Electron no tenga que
 * sobrevivir entre llamadas.
 */
import path2 from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path2.resolve(path2.dirname(fileURLToPath(import.meta.url)), '..');
const electron = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

const child = spawn(electron, [path.join(ROOT, 'desktop')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });

const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('El backend no anuncio su URL en 40 s.\n' + out)), 40000);
  const iv = setInterval(() => {
    const m = /backend en (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
    if (m) { clearInterval(iv); clearTimeout(timer); resolve(m[1]); }
  }, 300);
});

console.log('  Backend interno:', url);

const get = async (p) => {
  const r = await fetch(url + p);
  return { status: r.status, text: await r.text() };
};

const page = await get('/');
console.log('  La ventana carga la aplicacion:', page.status === 200 && page.text.includes('CodeMind AI') ? 'si' : `NO (${page.status})`);

const health = JSON.parse((await get('/api/health')).text);
console.log('  Salud:', `groq=${health.groq.configured} git=${health.git.available} modelo=${health.defaultModel}`);

const projects = JSON.parse((await get('/api/projects')).text).projects;
console.log('  Proyectos visibles:', projects.length ? projects.map((p) => p.name).join(', ') : '(ninguno)');

const roots = JSON.parse((await get('/api/fs/roots')).text).roots;
console.log('  Discos del equipo:', roots.filter((r) => r.kind === 'unidad').map((r) => r.label).join(', '));

const assets = await get('/assets/' + (page.text.match(/assets\/(index-[\w-]+\.js)/) ?? [])[1]);
console.log('  El paquete del frontend se sirve:', assets.status === 200 ? 'si' : `NO (${assets.status})`);

// Cierre ordenado
child.kill();
await new Promise((r) => setTimeout(r, 2500));
execFile('taskkill', ['/IM', 'electron.exe', '/F', '/T'], () => {});
console.log('\n  Aplicacion de escritorio cerrada.');
