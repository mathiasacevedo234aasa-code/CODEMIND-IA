import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './store.js';

/**
 * Ejecutar un archivo suelto, en el lenguaje que sea.
 *
 * El panel de ejecucion arranca los scripts del package.json, que sirve para
 * un proyecto de JavaScript y para nada mas. Esto es lo otro: tienes abierto
 * un .py, quieres verlo correr, y deberia bastar con un boton.
 *
 * Dos decisiones que no son evidentes:
 *
 * 1. Se ejecuta DENTRO DEL TERMINAL, no como un proceso con tuberias. Un
 *    programa que hace input() o que pide una contrasena se quedaria colgado
 *    para siempre sin un terminal de verdad, y el usuario no sabria por que.
 *    Asi ademas se ve el color, se puede parar con Ctrl+C y queda el comando
 *    escrito, que es la mejor forma de aprender cual era.
 *
 * 2. Antes de ofrecer nada se comprueba que la herramienta esta instalada, y
 *    si no lo esta se dice cual falta y donde se consigue. Ofrecer un boton
 *    que falla con "comando no encontrado" es peor que no ofrecerlo.
 */

const WINDOWS = process.platform === 'win32';

/**
 * Como se pregunta la version a cada herramienta y que respuesta vale.
 *
 * El codigo de salida no basta. En Windows, `python3` es un señuelo de la
 * Microsoft Store que imprime un anuncio, y hay herramientas que escriben su
 * version en la salida de error. Se exige que la respuesta se parezca a lo
 * que esa herramienta de verdad contesta.
 */
const HERRAMIENTAS = {
  python: { args: ['--version'], patron: /Python\s+(\d+\.\d+[\w.]*)/i, donde: 'python.org/downloads' },
  node: { args: ['--version'], patron: /v(\d+\.\d+[\w.]*)/, donde: 'nodejs.org' },
  ruby: { args: ['--version'], patron: /ruby\s+(\d+\.\d+[\w.]*)/i, donde: 'ruby-lang.org' },
  php: { args: ['--version'], patron: /PHP\s+(\d+\.\d+[\w.]*)/i, donde: 'php.net/downloads' },
  go: { args: ['version'], patron: /go(\d+\.\d+[\w.]*)/i, donde: 'go.dev/dl' },
  java: { args: ['-version'], patron: /version\s+"?(\d+(?:\.\d+)*)/i, donde: 'adoptium.net' },
  rustc: { args: ['--version'], patron: /rustc\s+(\d+\.\d+[\w.]*)/i, donde: 'rustup.rs' },
  cargo: { args: ['--version'], patron: /cargo\s+(\d+\.\d+[\w.]*)/i, donde: 'rustup.rs' },
  gcc: { args: ['--version'], patron: /(\d+\.\d+\.\d+)/, donde: 'gcc.gnu.org (en Windows, MSYS2 o MinGW)' },
  'g++': { args: ['--version'], patron: /(\d+\.\d+\.\d+)/, donde: 'gcc.gnu.org (en Windows, MSYS2 o MinGW)' },
  dotnet: { args: ['--version'], patron: /(\d+\.\d+[\w.]*)/, donde: 'dotnet.microsoft.com/download' },
  lua: { args: ['-v'], patron: /Lua\s+(\d+\.\d+)/i, donde: 'lua.org/download.html' },
  dart: { args: ['--version'], patron: /Dart SDK version:\s*(\d+\.\d+[\w.]*)/i, donde: 'dart.dev/get-dart' },
  swift: { args: ['--version'], patron: /Swift version\s+(\d+\.\d+[\w.]*)/i, donde: 'swift.org/install' },
  bash: { args: ['--version'], patron: /version\s+(\d+\.\d+[\w.]*)/i, donde: 'ya viene con Git para Windows' },
  powershell: { args: ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], patron: /(\d+\.\d+[\w.]*)/, donde: 'ya viene con Windows' },
};

/**
 * Que hacer con cada extension.
 *
 * `comando` recibe la ruta del archivo YA ENTRECOMILLADA y la carpeta del
 * proyecto, y devuelve la linea que se escribe en el terminal.
 */
const POR_EXTENSION = {
  py: { lenguaje: 'Python', herramienta: 'python', comando: (f) => `python ${f}` },
  pyw: { lenguaje: 'Python', herramienta: 'python', comando: (f) => `python ${f}` },

  js: { lenguaje: 'JavaScript', herramienta: 'node', comando: (f) => `node ${f}` },
  mjs: { lenguaje: 'JavaScript', herramienta: 'node', comando: (f) => `node ${f}` },
  cjs: { lenguaje: 'JavaScript', herramienta: 'node', comando: (f) => `node ${f}` },
  // Node ejecuta TypeScript directamente desde la version 22.6: quita los
  // tipos y corre. No hace falta compilar ni instalar nada aparte.
  ts: { lenguaje: 'TypeScript', herramienta: 'node', minimo: 22, comando: (f) => `node ${f}` },
  mts: { lenguaje: 'TypeScript', herramienta: 'node', minimo: 22, comando: (f) => `node ${f}` },

  rb: { lenguaje: 'Ruby', herramienta: 'ruby', comando: (f) => `ruby ${f}` },
  php: { lenguaje: 'PHP', herramienta: 'php', comando: (f) => `php ${f}` },
  lua: { lenguaje: 'Lua', herramienta: 'lua', comando: (f) => `lua ${f}` },
  dart: { lenguaje: 'Dart', herramienta: 'dart', comando: (f) => `dart run ${f}` },
  swift: { lenguaje: 'Swift', herramienta: 'swift', comando: (f) => `swift ${f}` },
  go: { lenguaje: 'Go', herramienta: 'go', comando: (f) => `go run ${f}` },

  // Desde Java 11 se puede ejecutar un archivo suelto sin compilarlo aparte.
  java: {
    lenguaje: 'Java',
    herramienta: 'java',
    minimo: 11,
    motivoMinimo: 'Ejecutar un archivo .java suelto necesita Java 11 o superior. Con una version anterior hay que compilarlo antes con javac.',
    comando: (f) => `java ${f}`,
  },

  sh: { lenguaje: 'Bash', herramienta: 'bash', comando: (f) => `bash ${f}` },
  bash: { lenguaje: 'Bash', herramienta: 'bash', comando: (f) => `bash ${f}` },
  ps1: { lenguaje: 'PowerShell', herramienta: 'powershell', comando: (f) => `& ${f}` },

  // Los compilados dejan un ejecutable al lado; se le pone un nombre propio
  // para no pisar nada del usuario y se dice claramente que se ha creado.
  c: {
    lenguaje: 'C',
    herramienta: 'gcc',
    compila: true,
    comando: (f, _dir, base) => (WINDOWS
      ? `gcc ${f} -o ${base}.codemind.exe ; if ($?) { .\\${base}.codemind.exe }`
      : `gcc ${f} -o ${base}.codemind.out && ./${base}.codemind.out`),
  },
  cpp: {
    lenguaje: 'C++',
    herramienta: 'g++',
    compila: true,
    comando: (f, _dir, base) => (WINDOWS
      ? `g++ ${f} -o ${base}.codemind.exe ; if ($?) { .\\${base}.codemind.exe }`
      : `g++ ${f} -o ${base}.codemind.out && ./${base}.codemind.out`),
  },
  cc: { lenguaje: 'C++', herramienta: 'g++', compila: true, comando: (f, _d, b) => POR_EXTENSION.cpp.comando(f, _d, b) },
  cxx: { lenguaje: 'C++', herramienta: 'g++', compila: true, comando: (f, _d, b) => POR_EXTENSION.cpp.comando(f, _d, b) },

  rs: {
    lenguaje: 'Rust',
    herramienta: 'rustc',
    compila: true,
    comando: (f, _dir, base) => (WINDOWS
      ? `rustc ${f} -o ${base}.codemind.exe ; if ($?) { .\\${base}.codemind.exe }`
      : `rustc ${f} -o ${base}.codemind.out && ./${base}.codemind.out`),
  },

  cs: {
    lenguaje: 'C#',
    herramienta: 'dotnet',
    // Un .cs suelto no se ejecuta: C# necesita su proyecto.
    necesitaProyecto: { archivo: '*.csproj', comando: () => 'dotnet run' },
    comando: () => 'dotnet run',
  },
};

/** Lenguajes cuya ejecucion es del proyecto entero, no de un archivo. */
const PROYECTO_ENTERO = {
  rs: { marca: 'Cargo.toml', herramienta: 'cargo', comando: () => 'cargo run', lenguaje: 'Rust' },
};

// ------------------------------------------------------ deteccion

let cache = null;
let cacheEn = 0;
const CACHE_MS = 60_000;

function preguntarVersion(binario) {
  const { args, patron } = HERRAMIENTAS[binario];
  // Se pasa por el interprete porque en Windows muchas herramientas son .cmd
  // o .bat y no se pueden ejecutar directamente. Los argumentos son
  // constantes de este archivo, nunca texto del usuario.
  return new Promise((resolve) => {
    exec(
      `${binario} ${args.join(' ')}`,
      { windowsHide: true, timeout: 8000 },
      (err, stdout, stderr) => {
        // Varias herramientas escriben su version en la salida de error.
        const salida = `${stdout ?? ''}${stderr ?? ''}`;
        // El codigo de salida importa: en Windows "python3" es un señuelo de
        // la tienda que imprime un anuncio y termina con error.
        if (err && !(err.code === 0)) {
          const m = !err.killed && patron.exec(salida);
          // java -version termina en 0 pero algunas herramientas no; si la
          // respuesta se parece a una version, se acepta igualmente.
          if (!m) return resolve({ disponible: false, version: null });
          return resolve({ disponible: true, version: m[1] });
        }
        const m = patron.exec(salida);
        resolve(m ? { disponible: true, version: m[1] } : { disponible: false, version: null });
      },
    );
  });
}

/**
 * Que herramientas hay en este equipo. Se pregunta a todas a la vez y se
 * recuerda un minuto: instalar algo mientras la aplicacion esta abierta es
 * bastante normal, y esperar a reiniciar seria molesto.
 */
export async function herramientas({ refrescar = false } = {}) {
  if (!refrescar && cache && Date.now() - cacheEn < CACHE_MS) return cache;

  const nombres = Object.keys(HERRAMIENTAS);
  const resultados = await Promise.all(nombres.map((n) => preguntarVersion(n)));

  cache = {};
  nombres.forEach((nombre, i) => {
    cache[nombre] = { ...resultados[i], donde: HERRAMIENTAS[nombre].donde };
  });
  cacheEn = Date.now();
  return cache;
}

/** Numero de version principal, para comparar minimos. */
const mayorDe = (version) => Number(String(version ?? '').split('.')[0]) || 0;

// ------------------------------------------------------ el plan

const extensionDe = (ruta) => {
  const i = ruta.lastIndexOf('.');
  return i === -1 ? '' : ruta.slice(i + 1).toLowerCase();
};

/** Entrecomilla una ruta para el interprete de comandos del equipo. */
export function citar(ruta) {
  if (WINDOWS) return `'${ruta.replace(/'/g, "''")}'`;
  return `'${ruta.replace(/'/g, `'\\''`)}'`;
}

const existe = (p) => fs.access(p).then(() => true).catch(() => false);

async function hayArchivoComo(dir, patron) {
  const entradas = await fs.readdir(dir).catch(() => []);
  const re = new RegExp(`^${patron.replace('.', '\\.').replace('*', '.*')}$`, 'i');
  return entradas.some((e) => re.test(e));
}

/**
 * Como se ejecutaria este archivo, y si se puede.
 *
 * Nunca ejecuta nada: solo dice que pasaria. La interfaz lo usa para saber si
 * puede ofrecer el boton y, cuando no puede, para explicar exactamente que
 * falta en lugar de dejar que el comando falle en el terminal.
 */
export async function planPara(raiz, rutaRelativa) {
  const limpia = String(rutaRelativa ?? '').replace(/\\/g, '/');
  if (!limpia) throw new HttpError(400, 'No se ha indicado ningun archivo.');
  if (limpia.includes('..')) throw new HttpError(400, 'Ruta de archivo no valida.');
  // Una ruta absoluta se rechaza en lugar de convertirla en relativa por las
  // bravas: eso acabaria apuntando a un archivo distinto del que pidio el
  // usuario, y callarselo es peor que decir que no.
  if (limpia.startsWith('/') || /^[A-Za-z]:/.test(limpia)) {
    throw new HttpError(400, 'Indica el archivo con su ruta dentro del proyecto, no con una ruta absoluta.');
  }

  const absoluta = path.join(raiz, limpia);
  if (!absoluta.startsWith(path.resolve(raiz))) throw new HttpError(400, 'Ese archivo esta fuera del proyecto.');

  const ext = extensionDe(limpia);
  const base = path.basename(limpia, `.${ext}`);
  const nombre = path.basename(limpia);

  // ¿Es un lenguaje que se ejecuta del proyecto entero?
  const entero = PROYECTO_ENTERO[ext];
  if (entero && (await existe(path.join(raiz, entero.marca)))) {
    const tools = await herramientas();
    const t = tools[entero.herramienta] ?? { disponible: false };
    return {
      soportado: true,
      archivo: limpia,
      lenguaje: entero.lenguaje,
      comando: entero.comando(),
      herramienta: entero.herramienta,
      disponible: t.disponible,
      version: t.version,
      donde: t.donde,
      alcance: 'proyecto',
      nota: `Este proyecto tiene ${entero.marca}, asi que se ejecuta entero con su gestor, no archivo por archivo.`,
    };
  }

  const receta = POR_EXTENSION[ext];
  if (!receta) {
    return {
      soportado: false,
      archivo: limpia,
      motivo: ext
        ? `CodeMind AI no sabe como ejecutar un archivo .${ext}. Puedes escribir tu el comando en el Terminal.`
        : 'Este archivo no tiene extension, asi que no hay forma de saber en que lenguaje esta.',
    };
  }

  const tools = await herramientas();
  const t = tools[receta.herramienta] ?? { disponible: false, version: null, donde: null };

  let disponible = t.disponible;
  let motivo = null;

  if (!disponible) {
    motivo = `No encuentro "${receta.herramienta}" en este equipo. Instalalo desde ${t.donde ?? 'su sitio oficial'} y vuelve a intentarlo.`;
  } else if (receta.minimo && mayorDe(t.version) < receta.minimo) {
    disponible = false;
    motivo = receta.motivoMinimo
      ?? `Hace falta ${receta.herramienta} ${receta.minimo} o superior; en este equipo hay ${t.version}.`;
  }

  // C# necesita su proyecto: un archivo suelto no se ejecuta.
  if (disponible && receta.necesitaProyecto) {
    const hay = await hayArchivoComo(raiz, receta.necesitaProyecto.archivo);
    if (!hay) {
      disponible = false;
      motivo = `Un archivo .${ext} suelto no se ejecuta: C# necesita un proyecto. Crea uno con "dotnet new console" en la carpeta.`;
    }
  }

  return {
    soportado: true,
    archivo: limpia,
    nombre,
    lenguaje: receta.lenguaje,
    comando: receta.comando(citar(limpia), raiz, base),
    herramienta: receta.herramienta,
    disponible,
    version: t.version,
    donde: t.donde,
    motivo,
    alcance: receta.necesitaProyecto ? 'proyecto' : 'archivo',
    compila: Boolean(receta.compila),
    nota: receta.compila
      ? `Se compila primero y se deja el ejecutable como "${base}.codemind.${WINDOWS ? 'exe' : 'out'}" junto a tu archivo.`
      : null,
  };
}

/** Los lenguajes que este equipo puede ejecutar ahora mismo. */
export async function resumen({ refrescar = false } = {}) {
  const tools = await herramientas({ refrescar });
  const porLenguaje = new Map();

  for (const receta of Object.values(POR_EXTENSION)) {
    if (porLenguaje.has(receta.lenguaje)) continue;
    const t = tools[receta.herramienta] ?? { disponible: false, version: null };
    const suficiente = t.disponible && (!receta.minimo || mayorDe(t.version) >= receta.minimo);
    porLenguaje.set(receta.lenguaje, {
      lenguaje: receta.lenguaje,
      herramienta: receta.herramienta,
      disponible: suficiente,
      version: t.version,
      donde: tools[receta.herramienta]?.donde ?? null,
      aviso: t.disponible && !suficiente ? receta.motivoMinimo ?? null : null,
    });
  }

  return [...porLenguaje.values()].sort((a, b) => a.lenguaje.localeCompare(b.lenguaje));
}
