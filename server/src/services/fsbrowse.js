import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { HttpError } from './store.js';

/**
 * Navegacion por el disco real del equipo, para poder abrir cualquier carpeta
 * del usuario como proyecto.
 *
 * El backend escucha solo en 127.0.0.1, asi que esto no queda expuesto a la
 * red; aun asi se valida todo: rutas absolutas, permisos y limites de tamano.
 */

const WINDOWS = process.platform === 'win32';

const SYSTEM_NAMES = new Set([
  '$Recycle.Bin', 'System Volume Information', 'pagefile.sys', 'hiberfil.sys',
  'swapfile.sys', 'DumpStack.log.tmp', 'Recovery',
]);

const canAccess = (target, mode) => fs.access(target, mode).then(() => true).catch(() => false);

export async function roots() {
  const found = [];

  if (WINDOWS) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const checks = await Promise.all(
      letters.map(async (letter) => ((await canAccess(`${letter}:\\`, constants.R_OK)) ? letter : null)),
    );
    for (const letter of checks.filter(Boolean)) {
      found.push({ path: `${letter}:\\`, label: `Disco ${letter}:`, kind: 'unidad' });
    }
  } else {
    found.push({ path: '/', label: 'Raiz del sistema', kind: 'unidad' });
  }

  const home = os.homedir();
  const shortcuts = [
    { dir: home, label: 'Carpeta personal' },
    { dir: path.join(home, 'Desktop'), label: 'Escritorio' },
    { dir: path.join(home, 'Escritorio'), label: 'Escritorio' },
    { dir: path.join(home, 'Documents'), label: 'Documentos' },
    { dir: path.join(home, 'Documentos'), label: 'Documentos' },
    { dir: path.join(home, 'Downloads'), label: 'Descargas' },
    { dir: path.join(home, 'Descargas'), label: 'Descargas' },
  ];

  const seen = new Set(found.map((r) => r.path.toLowerCase()));
  const seenLabels = new Set();
  for (const item of shortcuts) {
    const key = item.dir.toLowerCase();
    if (seen.has(key) || seenLabels.has(item.label)) continue;
    const stat = await fs.stat(item.dir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    seen.add(key);
    seenLabels.add(item.label);
    found.push({ path: item.dir, label: item.label, kind: 'carpeta' });
  }

  return found;
}

function assertAbsolute(absPath) {
  const value = String(absPath ?? '');
  if (!value || !path.isAbsolute(value)) {
    throw new HttpError(400, 'La ruta debe ser absoluta (por ejemplo C:\\Users\\tu-usuario\\proyectos).');
  }
  return path.normalize(value);
}

function isHidden(name) {
  return name.startsWith('.') || (WINDOWS && SYSTEM_NAMES.has(name));
}

const MAX_ENTRIES = 2000;

export async function list(absPath, showHidden = false) {
  const target = assertAbsolute(absPath);

  const stat = await fs.stat(target).catch((err) => {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new HttpError(403, `No tienes permiso para abrir "${target}".`);
    }
    return null;
  });
  if (!stat) throw new HttpError(404, `No existe la carpeta "${target}".`);
  if (!stat.isDirectory()) throw new HttpError(400, `"${target}" es un archivo, no una carpeta.`);

  let dirents;
  try {
    dirents = await fs.readdir(target, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new HttpError(403, `No tienes permiso para leer el contenido de "${target}".`);
    }
    if (err.code === 'ENOTDIR') throw new HttpError(400, 'La ruta indicada no es una carpeta.');
    throw new HttpError(500, `No se pudo leer "${target}": ${err.code ?? err.message}`);
  }

  const visible = dirents.filter((d) => showHidden || !isHidden(d.name));
  const truncated = visible.length > MAX_ENTRIES;

  const entries = [];
  for (const dirent of visible.slice(0, MAX_ENTRIES)) {
    const full = path.join(target, dirent.name);
    // Un archivo bloqueado o un enlace roto no debe tumbar el listado entero.
    const entryStat = await fs.stat(full).catch(() => null);
    entries.push({
      name: dirent.name,
      path: full,
      type: dirent.isDirectory() ? 'dir' : 'file',
      size: entryStat?.size ?? 0,
      mtime: entryStat?.mtimeMs ?? 0,
      hidden: isHidden(dirent.name),
    });
  }

  entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name, 'es') : a.type === 'dir' ? -1 : 1,
  );

  const parent = path.dirname(target);
  return {
    path: target,
    parent: parent === target ? null : parent,
    entries,
    truncated,
  };
}

export async function probe(absPath) {
  const target = assertAbsolute(absPath);
  const stat = await fs.stat(target).catch(() => null);

  const base = {
    path: target,
    exists: Boolean(stat),
    isDir: Boolean(stat?.isDirectory()),
    readable: false,
    writable: false,
    isGitRepo: false,
    hasPackageJson: false,
    entryCount: 0,
    suggestedName: path.basename(target) || target,
  };
  if (!stat || !stat.isDirectory()) return base;

  base.readable = await canAccess(target, constants.R_OK);
  base.writable = await canAccess(target, constants.W_OK);
  base.isGitRepo = await canAccess(path.join(target, '.git'), constants.F_OK);
  base.hasPackageJson = await canAccess(path.join(target, 'package.json'), constants.F_OK);

  const dirents = await fs.readdir(target).catch(() => []);
  base.entryCount = dirents.filter((name) => !isHidden(name)).length;
  return base;
}

/** Evita abrir como proyecto carpetas del sistema, donde escribir seria un accidente. */
export function isSafeProjectRoot(absPath) {
  const target = assertAbsolute(absPath);
  const lower = target.toLowerCase().replace(/[\\/]+$/, '');

  if (WINDOWS && /^[a-z]:$/.test(lower)) {
    return { ok: false, reason: 'No conviene abrir la raiz de una unidad completa como proyecto.' };
  }
  if (!WINDOWS && lower === '') {
    return { ok: false, reason: 'No conviene abrir la raiz del sistema como proyecto.' };
  }

  const forbidden = WINDOWS
    ? ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata', 'c:\\$recycle.bin']
    : ['/etc', '/usr', '/bin', '/sbin', '/var', '/system', '/library'];

  for (const prefix of forbidden) {
    if (lower === prefix || lower.startsWith(`${prefix}${path.sep}`) || lower.startsWith(`${prefix}/`)) {
      return { ok: false, reason: `"${target}" pertenece al sistema operativo. Elige una carpeta de trabajo tuya.` };
    }
  }
  return { ok: true };
}
