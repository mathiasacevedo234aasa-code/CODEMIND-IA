import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, PROJECTS_DIR, fileEnvValue } from '../env.js';

/** Error con codigo HTTP, para que las rutas devuelvan mensajes claros. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function ensureDataDirs() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

/**
 * Escritura atomica: primero a un temporal, luego rename. Evita archivos a medias.
 *
 * El nombre del temporal lleva un identificador unico por escritura, no solo
 * el pid: dos escrituras solapadas del mismo proceso sobre el mismo archivo
 * compartian temporal y el rename fallaba con EPERM en Windows. Ocurria de
 * verdad al guardar la sesion mientras se abria un proyecto.
 *
 * Ademas se reintenta el rename: en Windows el antivirus o el indexador
 * pueden tener el archivo abierto un instante justo cuando se sustituye.
 */
let contadorEscrituras = 0;

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${++contadorEscrituras}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');

  for (let intento = 0; ; intento++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      const recuperable = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (!recuperable || intento >= 4) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (intento + 1)));
    }
  }
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return structuredClone(fallback);
    throw err;
  }
}

export const newId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
export const sha1 = (text) => crypto.createHash('sha1').update(text, 'utf8').digest('hex');

// ---------------------------------------------------------------- proyectos

export const projectDir = (id) => path.join(PROJECTS_DIR, id);
export const workspaceDir = (id) => path.join(projectDir(id), 'workspace');
const metaFile = (id) => path.join(projectDir(id), 'meta.json');
const docsFile = (id) => path.join(projectDir(id), 'docs.json');
const memoryFile = (id) => path.join(projectDir(id), 'memory.json');
const historyFile = (id) => path.join(projectDir(id), 'history.json');
const sessionFile = (id) => path.join(projectDir(id), 'session.json');

export const EMPTY_MEMORY = {
  overview: {
    objective: '',
    problem: '',
    audience: '',
    technologies: '',
    status: '',
    implemented: '',
    pending: '',
  },
  architectureNotes: '',
  decisions: [],
  progress: [],
  updatedAt: null,
};

export async function listProjects() {
  await ensureDataDirs();
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await readJson(metaFile(entry.name), null);
    if (!meta) continue;
    // Mismos valores por defecto que getProject, para que la interfaz nunca
    // reciba un proyecto a medias de los creados antes de las carpetas externas.
    if (meta.root === undefined) meta.root = null;
    if (!meta.mode) meta.mode = meta.root ? 'carpeta' : 'interno';
    out.push(meta);
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getProject(id) {
  const meta = await readJson(metaFile(id), null);
  if (!meta) throw new HttpError(404, `El proyecto "${id}" no existe.`);
  // Compatibilidad con proyectos creados antes de que existieran las carpetas
  // externas: sin estos campos se asume el espacio gestionado.
  if (meta.root === undefined) meta.root = null;
  if (!meta.mode) meta.mode = meta.root ? 'carpeta' : 'interno';
  return meta;
}

export async function createProject({ name, objective = '', root = null }) {
  if (!name || !name.trim()) throw new HttpError(400, 'El proyecto necesita un nombre.');
  await ensureDataDirs();
  const id = newId('prj');
  const now = new Date().toISOString();

  // Un proyecto puede vivir en una carpeta real del usuario o en el espacio
  // gestionado por la aplicacion. La diferencia importa sobre todo al borrar.
  let resolvedRoot = null;
  if (root) {
    if (!path.isAbsolute(root)) throw new HttpError(400, 'La carpeta del proyecto debe ser una ruta absoluta.');
    resolvedRoot = path.resolve(root);
    const stat = await fs.stat(resolvedRoot).catch(() => null);
    if (!stat) throw new HttpError(404, `No existe la carpeta "${resolvedRoot}".`);
    if (!stat.isDirectory()) throw new HttpError(400, 'La ruta indicada no es una carpeta.');
  }

  const meta = {
    id,
    name: name.trim(),
    objective: objective.trim(),
    root: resolvedRoot,
    mode: resolvedRoot ? 'carpeta' : 'interno',
    createdAt: now,
    updatedAt: now,
  };
  if (!resolvedRoot) await fs.mkdir(workspaceDir(id), { recursive: true });
  await writeJson(metaFile(id), meta);
  await writeJson(docsFile(id), { approved: {}, proposals: [] });
  await writeJson(historyFile(id), { versions: [] });
  const memory = structuredClone(EMPTY_MEMORY);
  memory.overview.objective = meta.objective;
  memory.updatedAt = now;
  await writeJson(memoryFile(id), memory);
  return meta;
}

export async function updateProject(id, patch) {
  const meta = await getProject(id);
  const next = { ...meta };
  if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
  if (typeof patch.objective === 'string') next.objective = patch.objective;
  // Idioma de la documentacion de ESTE proyecto; null = el de la aplicacion.
  if ('idiomaDoc' in patch) next.idiomaDoc = ['es', 'en'].includes(patch.idiomaDoc) ? patch.idiomaDoc : null;
  if ('fijado' in patch) next.fijado = Boolean(patch.fijado);
  // Fijar no es "usar": no debe mover el proyecto en la lista de recientes.
  const soloFijar = Object.keys(patch).length === 1 && 'fijado' in patch;
  if (!soloFijar) next.updatedAt = new Date().toISOString();
  await writeJson(metaFile(id), next);
  return next;
}

export async function touchProject(id) {
  const meta = await readJson(metaFile(id), null);
  if (!meta) return;
  meta.updatedAt = new Date().toISOString();
  await writeJson(metaFile(id), meta);
}

/**
 * Elimina el proyecto de CodeMind AI.
 *
 * Si el proyecto apunta a una carpeta real del usuario, esa carpeta NO se toca
 * bajo ningun concepto: solo se borran los metadatos y la documentacion que
 * gestiona la aplicacion. Borrar el trabajo del usuario por "cerrar un
 * proyecto" seria imperdonable.
 */
export async function deleteProject(id) {
  const meta = await getProject(id);
  await fs.rm(projectDir(id), { recursive: true, force: true });
  return { removedFolder: meta.mode !== 'carpeta', root: meta.root };
}

/** Carpeta de trabajo real del proyecto: la del usuario o la gestionada. */
export async function projectRootDir(id) {
  const meta = await getProject(id);
  if (meta.root) {
    const stat = await fs.stat(meta.root).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      throw new HttpError(
        410,
        `La carpeta del proyecto ya no esta disponible: "${meta.root}". Puede que se haya movido, renombrado o que la unidad este desconectada.`,
      );
    }
    return meta.root;
  }
  const dir = workspaceDir(id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export const readDocs = (id) => readJson(docsFile(id), { approved: {}, proposals: [] });
export const writeDocs = (id, value) => writeJson(docsFile(id), value);
export const readMemory = (id) => readJson(memoryFile(id), EMPTY_MEMORY);
export const writeMemory = (id, value) => writeJson(memoryFile(id), value);
/**
 * Sesion de trabajo: que pestanas estaban abiertas y cual era la activa.
 * Se guarda aparte de la documentacion porque es estado de la interfaz, no
 * conocimiento del proyecto, y borrarlo no deberia perder nada importante.
 */
export const EMPTY_SESSION = { tabs: [], activeTabId: null, leftView: 'explorador', updatedAt: null };
export const readSession = (id) => readJson(sessionFile(id), EMPTY_SESSION);
export const writeSession = (id, value) => writeJson(sessionFile(id), { ...value, updatedAt: new Date().toISOString() });

export const readHistory = (id) => readJson(historyFile(id), { versions: [] });
export const writeHistory = (id, value) => writeJson(historyFile(id), value);

// ---------------------------------------------------------- sistema de archivos

/** Resuelve una ruta relativa dentro del proyecto, rechazando escapes tipo "../". */
export function resolveWithin(base, relPath) {
  const clean = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean) return base;
  const abs = path.resolve(base, clean);
  const rel = path.relative(base, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new HttpError(400, 'Ruta fuera del proyecto.');
  }
  return abs;
}

export async function resolveInProject(projectId, relPath) {
  return resolveWithin(await projectRootDir(projectId), relPath);
}

// Carpetas que nunca se muestran en el arbol: son artefactos, no codigo fuente.
// Con proyectos reales del usuario esto es imprescindible: node_modules puede
// tener cientos de miles de archivos y colgaria el explorador.
const IGNORED = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.angular', '.turbo', '.cache', '.parcel-cache',
  '.vite', '__pycache__', 'venv', '.venv', 'target', 'vendor', '.gradle', '.idea',
  '.DS_Store', 'Thumbs.db',
]);

const MAX_TREE_ENTRIES = 6000;
const MAX_TREE_DEPTH = 12;

export async function readTree(projectId) {
  const base = await projectRootDir(projectId);
  let count = 0;
  let truncated = false;

  async function walk(absDir, relDir, depth) {
    if (depth > MAX_TREE_DEPTH) {
      truncated = true;
      return [];
    }
    const entries = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
    const nodes = [];
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      if (count >= MAX_TREE_ENTRIES) {
        truncated = true;
        break;
      }
      count++;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        nodes.push({
          type: 'dir',
          name: entry.name,
          path: rel,
          children: await walk(path.join(absDir, entry.name), rel, depth + 1),
        });
      } else if (entry.isFile()) {
        const stat = await fs.stat(path.join(absDir, entry.name)).catch(() => null);
        if (stat) nodes.push({ type: 'file', name: entry.name, path: rel, size: stat.size, mtime: stat.mtimeMs });
      }
    }
    return nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name, 'es') : a.type === 'dir' ? -1 : 1,
    );
  }

  const tree = await walk(base, '', 0);
  return { tree, truncated, root: base };
}

const TEXT_LIMIT = 2 * 1024 * 1024;

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'pdf', 'zip', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi',
  'wasm', 'class', 'jar', 'psd', 'sqlite', 'db',
]);

export async function readFileContent(projectId, relPath) {
  const abs = await resolveInProject(projectId, relPath);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat || !stat.isFile()) throw new HttpError(404, `No se encontro el archivo "${relPath}".`);
  if (stat.size > TEXT_LIMIT) throw new HttpError(413, 'El archivo es demasiado grande para abrirlo en el editor.');
  const ext = path.extname(relPath).slice(1).toLowerCase();
  if (BINARY_EXT.has(ext)) {
    throw new HttpError(415, `"${path.basename(relPath)}" es un archivo binario y no puede editarse como texto.`);
  }
  return { path: relPath, content: await fs.readFile(abs, 'utf8'), mtime: stat.mtimeMs, size: stat.size };
}

export async function writeFileContent(projectId, relPath, content) {
  const base = await projectRootDir(projectId);
  const abs = resolveWithin(base, relPath);
  if (abs === base) throw new HttpError(400, 'Ruta de archivo invalida.');
  await fs.mkdir(path.dirname(abs), { recursive: true });
  // Lo que habia antes pasa al historial local (ver services/historialLocal.js).
  const anterior = await fs.readFile(abs, 'utf8').catch(() => null);
  const { apartar } = await import('./historialLocal.js');
  await apartar(projectId, relPath, anterior, content ?? '');
  await fs.writeFile(abs, content ?? '', 'utf8');
  await touchProject(projectId);
  const stat = await fs.stat(abs);
  return { path: relPath, mtime: stat.mtimeMs, size: stat.size };
}

const exists = (abs) => fs.stat(abs).then(() => true).catch(() => false);

export async function createEntry(projectId, relPath, kind) {
  const abs = await resolveInProject(projectId, relPath);
  if (await exists(abs)) throw new HttpError(409, `Ya existe "${relPath}".`);
  if (kind === 'dir') {
    await fs.mkdir(abs, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, '', 'utf8');
  }
  await touchProject(projectId);
  return { path: relPath, kind };
}

export async function renameEntry(projectId, from, to) {
  const base = await projectRootDir(projectId);
  const absFrom = resolveWithin(base, from);
  const absTo = resolveWithin(base, to);
  if (!(await exists(absFrom))) throw new HttpError(404, `No se encontro "${from}".`);
  if (await exists(absTo)) throw new HttpError(409, `Ya existe "${to}".`);
  // Una carpeta no cabe dentro de si misma (arrastrarla sobre una hija).
  if (absTo.startsWith(absFrom + path.sep)) throw new HttpError(400, 'No se puede mover una carpeta dentro de si misma.');
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.rename(absFrom, absTo);
  await touchProject(projectId);
  return { from, to };
}

/** Copia un archivo o una carpeta entera. Nunca sobrescribe: si el destino existe, 409. */
export async function copyEntry(projectId, from, to) {
  const base = await projectRootDir(projectId);
  const absFrom = resolveWithin(base, from);
  const absTo = resolveWithin(base, to);
  if (!(await exists(absFrom))) throw new HttpError(404, `No se encontro "${from}".`);
  if (await exists(absTo)) throw new HttpError(409, `Ya existe "${to}".`);
  if (absTo.startsWith(absFrom + path.sep)) throw new HttpError(400, 'No se puede copiar una carpeta dentro de si misma.');
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.cp(absFrom, absTo, { recursive: true, errorOnExist: true, force: false });
  await touchProject(projectId);
  return { from, to };
}

export async function deleteEntry(projectId, relPath) {
  const base = await projectRootDir(projectId);
  const abs = resolveWithin(base, relPath);
  if (abs === base) throw new HttpError(400, 'No se puede eliminar la raiz del proyecto.');
  await fs.rm(abs, { recursive: true, force: true });
  await touchProject(projectId);
  return { path: relPath };
}

// ------------------------------------------------------------------ ajustes

const settingsFile = path.join(DATA_DIR, 'settings.json');
const secretsFile = path.join(DATA_DIR, 'secrets.json');

export const DEFAULT_SETTINGS = {
  /** Que servicio de IA se usa. Ver services/proveedores.js. */
  proveedor: 'groq',
  /** El modelo elegido para cada proveedor, para no perderlo al cambiar. */
  modelos: {},
  /** Donde escucha Ollama. Configurable: no todos lo tienen en el sitio de siempre. */
  ollamaUrl: 'http://localhost:11434/v1',
  model: null, // heredado: el modelo de Groq de las versiones anteriores
  temperature: 0.2,
  // A quien va dirigida la explicacion. Cambia el tono y la profundidad, no
  // los hechos: la IA sigue sin poder inventarse nada.
  explanationLevel: 'intermedio', // 'principiante' | 'intermedio' | 'avanzado'
  /** Forma de la documentacion: 'normal' | 'breve' | 'didactico' | 'jsdoc'. */
  estiloDoc: 'normal',
  /** Idioma de la interfaz y de lo que escribe la IA: 'es' | 'en'. */
  idioma: 'es',
  maxTokens: 4096,
  editor: {
    theme: 'dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    minimap: false,
    // Apariencia: lo que cada persona necesita para leer codigo comodo durante
    // horas. Se guarda en disco, asi que sobrevive a reinstalar el navegador.
    fontFamily: 'default',
    lineHeight: 0, // 0 = proporcional al tamano de fuente
    letterSpacing: 0,
    fontLigatures: true,
    lineNumbers: 'on', // 'on' | 'off' | 'relative'
    indentGuides: true,
    highlightCurrentLine: true,
    stickyScroll: false,
    bracketPairColorization: true,
    autoSave: false,
    autoSaveDelay: 1500,
    emmet: true,
  },
};

export const readSettings = () => readJson(settingsFile, DEFAULT_SETTINGS);
export const writeSettings = (value) => writeJson(settingsFile, value);

/**
 * Las claves de cada proveedor, guardadas solo en el disco del backend.
 *
 * Nunca se devuelven por la API: de una clave solo sale de aqui si existe y
 * de donde procede. El archivo guarda un mapa por proveedor; las versiones
 * anteriores guardaban una sola clave de Groq y se sigue leyendo.
 */
async function leerSecretos() {
  const crudo = (await readJson(secretsFile, null)) ?? {};
  const claves = { ...(crudo.claves ?? {}) };
  // Formato antiguo: una unica clave de Groq suelta en la raiz del archivo.
  if (crudo.groqApiKey && !claves.groq) claves.groq = crudo.groqApiKey;
  return claves;
}

export async function setStoredApiKey(proveedor, key) {
  await ensureDataDirs();
  const claves = await leerSecretos();
  claves[proveedor] = key;
  await writeJson(secretsFile, { claves });
  try {
    await fs.chmod(secretsFile, 0o600);
  } catch {
    /* sin efecto real en Windows */
  }
}

export async function clearStoredApiKey(proveedor) {
  const claves = await leerSecretos();
  delete claves[proveedor];
  if (Object.keys(claves).length) await writeJson(secretsFile, { claves });
  else await fs.rm(secretsFile, { force: true });
}

/**
 * Devuelve la clave de un proveedor y, sobre todo, DE DONDE sale.
 *
 * El origen importa: una variable de sistema caducada tapaba la clave buena y
 * la aplicacion decia "configurado" para despues fallar con un 401 sin
 * explicacion. La aplicacion de escritorio no lleva .env dentro, asi que ahi
 * la unica clave posible es la guardada desde Configuracion.
 */
export async function getApiKey(proveedor = 'groq') {
  const variables = {
    groq: 'GROQ_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
  };
  const variable = variables[proveedor];

  const claves = await leerSecretos();
  if (claves[proveedor]) return { key: claves[proveedor], source: 'guardada' };
  if (!variable) return { key: null, source: null };

  const fileKey = fileEnvValue(variable);
  if (fileKey) return { key: fileKey, source: 'archivo .env' };
  if (process.env[variable]) return { key: process.env[variable], source: 'variable del sistema' };
  return { key: null, source: null };
}

// ------------------------------------------------------- medios y tramos

const TIPOS_MEDIO = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif',
  pdf: 'application/pdf',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
};

/** Ruta absoluta y tipo de un archivo de medios del proyecto, para servirlo tal cual. */
export async function archivoDeMedios(projectId, relPath) {
  const abs = await resolveInProject(projectId, relPath);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat || !stat.isFile()) throw new HttpError(404, `No se encontro el archivo "${relPath}".`);
  const tipo = TIPOS_MEDIO[path.extname(relPath).slice(1).toLowerCase()];
  if (!tipo) throw new HttpError(415, 'Ese tipo de archivo no se puede previsualizar.');
  return { abs, tipo, size: stat.size };
}

/**
 * Un tramo de un archivo de texto demasiado grande para el editor. Se lee
 * por bytes y se ajusta al salto de línea siguiente, para no partir líneas.
 */
export async function tramoDeArchivo(projectId, relPath, desde = 0, bytes = 512 * 1024) {
  const abs = await resolveInProject(projectId, relPath);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat || !stat.isFile()) throw new HttpError(404, `No se encontro el archivo "${relPath}".`);
  const inicio = Math.max(0, Math.min(Number(desde) || 0, stat.size));
  const tam = Math.max(1024, Math.min(Number(bytes) || 512 * 1024, 2 * 1024 * 1024));
  const fh = await fs.open(abs, 'r');
  try {
    const buf = Buffer.alloc(Math.min(tam, stat.size - inicio));
    const { bytesRead } = await fh.read(buf, 0, buf.length, inicio);
    let trozo = buf.subarray(0, bytesRead);
    // Se corta en el último salto de línea para no partir una línea (ni un carácter UTF-8).
    const corte = trozo.lastIndexOf(0x0a);
    if (inicio + bytesRead < stat.size && corte > 0) trozo = trozo.subarray(0, corte + 1);
    return { path: relPath, desde: inicio, hasta: inicio + trozo.length, total: stat.size, texto: trozo.toString('utf8') };
  } finally {
    await fh.close();
  }
}
