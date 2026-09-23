import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lanzador de desarrollo: backend y frontend a la vez.
 *
 * No se usa "concurrently" a proposito. En Windows, cuando el backend arranca
 * el servidor de desarrollo del proyecto del usuario, aparece un proceso nieto
 * en la misma consola y concurrently se lleva por delante todo el arbol: se
 * caian el backend, Vite y el propio servidor recien arrancado. Este lanzador
 * se limita a poner en marcha los dos procesos y a reenviar su salida, que es
 * lo unico que hacia falta.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COLORS = { server: '[34m', web: '[35m', reset: '[0m' };

function launch(name, args, cwd) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const prefix = `${COLORS[name] ?? ''}[${name}]${COLORS.reset} `;
  const forward = (stream, target) => {
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk.toString('utf8');
      const parts = pending.split('\n');
      pending = parts.pop() ?? '';
      for (const line of parts) target.write(`${prefix}${line}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on('exit', (code) => {
    process.stdout.write(`${prefix}terminado con codigo ${code}\n`);
    if (code !== 0) shutdown(code ?? 1);
  });

  return child;
}

const children = [];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

children.push(launch('server', [path.join(root, 'server', 'src', 'index.js')], root));
children.push(launch('web', [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], path.join(root, 'web')));

console.log('CodeMind AI en desarrollo. Interfaz: http://localhost:5173');
