import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError, projectRootDir, resolveWithin, projectDir, readJson, writeJson } from './store.js';

/**
 * Busqueda y reemplazo en todos los archivos del proyecto.
 *
 * Se recorre el disco en cada busqueda en lugar de mantener un indice: para
 * proyectos del tamano que maneja CodeMind AI es mas rapido que mantener un
 * indice coherente, y no hay riesgo de devolver resultados obsoletos.
 *
 * El reemplazo va en dos fases: primero se muestra exactamente que cambiaria y
 * solo despues, con una peticion aparte, se escribe. La aplicacion no modifica
 * archivos sin que el usuario haya visto antes el resultado.
 */

const IGNORADAS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.angular', '.turbo', '.cache', '.parcel-cache',
  '.vite', '__pycache__', 'venv', '.venv', 'target', 'vendor', '.gradle', '.idea',
]);

const BINARIAS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'pdf', 'zip', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi',
  'wasm', 'class', 'jar', 'psd', 'sqlite', 'db', 'lock',
]);

const MAX_ARCHIVOS = 4000;
const MAX_TAMANO = 2 * 1024 * 1024;
const MAX_RESULTADOS = 1000;

const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Construye la expresion con la que se busca, segun las opciones marcadas. */
function construirPatron({ query, regex, caseSensitive, wholeWord }) {
  if (!query) throw new HttpError(400, 'Escribe algo que buscar.');
  let cuerpo = regex ? query : escapar(query);
  if (wholeWord) cuerpo = `\\b(?:${cuerpo})\\b`;
  try {
    return new RegExp(cuerpo, caseSensitive ? 'g' : 'gi');
  } catch (err) {
    throw new HttpError(400, `La expresion regular no es valida: ${err.message}`);
  }
}

/** Convierte "*.ts, src/**" en algo con lo que filtrar rutas. */
function construirFiltro(patrones) {
  const limpios = String(patrones ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!limpios.length) return null;

  const expresiones = limpios.map((p) => {
    const cuerpo = escapar(p.replace(/\\/g, '/'))
      .replace(/\\\*\\\*/g, '\u0000')   // ** = cualquier profundidad
      .replace(/\\\*/g, '[^/]*')        // *  = dentro de un nivel
      .replace(/\u0000/g, '.*')
      .replace(/\\\?/g, '.');
    return new RegExp(`^${cuerpo}$|(^|/)${cuerpo}($|/)`, 'i');
  });
  return (relPath) => expresiones.some((re) => re.test(relPath));
}

async function listarArchivos(raiz) {
  const encontrados = [];
  let truncado = false;

  async function recorrer(absDir, relDir, profundidad) {
    if (encontrados.length >= MAX_ARCHIVOS || profundidad > 12) {
      truncado = true;
      return;
    }
    const entradas = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const entrada of entradas) {
      if (IGNORADAS.has(entrada.name)) continue;
      const rel = relDir ? `${relDir}/${entrada.name}` : entrada.name;
      if (entrada.isDirectory()) {
        await recorrer(path.join(absDir, entrada.name), rel, profundidad + 1);
      } else if (entrada.isFile()) {
        const ext = path.extname(entrada.name).slice(1).toLowerCase();
        if (BINARIAS.has(ext)) continue;
        if (encontrados.length >= MAX_ARCHIVOS) {
          truncado = true;
          return;
        }
        encontrados.push(rel);
      }
    }
  }

  await recorrer(raiz, '', 0);
  return { archivos: encontrados, truncado };
}

/** Busca en todo el proyecto y devuelve las coincidencias agrupadas por archivo. */
export async function buscar(projectId, opciones) {
  const raiz = await projectRootDir(projectId);
  const patron = construirPatron(opciones);
  const incluir = construirFiltro(opciones.include);
  const excluir = construirFiltro(opciones.exclude);

  const { archivos, truncado } = await listarArchivos(raiz);
  const resultados = [];
  let total = 0;
  let limitado = false;

  // "Solo abiertos" o "solo modificados": la interfaz manda la lista.
  const soloEn = Array.isArray(opciones.soloRutas) ? new Set(opciones.soloRutas) : null;

  for (const rel of archivos) {
    if (soloEn && !soloEn.has(rel)) continue;
    if (incluir && !incluir(rel)) continue;
    if (excluir && excluir(rel)) continue;
    if (total >= MAX_RESULTADOS) {
      limitado = true;
      break;
    }

    const abs = path.join(raiz, rel);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat || stat.size > MAX_TAMANO) continue;

    const contenido = await fs.readFile(abs, 'utf8').catch(() => null);
    if (contenido === null || contenido.includes('\u0000')) continue; // binario disfrazado

    const lineas = contenido.split('\n');
    const coincidencias = [];

    for (let i = 0; i < lineas.length && total < MAX_RESULTADOS; i++) {
      patron.lastIndex = 0;
      let m;
      while ((m = patron.exec(lineas[i])) !== null) {
        coincidencias.push({
          line: i + 1,
          column: m.index + 1,
          length: m[0].length,
          // Se recorta la linea para no enviar lineas minificadas enteras.
          preview: lineas[i].length > 400 ? `${lineas[i].slice(0, 400)}...` : lineas[i],
        });
        total++;
        if (m[0].length === 0) patron.lastIndex++; // patrones que casan vacio
        if (total >= MAX_RESULTADOS) {
          limitado = true;
          break;
        }
      }
    }

    if (coincidencias.length) resultados.push({ path: rel, matches: coincidencias });
  }

  return {
    files: resultados,
    totalMatches: total,
    totalFiles: resultados.length,
    truncated: truncado || limitado,
    scanned: archivos.length,
  };
}

/**
 * Calcula el resultado de un reemplazo SIN escribir nada, o lo aplica si
 * `aplicar` es true. Separar las dos cosas es lo que permite ensenar el
 * cambio antes de tocar el disco.
 */
export async function reemplazar(projectId, opciones, aplicar = false) {
  const raiz = await projectRootDir(projectId);
  const patron = construirPatron(opciones);
  const sustituto = String(opciones.replacement ?? '');

  // Solo los archivos que el usuario haya dejado marcados.
  const objetivo = Array.isArray(opciones.paths) && opciones.paths.length ? opciones.paths : null;
  const encontrados = objetivo ?? (await buscar(projectId, opciones)).files.map((f) => f.path);

  const cambios = [];
  let totalSustituciones = 0;
  // Para poder deshacer: lo que habia y lo que quedo, de cada archivo tocado.
  const copia = [];

  for (const rel of encontrados) {
    const abs = resolveWithin(raiz, rel);
    const original = await fs.readFile(abs, 'utf8').catch(() => null);
    if (original === null) continue;

    patron.lastIndex = 0;
    const sustituciones = (original.match(patron) ?? []).length;
    if (!sustituciones) continue;

    patron.lastIndex = 0;
    const nuevo = original.replace(patron, sustituto);
    if (nuevo === original) continue;

    totalSustituciones += sustituciones;
    cambios.push({ path: rel, replacements: sustituciones });

    if (aplicar) {
      await fs.writeFile(abs, nuevo, 'utf8');
      copia.push({ path: rel, original, nuevo });
    }
  }

  if (aplicar && copia.length) {
    await writeJson(path.join(projectDir(projectId), 'ultimo-reemplazo.json'), { en: new Date().toISOString(), archivos: copia });
  }
  return { applied: aplicar, files: cambios, totalReplacements: totalSustituciones };
}

/**
 * Deshace el último "Reemplazar todo". Solo si los archivos siguen exactamente
 * como los dejó el reemplazo: si alguno se ha tocado después, no se pisa nada
 * y se dice cuál.
 */
export async function deshacerReemplazo(projectId) {
  const raiz = await projectRootDir(projectId);
  const archivo = path.join(projectDir(projectId), 'ultimo-reemplazo.json');
  const ultimo = await readJson(archivo, null);
  if (!ultimo?.archivos?.length) throw new HttpError(404, 'No hay ningún reemplazo que deshacer.');
  const cambiados = [];
  for (const a of ultimo.archivos) {
    const actual = await fs.readFile(resolveWithin(raiz, a.path), 'utf8').catch(() => null);
    if (actual !== a.nuevo) cambiados.push(a.path);
  }
  if (cambiados.length) {
    throw new HttpError(409, `No se deshace: estos archivos han cambiado después del reemplazo y se perdería ese trabajo: ${cambiados.join(', ')}.`);
  }
  for (const a of ultimo.archivos) await fs.writeFile(resolveWithin(raiz, a.path), a.original, 'utf8');
  await fs.rm(archivo, { force: true });
  return { restaurados: ultimo.archivos.map((a) => a.path) };
}
