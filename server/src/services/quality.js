import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './store.js';
import * as runner from './runner.js';

/**
 * Comprobaciones del proyecto: pruebas, tipos y estilo.
 *
 * No trae su propio compilador ni su propio analizador: ejecuta los que el
 * proyecto ya declara en su package.json y traduce su salida a una lista de
 * avisos con archivo y linea, para poder saltar a cada uno.
 *
 * Es deliberadamente un lector, no un corrector. CodeMind AI senala donde
 * mira la herramienta del proyecto; decidir que hacer con cada aviso, y
 * arreglarlo, sigue siendo del usuario.
 */

/** Como se reconoce cada clase de tarea en el package.json. */
const CLASES = [
  {
    id: 'pruebas',
    etiqueta: 'Pruebas',
    descripcion: 'Ejecuta la bateria de pruebas del proyecto.',
    nombre: /^(test|tests|spec|unit|e2e)(:.+)?$/i,
    comando: /\b(vitest|jest|mocha|ava|playwright|cypress|node\s+--test|tap)\b/i,
  },
  {
    id: 'tipos',
    etiqueta: 'Tipos',
    descripcion: 'Comprueba los tipos de TypeScript sin generar archivos.',
    nombre: /^(typecheck|type-check|types|tsc|check-types)(:.+)?$/i,
    comando: /\btsc\b/i,
  },
  {
    id: 'estilo',
    etiqueta: 'Estilo',
    descripcion: 'Analiza el codigo con las reglas de ESLint del proyecto.',
    nombre: /^(lint|eslint)(:.+)?$/i,
    comando: /\beslint\b/i,
  },
];

/** Un script de construccion no es una comprobacion: no se ofrece aqui. */
const ES_CONSTRUCCION = /^(build|compile|dist|package)(:.+)?$/i;

function clasificar(nombre, comando) {
  if (ES_CONSTRUCCION.test(nombre)) return null;
  for (const clase of CLASES) {
    if (clase.nombre.test(nombre) || clase.comando.test(comando)) return clase.id;
  }
  return null;
}

/** Tareas de comprobacion que este proyecto declara, sin ejecutar nada. */
export async function tareas(cwd) {
  const info = await runner.scripts(cwd);
  const encontradas = [];

  for (const { name, command } of info.scripts) {
    const clase = clasificar(name, command);
    if (!clase) continue;
    const meta = CLASES.find((c) => c.id === clase);
    encontradas.push({ id: name, clase, etiqueta: meta.etiqueta, descripcion: meta.descripcion, comando: command });
  }

  const notas = [];
  if (!info.hasPackageJson) {
    notas.push('Este proyecto no tiene package.json, asi que no declara ninguna comprobacion que ejecutar.');
  } else if (!encontradas.length) {
    notas.push('El package.json no declara scripts de pruebas, de tipos ni de estilo. CodeMind AI solo ejecuta los que el propio proyecto define.');
  }
  if (encontradas.length && !info.hasNodeModules) {
    notas.push('Faltan las dependencias (no existe node_modules): las comprobaciones fallaran hasta instalarlas.');
  }

  return { tareas: encontradas, hasNodeModules: info.hasNodeModules, packageManager: info.packageManager, notas };
}

// ------------------------------------------------------------- traductores

const RE_TSC = /^(.+?)[(](\d+),(\d+)[)]:\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
const RE_TSC_ALT = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
const RE_ESLINT_POS = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.*?)(?:\s\s+([\w@/-]+))?\s*$/;
const RE_RUTA_SUELTA = /^(?:[A-Za-z]:)?[\\/]?[\w.@-]+(?:[\\/][\w.@-]+)*\.\w+$/;
// Una posicion de la pila. Admite rutas de Windows ("C:\x\y.js"), de POSIX y
// las URL "file:///C:/x/y.js" que imprime el corredor de pruebas de Node.
const RE_PILA = /(?:at\s+|[(\s])(?:file:\/\/\/)?((?:[A-Za-z]:)?[^\s()]+?\.[cm]?[jt]sx?):(\d+):(\d+)/;

/** Todo se muestra relativo a la raiz del proyecto: las rutas absolutas estorban. */
function relativa(cwd, ruta) {
  let limpia = ruta.trim().replace(/^['"]|['"]$/g, '');
  if (limpia.startsWith('file:')) {
    try { limpia = fileURLToPath(limpia); } catch { return null; }
  }
  if (!limpia) return null;
  const rel = path.isAbsolute(limpia) ? path.relative(cwd, limpia) : limpia;
  if (rel.startsWith('..')) return null; // fuera del proyecto: no se puede abrir
  return rel.replace(/\\/g, '/');
}

const avisoDe = (cwd, ruta, linea, columna, nivel, mensaje, regla = null) => {
  const archivo = relativa(cwd, ruta);
  return archivo ? { archivo, linea: Number(linea), columna: Number(columna), nivel, mensaje: mensaje.trim(), regla } : null;
};

/** TypeScript: "src/a.ts(12,5): error TS2345: mensaje". */
function leerTsc(cwd, salida) {
  const avisos = [];
  for (const linea of salida.split('\n')) {
    const m = RE_TSC.exec(linea.trim()) ?? RE_TSC_ALT.exec(linea.trim());
    if (!m) continue;
    const aviso = avisoDe(cwd, m[1], m[2], m[3], m[4] === 'error' ? 'error' : 'aviso', m[6], m[5]);
    if (aviso) avisos.push(aviso);
  }
  return avisos;
}

/** ESLint en formato "stylish": una ruta y debajo sus posiciones indentadas. */
function leerEslint(cwd, salida) {
  const avisos = [];
  let archivoActual = null;
  for (const cruda of salida.split('\n')) {
    const linea = cruda.replace(/\r$/, '');
    const pos = RE_ESLINT_POS.exec(linea);
    if (pos && archivoActual) {
      const aviso = avisoDe(cwd, archivoActual, pos[1], pos[2], pos[3] === 'error' ? 'error' : 'aviso', pos[4], pos[5] ?? null);
      if (aviso) avisos.push(aviso);
      continue;
    }
    const texto = linea.trim();
    if (texto && !linea.startsWith(' ') && RE_RUTA_SUELTA.test(texto)) archivoActual = texto;
  }
  return avisos;
}

/**
 * Pruebas. Cada corredor imprime a su manera, asi que en vez de intentar
 * entenderlos todos se buscan dos cosas que si comparten: las lineas de
 * fallo y las referencias a archivo:linea de la pila.
 */
function leerPruebas(cwd, salida) {
  const avisos = [];
  const lineas = salida.split('\n');
  // Un mismo fallo se imprime dos veces: en la lista y en el resumen final.
  // Basta con quedarse con la primera aparicion de cada posicion.
  const vistos = new Set();

  for (let i = 0; i < lineas.length; i++) {
    const texto = lineas[i].replace(/\r$/, '').trim();
    // Cada corredor marca el fallo con su propio simbolo: vitest y jest usan
    // una cruz fina, el corredor de Node una gruesa, TAP escribe "not ok".
    const fallo = /^(?:FAIL|[✕-✘×]|not ok\b)\s*(.*)$/.exec(texto);
    if (!fallo) continue;
    // La cabecera del resumen lleva el mismo simbolo, pero no es un fallo.
    if (/^failing tests:?$/i.test(fallo[1].trim())) continue;

    // Se busca la primera posicion de archivo en la propia linea o justo debajo.
    let posicion = null;
    for (let j = i; j < Math.min(i + 12, lineas.length) && !posicion; j++) {
      const m = RE_PILA.exec(lineas[j]);
      if (m && relativa(cwd, m[1])) posicion = m;
    }
    const rutaSuelta = /((?:[A-Za-z]:)?[^\s:]+\.[jt]sx?)/.exec(fallo[1]);

    const aviso = posicion
      ? avisoDe(cwd, posicion[1], posicion[2], posicion[3], 'error', fallo[1] || 'Prueba fallida')
      : rutaSuelta
        ? avisoDe(cwd, rutaSuelta[1], 1, 1, 'error', fallo[1] || 'Prueba fallida')
        : null;
    if (!aviso) continue;
    const clave = `${aviso.archivo}:${aviso.linea}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    avisos.push(aviso);
  }
  return avisos;
}

/** Recuento que imprimen vitest y jest, si aparece. */
function resumenPruebas(salida) {
  const vitest = /Tests\s+(?:(\d+)\s+failed[^\n]*?)?(?:\|\s*)?(\d+)\s+passed/i.exec(salida);
  if (vitest) return { fallidas: Number(vitest[1] ?? 0), superadas: Number(vitest[2]) };
  const jest = /Tests:\s+(?:(\d+)\s+failed,\s*)?(?:\d+\s+skipped,\s*)?(\d+)\s+passed/i.exec(salida);
  if (jest) return { fallidas: Number(jest[1] ?? 0), superadas: Number(jest[2]) };
  const tap = /^#\s*pass\s+(\d+)[\s\S]*?^#\s*fail\s+(\d+)/m.exec(salida);
  if (tap) return { fallidas: Number(tap[2]), superadas: Number(tap[1]) };
  // El corredor propio de Node: lineas "ℹ pass 1" y "ℹ fail 1".
  const nodo = /^\s*ℹ?\s*pass\s+(\d+)\s*$/m.exec(salida);
  const nodoFail = /^\s*ℹ?\s*fail\s+(\d+)\s*$/m.exec(salida);
  if (nodo && nodoFail) return { fallidas: Number(nodoFail[1]), superadas: Number(nodo[1]) };
  return null;
}

const LECTORES = { tipos: leerTsc, estilo: leerEslint, pruebas: leerPruebas };

/** Quita avisos repetidos: varias herramientas senalan la misma linea. */
function unicos(avisos) {
  const vistos = new Set();
  return avisos.filter((a) => {
    const clave = `${a.archivo}:${a.linea}:${a.columna}:${a.mensaje}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/**
 * Ejecuta una de las tareas detectadas y devuelve sus avisos ya situados.
 *
 * Si no se entiende la salida no se inventa nada: se devuelve el texto tal
 * cual para que el usuario lo lea, y se dice claramente que no se supo leer.
 */
export async function ejecutar(cwd, script) {
  const disponibles = await tareas(cwd);
  const tarea = disponibles.tareas.find((t) => t.id === script);
  if (!tarea) {
    throw new HttpError(400, `"${script}" no es una comprobacion declarada en el package.json de este proyecto.`);
  }

  const res = await runner.runOnce(cwd, { script }, { timeoutMs: 300000 });
  const avisos = unicos(LECTORES[tarea.clase](cwd, res.salida));

  return {
    tarea: { id: tarea.id, clase: tarea.clase, etiqueta: tarea.etiqueta },
    comando: res.command,
    exitCode: res.exitCode,
    ms: res.ms,
    cortada: Boolean(res.cortada),
    error: res.error,
    avisos,
    // La cola es suficiente para entender un fallo y evita mandar megabytes.
    salida: res.salida.split('\n').slice(-400).join('\n'),
    resumen: tarea.clase === 'pruebas' ? resumenPruebas(res.salida) : null,
    // Un codigo de salida distinto de cero sin ningun aviso legible significa
    // que fallo algo que no supimos situar; hay que decirlo, no ocultarlo.
    sinLeer: res.exitCode !== 0 && avisos.length === 0,
    correcto: res.exitCode === 0,
  };
}

export const _internos = { clasificar, leerTsc, leerEslint, leerPruebas, resumenPruebas };
