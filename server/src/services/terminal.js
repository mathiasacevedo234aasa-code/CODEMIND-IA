import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './store.js';

/**
 * Consola del proyecto.
 *
 * Arranca el interprete de comandos real del equipo (PowerShell en Windows,
 * el shell del usuario en Linux y macOS) dentro de la carpeta del proyecto.
 * Los comandos son de verdad, la salida es la de verdad y el codigo de salida
 * es el de verdad.
 *
 * Se usa un pseudoterminal (node-pty) cuando el equipo puede: es lo que hace
 * que el interprete se comporte como en una ventana de consola normal, con su
 * prompt, el eco de lo que escribes, los colores y los programas que dibujan
 * en pantalla. El modulo nativo viene precompilado con N-API, que es estable
 * entre versiones, asi que no hay que recompilarlo para Electron.
 *
 * Si ese modulo no carga en este equipo NO se finge que hay un terminal: se
 * cae a un interprete por tuberias, que ejecuta comandos igual de verdad pero
 * sin las caracteristicas de un terminal, y la interfaz lo dice con todas las
 * letras en lugar de dejar al usuario preguntandose por que algo no pinta.
 *
 * Aqui no hay lista blanca, a diferencia del panel de ejecucion: una consola
 * que solo deja escribir ciertos comandos no es una consola. El servidor solo
 * escucha en 127.0.0.1 y cada sesion vive dentro de la carpeta del proyecto.
 */

const WINDOWS = process.platform === 'win32';
const MAX_BYTES = 400_000;
const MAX_SESIONES = 8;
const INACTIVIDAD_MS = 1000 * 60 * 60 * 6;

/** Sesiones vivas: clave projectId, valor Map de id -> sesion. */
const registro = new Map();

function cajon(projectId) {
  if (!registro.has(projectId)) registro.set(projectId, new Map());
  return registro.get(projectId);
}

// ------------------------------------------------- el modulo nativo

let ptyModulo;
let ptyMotivo = null;

/** Carga node-pty una sola vez y recuerda por que no pudo, si no pudo. */
async function cargarPty() {
  if (ptyModulo !== undefined) return ptyModulo;
  try {
    const mod = await import('@lydell/node-pty');
    ptyModulo = mod.default ?? mod;
    if (typeof ptyModulo.spawn !== 'function') throw new Error('el modulo no expone spawn()');
  } catch (err) {
    ptyModulo = null;
    ptyMotivo = err.message;
  }
  return ptyModulo;
}

/** Busca un ejecutable en el PATH. */
function enPath(nombre) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, nombre))) return path.join(dir, nombre);
  }
  return null;
}

/**
 * Los interpretes que hay DE VERDAD en este equipo. Solo se ofrece lo que
 * existe: un perfil de WSL sin WSL instalado seria una opcion que falla.
 */
export function perfiles() {
  if (!WINDOWS) {
    const shell = process.env.SHELL || '/bin/bash';
    const lista = [{ id: 'sistema', comando: shell, args: ['-i'], nombre: shell.split('/').pop() ?? 'shell' }];
    for (const s of ['bash', 'zsh', 'fish']) {
      const ruta = enPath(s);
      if (ruta && !lista.some((p) => p.comando === ruta)) lista.push({ id: s, comando: ruta, args: ['-i'], nombre: s });
    }
    return lista;
  }
  const lista = [{ id: 'powershell', comando: 'powershell.exe', args: ['-NoLogo', '-NoProfile'], nombre: 'PowerShell' }];
  const pwsh = enPath('pwsh.exe');
  if (pwsh) lista.push({ id: 'pwsh', comando: pwsh, args: ['-NoLogo'], nombre: 'PowerShell 7' });
  lista.push({ id: 'cmd', comando: 'cmd.exe', args: [], nombre: 'CMD' });
  const bash = [
    path.join(process.env.ProgramFiles ?? 'C:\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ].find((r) => fs.existsSync(r));
  if (bash) lista.push({ id: 'gitbash', comando: bash, args: ['--login', '-i'], nombre: 'Git Bash' });
  const wsl = path.join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'wsl.exe');
  if (fs.existsSync(wsl)) lista.push({ id: 'wsl', comando: wsl, args: [], nombre: 'WSL' });
  return lista;
}

/** El interprete pedido, o el de siempre si no se pide o no existe. */
export function interprete(perfil) {
  const lista = perfiles();
  return lista.find((p) => p.id === perfil) ?? lista[0];
}

/** Que consola puede ofrecer este equipo, sin abrir ninguna. */
export async function disponibilidad() {
  const pty = await cargarPty();
  const { nombre } = interprete();
  return {
    shell: nombre,
    perfiles: perfiles().map(({ id, nombre: n }) => ({ id, nombre: n })),
    modo: pty ? 'terminal' : 'tuberias',
    motivo: pty ? null : `No se pudo cargar el terminal nativo: ${ptyMotivo}`,
  };
}

// ------------------------------------------------------- las sesiones

const vistaPublica = (s) => ({
  id: s.id,
  cwd: s.cwd,
  shell: s.shell,
  modo: s.modo,
  estado: s.estado,
  creada: s.creada,
  exitCode: s.exitCode,
});

function anadir(sesion, texto) {
  if (!texto) return;
  sesion.seq++;
  sesion.trozos.push({ seq: sesion.seq, texto });
  sesion.bytes += texto.length;
  // La consola es una ventana, no un archivo de registro: lo muy viejo se tira.
  while (sesion.bytes > MAX_BYTES && sesion.trozos.length > 1) {
    sesion.bytes -= sesion.trozos.shift().texto.length;
  }
}

function caducar() {
  const ahora = Date.now();
  for (const sesiones of registro.values()) {
    for (const sesion of sesiones.values()) {
      if (sesion.estado === 'viva' && ahora - sesion.tocada > INACTIVIDAD_MS) matar(sesion);
    }
  }
}

const ENTORNO = () => ({
  ...process.env,
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  // Un paginador dentro de una consola incrustada deja al usuario atrapado.
  GIT_PAGER: 'cat',
  PAGER: 'cat',
});

export async function abrir(projectId, cwd, { cols = 100, rows = 30, perfil } = {}) {
  caducar();
  const sesiones = cajon(projectId);
  const vivas = [...sesiones.values()].filter((s) => s.estado === 'viva');
  if (vivas.length >= MAX_SESIONES) {
    throw new HttpError(409, `Ya hay ${MAX_SESIONES} consolas abiertas en este proyecto. Cierra alguna antes de abrir otra.`);
  }

  const pty = await cargarPty();
  const { comando, args, nombre } = interprete(perfil);
  const sesion = {
    id: crypto.randomUUID(),
    cwd,
    shell: nombre,
    modo: pty ? 'terminal' : 'tuberias',
    estado: 'viva',
    creada: new Date().toISOString(),
    tocada: Date.now(),
    exitCode: null,
    trozos: [],
    bytes: 0,
    seq: 0,
    proceso: null,
  };

  try {
    if (pty) {
      const p = pty.spawn(comando, args, {
        name: 'xterm-256color',
        cols: Math.max(20, Math.min(500, cols)),
        rows: Math.max(5, Math.min(200, rows)),
        cwd,
        env: ENTORNO(),
      });
      sesion.proceso = p;
      p.onData((texto) => anadir(sesion, texto));
      p.onExit(({ exitCode }) => {
        sesion.estado = 'cerrada';
        sesion.exitCode = exitCode;
        anadir(sesion, `\r\n[la consola termino con codigo ${exitCode}]\r\n`);
      });
    } else {
      const hijo = spawn(comando, WINDOWS ? ['-NoLogo', '-NoProfile', '-Command', '-'] : args, {
        cwd,
        windowsHide: true,
        // En POSIX el hijo va en su propio grupo para poder matar el arbol.
        // En Windows no: crearia una consola aparte y perderiamos la salida.
        detached: !WINDOWS,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Sin terminal, muchas herramientas apagan el color y otras se quedan
        // esperando una respuesta que nadie va a dar.
        env: { ...ENTORNO(), FORCE_COLOR: '1', CI: '1' },
      });
      sesion.proceso = hijo;
      hijo.stdout?.setEncoding('utf8');
      hijo.stderr?.setEncoding('utf8');
      hijo.stdout?.on('data', (t) => anadir(sesion, t));
      hijo.stderr?.on('data', (t) => anadir(sesion, t));
      hijo.on('error', (err) => {
        sesion.estado = 'error';
        anadir(sesion, `\r\n[no se pudo ejecutar el interprete: ${err.message}]\r\n`);
      });
      hijo.on('exit', (code) => {
        sesion.estado = 'cerrada';
        sesion.exitCode = code;
        anadir(sesion, `\r\n[la consola termino con codigo ${code}]\r\n`);
      });
    }
  } catch (err) {
    throw new HttpError(500, `No se pudo abrir la consola (${comando}): ${err.message}`);
  }

  sesiones.set(sesion.id, sesion);
  anadir(sesion, `\x1b[2m${nombre} en ${cwd}\x1b[0m\r\n`);
  if (sesion.modo === 'tuberias') {
    anadir(sesion, `\x1b[33mSin terminal: los comandos se ejecutan igual, pero no hay prompt ni eco de lo que escribes.\x1b[0m\r\n`);
  }
  return vistaPublica(sesion);
}

function buscar(projectId, id) {
  const sesion = cajon(projectId).get(id);
  if (!sesion) throw new HttpError(404, 'Esa consola ya no existe.');
  return sesion;
}

export function escribir(projectId, id, datos) {
  const sesion = buscar(projectId, id);
  if (sesion.estado !== 'viva') throw new HttpError(409, 'Esa consola ya esta cerrada.');
  if (typeof datos !== 'string' || !datos.length) throw new HttpError(400, 'No hay nada que escribir.');
  if (datos.length > 100_000) throw new HttpError(400, 'El texto es demasiado largo para una sola orden.');

  sesion.tocada = Date.now();
  if (sesion.modo === 'terminal') {
    sesion.proceso.write(datos);
  } else {
    // Sin terminal no hay eco: si no se refleja aqui, el usuario no ve lo que
    // acaba de escribir. El retorno del navegador llega como \r y el
    // interprete espera \n.
    anadir(sesion, datos.replace(/\r/g, '\r\n'));
    sesion.proceso.stdin.write(datos.replace(/\r/g, os.EOL));
  }
  return vistaPublica(sesion);
}

/**
 * Espera a que el interprete termine de arrancar.
 *
 * Una consola recien abierta tarda un momento en sacar su prompt, y lo que se
 * le escriba antes se pierde o se mezcla: PowerShell se quedaba en modo
 * continuacion (">>") y el comando no llegaba a ejecutarse nunca. Se espera a
 * que deje de escribir, que es la senal de que esta lista.
 */
export async function esperarListo(projectId, id, { quietoMs = 400, plazoMs = 10000 } = {}) {
  const sesion = buscar(projectId, id);
  const limite = Date.now() + plazoMs;
  let ultimoSeq = -1;
  let quietoDesde = Date.now();

  while (Date.now() < limite) {
    if (sesion.estado !== 'viva') return false;
    if (sesion.seq !== ultimoSeq) {
      ultimoSeq = sesion.seq;
      quietoDesde = Date.now();
    } else if (Date.now() - quietoDesde >= quietoMs && sesion.seq > 0) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

export function redimensionar(projectId, id, cols, rows) {
  const sesion = buscar(projectId, id);
  if (sesion.estado !== 'viva' || sesion.modo !== 'terminal') return vistaPublica(sesion);
  try {
    sesion.proceso.resize(Math.max(20, Math.min(500, cols)), Math.max(5, Math.min(200, rows)));
  } catch {
    /* el proceso acaba de morir: no es un error que deba ver el usuario */
  }
  return vistaPublica(sesion);
}

export function leer(projectId, id, desde = 0) {
  const sesion = buscar(projectId, id);
  sesion.tocada = Date.now();
  return {
    sesion: vistaPublica(sesion),
    trozos: sesion.trozos.filter((t) => t.seq > desde),
    // Si el cliente pide desde antes de lo que aun se guarda, se le dice para
    // que sepa que hay un hueco y no piense que falta salida por un fallo.
    recortado: Boolean(desde) && sesion.trozos.length > 0 && sesion.trozos[0].seq > desde + 1,
  };
}

export function listar(projectId) {
  caducar();
  return [...cajon(projectId).values()]
    .sort((a, b) => a.creada.localeCompare(b.creada))
    .map(vistaPublica);
}

/**
 * Interrumpe lo que se este ejecutando, como Ctrl+C.
 *
 * Con terminal basta con mandar el caracter, que es exactamente lo que hace
 * una consola de verdad. Sin terminal no hay proceso en primer plano al que
 * mandarselo, asi que se mata el arbol de hijos del interprete dejandolo vivo
 * a el: el efecto para el usuario es el mismo.
 */
export function interrumpir(projectId, id) {
  const sesion = buscar(projectId, id);
  if (sesion.estado !== 'viva') throw new HttpError(409, 'Esa consola ya esta cerrada.');

  if (sesion.modo === 'terminal') {
    sesion.proceso.write('\x03');
    return vistaPublica(sesion);
  }

  if (WINDOWS) {
    // /T incluiria al propio interprete; se matan solo sus hijos.
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${sesion.proceso.pid}" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { windowsHide: true },
      () => {},
    );
  } else {
    try {
      process.kill(-sesion.proceso.pid, 'SIGINT');
    } catch {
      /* no quedaba nada que interrumpir */
    }
  }
  anadir(sesion, '\r\n\x1b[2m[interrumpido]\x1b[0m\r\n');
  return vistaPublica(sesion);
}

function matar(sesion) {
  const proceso = sesion.proceso;
  sesion.estado = 'cerrada';
  if (!proceso) return;

  if (sesion.modo === 'terminal') {
    try {
      proceso.kill();
    } catch {
      /* ya habia terminado */
    }
    return;
  }
  if (proceso.exitCode !== null) return;
  if (WINDOWS) {
    execFile('taskkill', ['/PID', String(proceso.pid), '/T', '/F'], { windowsHide: true }, () => {});
    return;
  }
  try {
    process.kill(-proceso.pid, 'SIGKILL');
  } catch {
    proceso.kill('SIGKILL');
  }
}

export function cerrar(projectId, id) {
  const sesion = buscar(projectId, id);
  matar(sesion);
  cajon(projectId).delete(id);
  return { ok: true };
}

/** Al salir de la aplicacion no se deja ninguna consola suelta. */
export function cerrarTodas() {
  for (const sesiones of registro.values()) {
    for (const sesion of sesiones.values()) matar(sesion);
  }
  registro.clear();
}
