import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './store.js';

/**
 * Gestor de procesos reales.
 *
 * Arranca el servidor de desarrollo del propio proyecto del usuario (Vite,
 * Next, Angular, Vue, Svelte...) para que sus paginas puedan verse dentro de
 * CodeMind AI. Es la alternativa honesta a fingir que React o TypeScript se
 * ejecutan solos en el navegador: no se ejecutan, necesitan compilacion.
 */

const WINDOWS = process.platform === 'win32';
const MAX_LINES = 2000;
const URL_TIMEOUT_MS = 90000;

/** Registro vivo de procesos: clave projectId, valor Map de id -> proceso. */
const registry = new Map();

const ANSI = /\[[0-9;]*[A-Za-z]/g;
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d+))?(?:\/\S*)?/i;

const publicView = (p) => ({
  id: p.id,
  label: p.label,
  command: p.command,
  cwd: p.cwd,
  status: p.status,
  url: p.url,
  port: p.port,
  startedAt: p.startedAt,
  endedAt: p.endedAt,
  exitCode: p.exitCode,
});

function bucket(projectId) {
  if (!registry.has(projectId)) registry.set(projectId, new Map());
  return registry.get(projectId);
}

async function readPackageJson(cwd) {
  const raw = await fs.readFile(path.join(cwd, 'package.json'), 'utf8').catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'El package.json del proyecto no es un JSON valido.');
  }
}

const fileExists = (target) => fs.access(target).then(() => true).catch(() => false);

export async function scripts(cwd) {
  const pkg = await readPackageJson(cwd);
  if (!pkg) {
    return {
      hasPackageJson: false,
      packageManager: null,
      scripts: [],
      hasNodeModules: false,
      framework: null,
      notes: [
        'Este proyecto no tiene package.json, asi que no declara ningun servidor de desarrollo.',
        'La vista previa del panel inferior ejecuta HTML, CSS y JavaScript de navegador sin necesidad de nada mas.',
      ],
    };
  }

  const [pnpm, yarn, npmLock, hasNodeModules] = await Promise.all([
    fileExists(path.join(cwd, 'pnpm-lock.yaml')),
    fileExists(path.join(cwd, 'yarn.lock')),
    fileExists(path.join(cwd, 'package-lock.json')),
    fileExists(path.join(cwd, 'node_modules')),
  ]);

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const detect = [
    ['@angular/core', 'Angular'], ['next', 'Next.js'], ['nuxt', 'Nuxt'], ['astro', 'Astro'],
    ['svelte', 'Svelte'], ['vue', 'Vue'], ['react', 'React'], ['vite', 'Vite'],
  ];
  const framework = detect.find(([dep]) => deps[dep])?.[1] ?? null;

  const notes = [];
  if (!hasNodeModules) {
    notes.push('Faltan las dependencias (no existe node_modules). Instalalas antes de arrancar el proyecto.');
  }
  if (framework && framework !== 'Vite') {
    notes.push(`Proyecto de ${framework}: necesita su propio servidor de desarrollo, que es justo lo que arranca este panel.`);
  }

  return {
    hasPackageJson: true,
    packageManager: pnpm ? 'pnpm' : yarn ? 'yarn' : npmLock ? 'npm' : 'npm',
    scripts: Object.entries(pkg.scripts ?? {}).map(([name, command]) => ({ name, command: String(command) })),
    hasNodeModules,
    framework,
    notes,
  };
}

function appendLine(proc, stream, text) {
  const clean = text.replace(ANSI, '').replace(/\r$/, '');
  proc.lines.push({ seq: ++proc.seq, at: new Date().toISOString(), stream, text: clean });
  if (proc.lines.length > MAX_LINES) proc.lines.splice(0, proc.lines.length - MAX_LINES);

  if (!proc.url) {
    const match = LOCAL_URL.exec(clean);
    if (match) {
      proc.url = match[0].replace('0.0.0.0', 'localhost').replace(/[),.]+$/, '');
      proc.port = match[1] ? Number(match[1]) : null;
      proc.status = 'activo';
      appendLine(proc, 'sistema', `Servidor detectado en ${proc.url}`);
    }
  }
}

/** Trocea la salida en lineas conservando el resto entre eventos "data". */
function makeChunkHandler(proc, stream) {
  let pending = '';
  return (chunk) => {
    pending += chunk.toString('utf8');
    const parts = pending.split('\n');
    pending = parts.pop() ?? '';
    for (const line of parts) appendLine(proc, stream, line);
  };
}

export async function start(projectId, cwd, { script, command, args = [], label } = {}) {
  const info = await scripts(cwd);

  // Lista blanca estricta: o es un script declarado en el package.json del
  // propio proyecto, o es la instalacion de dependencias. Nunca texto libre.
  let runArgs;
  let displayCommand;
  const manager = info.packageManager ?? 'npm';

  if (command === 'install') {
    if (!info.hasPackageJson) throw new HttpError(400, 'No hay package.json: no hay dependencias que instalar.');
    runArgs = ['install'];
    displayCommand = `${manager} install`;
  } else if (script) {
    if (!info.hasPackageJson) throw new HttpError(400, 'Este proyecto no tiene package.json.');
    if (!info.scripts.some((s) => s.name === script)) {
      throw new HttpError(400, `El script "${script}" no existe en el package.json de este proyecto.`);
    }
    // En Windows hay que pasar por el shell para ejecutar npm.cmd, y el shell no
    // escapa los argumentos. Limitando el nombre a caracteres inofensivos, no
    // queda forma de colar un comando aunque el package.json venga de fuera.
    if (!/^[A-Za-z0-9_:.-]+$/.test(script)) {
      throw new HttpError(400, `El nombre de script "${script}" tiene caracteres que no se pueden ejecutar de forma segura.`);
    }
    runArgs = ['run', script];
    displayCommand = `${manager} run ${script}`;
  } else {
    throw new HttpError(400, 'Indica el script del proyecto que quieres ejecutar.');
  }
  if (args.length) throw new HttpError(400, 'No se admiten argumentos adicionales.');

  const existing = [...bucket(projectId).values()].find(
    (p) => p.command === displayCommand && (p.status === 'iniciando' || p.status === 'activo'),
  );
  if (existing) throw new HttpError(409, `"${displayCommand}" ya se esta ejecutando en este proyecto.`);

  const executable = WINDOWS ? `${manager}.cmd` : manager;
  const proc = {
    id: crypto.randomUUID(),
    label: label || displayCommand,
    command: displayCommand,
    cwd,
    status: 'iniciando',
    url: null,
    port: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    lines: [],
    seq: 0,
    child: null,
    urlTimer: null,
  };

  let child;
  try {
    child = spawn(executable, runArgs, {
      cwd,
      // Node 20+ exige shell para ejecutar un .cmd en Windows. Los argumentos
      // provienen de la lista blanca de arriba, nunca de texto del usuario,
      // asi que esto no abre ninguna via de inyeccion.
      shell: WINDOWS,
      windowsHide: true,
      // En POSIX el hijo va en su propio grupo, para poder matar el arbol entero.
      // En Windows NO se usa detached: crearia una consola nueva y perderiamos
      // su salida, que es justo lo que necesitamos para detectar la URL.
      detached: !WINDOWS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none', CI: '1' },
    });
  } catch (err) {
    throw new HttpError(500, `No se pudo arrancar "${displayCommand}": ${err.message}`);
  }

  proc.child = child;
  bucket(projectId).set(proc.id, proc);
  appendLine(proc, 'sistema', `Ejecutando ${displayCommand} en ${cwd}`);

  child.stdout?.on('data', makeChunkHandler(proc, 'stdout'));
  child.stderr?.on('data', makeChunkHandler(proc, 'stderr'));

  child.on('error', (err) => {
    proc.status = 'error';
    proc.endedAt = new Date().toISOString();
    appendLine(proc, 'sistema', `No se pudo ejecutar el comando: ${err.message}`);
  });

  child.on('exit', (code) => {
    clearTimeout(proc.urlTimer);
    proc.exitCode = code;
    proc.endedAt = new Date().toISOString();
    proc.status = code === 0 ? 'terminado' : 'error';
    appendLine(proc, 'sistema', `El proceso termino con codigo ${code}`);
  });

  proc.urlTimer = setTimeout(() => {
    if (proc.status === 'iniciando') {
      proc.status = 'activo';
      appendLine(proc, 'sistema', 'No se detecto ninguna direccion local. Puede que esta tarea no levante un servidor.');
    }
  }, URL_TIMEOUT_MS);

  return publicView(proc);
}

export function listProcesses(projectId) {
  return [...bucket(projectId).values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicView);
}

export function logs(projectId, processId, since = 0) {
  const proc = bucket(projectId).get(processId);
  if (!proc) throw new HttpError(404, 'Ese proceso ya no existe.');
  return { lines: proc.lines.filter((l) => l.seq > since), process: publicView(proc) };
}

export async function stop(projectId, processId) {
  const proc = bucket(projectId).get(processId);
  if (!proc) throw new HttpError(404, 'Ese proceso ya no existe.');
  if (proc.status === 'terminado' || proc.status === 'error') return publicView(proc);

  await killTree(proc);
  appendLine(proc, 'sistema', 'Detenido por el usuario.');
  return publicView(proc);
}

/**
 * Un servidor de desarrollo lanza procesos hijos: matar solo al padre dejaria
 * el puerto ocupado y el proceso huerfano.
 */
function killTree(proc) {
  const child = proc.child;
  if (!child || child.killed || child.exitCode !== null) return Promise.resolve();
  clearTimeout(proc.urlTimer);

  return new Promise((resolve) => {
    if (WINDOWS) {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve());
      return;
    }
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* ya habia terminado */
      }
      resolve();
    }, 5000);
  });
}

export function stopAll() {
  for (const processes of registry.values()) {
    for (const proc of processes.values()) void killTree(proc);
  }
}

export async function probeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, 'La direccion no es valida.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Solo se admiten direcciones http y https.');
  }

  try {
    const res = await fetch(parsed.href, { redirect: 'follow', signal: AbortSignal.timeout(5000) });
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (res.headers.get('content-security-policy') || '').toLowerCase();
    const frameAncestors = /frame-ancestors\s+([^;]+)/.exec(csp)?.[1] ?? null;

    let embeddable = true;
    let reason = null;
    if (xfo.includes('deny') || xfo.includes('sameorigin')) {
      embeddable = false;
      reason = `El sitio envia la cabecera X-Frame-Options (${xfo}), que prohibe mostrarlo dentro de otra pagina.`;
    } else if (frameAncestors && /'none'|'self'/.test(frameAncestors)) {
      embeddable = false;
      reason = `El sitio restringe frame-ancestors a ${frameAncestors.trim()}, asi que no puede incrustarse aqui.`;
    }
    return { url: parsed.href, reachable: true, status: res.status, embeddable, reason };
  } catch (err) {
    const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return {
      url: parsed.href,
      reachable: false,
      status: null,
      embeddable: false,
      reason: timeout
        ? 'La direccion no respondio a tiempo.'
        : 'No se pudo conectar. Puede que el servidor aun se este iniciando o que el puerto no este abierto.',
    };
  }
}
