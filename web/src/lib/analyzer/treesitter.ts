import type { DetectedSymbol, SymbolKind } from '../types.ts';
import { CATEGORIA_DE } from '../types.ts';

/**
 * Analizador para los lenguajes que no son del navegador.
 *
 * Los analizadores de JavaScript, HTML y CSS están escritos a mano porque son
 * los lenguajes que el propio editor entiende. Para Python, Java, C#, Go, Rust
 * y compañía no tiene sentido escribir catorce analizadores más: se usa
 * tree-sitter, que es el mismo motor que usan los editores de verdad, con su
 * gramática compilada a WebAssembly.
 *
 * Todo ocurre en el equipo del usuario. Las gramáticas son archivos locales y
 * el código nunca sale de aquí: solo se envía a la IA lo que el usuario pide
 * explícitamente documentar.
 *
 * Cada gramática se carga la primera vez que aparece un archivo de ese
 * lenguaje, no al arrancar: son varios megabytes cada una.
 */

interface Nodo {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child(i: number): Nodo | null;
  childForFieldName(name: string): Nodo | null;
  namedChildren: Nodo[];
}

/** Qué gramática corresponde a cada extensión. */
const GRAMATICA_DE: Record<string, string> = {
  py: 'python', pyw: 'python', pyi: 'python',
  java: 'java',
  cs: 'c_sharp',
  go: 'go',
  php: 'php', phtml: 'php',
  rb: 'ruby', rake: 'ruby',
  rs: 'rust',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  lua: 'lua',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  dart: 'dart',
};

/** Nombre legible del lenguaje, para enseñarlo en la interfaz. */
export const NOMBRE_LENGUAJE: Record<string, string> = {
  python: 'Python', java: 'Java', c_sharp: 'C#', go: 'Go', php: 'PHP',
  ruby: 'Ruby', rust: 'Rust', c: 'C', cpp: 'C++', bash: 'Bash',
  lua: 'Lua', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart',
};

/**
 * Qué se extrae de cada lenguaje.
 *
 * `declaraciones` traduce el nombre que tree-sitter da a cada nodo al tipo que
 * usa CodeMind AI. `contenedores` son los nodos que dan apellido a lo que hay
 * dentro: un método se llama `Clase.metodo`, no solo `metodo`. `importaciones`
 * son los nodos de los que sale una dependencia, que alimenta el mapa.
 */
interface Descripcion {
  declaraciones: Record<string, SymbolKind>;
  contenedores: Record<string, SymbolKind>;
  importaciones: string[];
  /** Nodos cuyo contenido no interesa recorrer (cuerpos de función ajenos). */
  metodoEnContenedor?: SymbolKind;
}

const COMUN_CLASE: SymbolKind = 'clase';

const DESCRIPCIONES: Record<string, Descripcion> = {
  python: {
    declaraciones: { function_definition: 'funcion', class_definition: COMUN_CLASE, assignment: 'constante' },
    contenedores: { class_definition: COMUN_CLASE },
    importaciones: ['import_statement', 'import_from_statement'],
    metodoEnContenedor: 'metodo de clase',
  },
  java: {
    declaraciones: {
      class_declaration: COMUN_CLASE, interface_declaration: 'interfaz',
      enum_declaration: 'enumeracion', record_declaration: COMUN_CLASE,
      method_declaration: 'funcion', constructor_declaration: 'constructor de clase',
      field_declaration: 'propiedad',
    },
    contenedores: { class_declaration: COMUN_CLASE, interface_declaration: 'interfaz', record_declaration: COMUN_CLASE, enum_declaration: 'enumeracion' },
    importaciones: ['import_declaration'],
    metodoEnContenedor: 'metodo de clase',
  },
  c_sharp: {
    declaraciones: {
      class_declaration: COMUN_CLASE, interface_declaration: 'interfaz',
      enum_declaration: 'enumeracion', struct_declaration: COMUN_CLASE,
      record_declaration: COMUN_CLASE, method_declaration: 'funcion',
      constructor_declaration: 'constructor de clase', property_declaration: 'propiedad',
      field_declaration: 'propiedad', namespace_declaration: 'modulo',
    },
    contenedores: {
      class_declaration: COMUN_CLASE, interface_declaration: 'interfaz',
      struct_declaration: COMUN_CLASE, record_declaration: COMUN_CLASE,
    },
    importaciones: ['using_directive'],
    metodoEnContenedor: 'metodo de clase',
  },
  go: {
    declaraciones: {
      function_declaration: 'funcion', method_declaration: 'metodo de clase',
      type_spec: COMUN_CLASE, const_spec: 'constante',
    },
    contenedores: {},
    importaciones: ['import_spec'],
  },
  php: {
    declaraciones: {
      class_declaration: COMUN_CLASE, interface_declaration: 'interfaz',
      trait_declaration: 'interfaz', enum_declaration: 'enumeracion',
      function_definition: 'funcion', method_declaration: 'funcion',
      const_element: 'constante', property_declaration: 'propiedad',
    },
    contenedores: { class_declaration: COMUN_CLASE, interface_declaration: 'interfaz', trait_declaration: 'interfaz' },
    importaciones: ['namespace_use_declaration', 'require_expression', 'include_expression'],
    metodoEnContenedor: 'metodo de clase',
  },
  ruby: {
    declaraciones: { class: COMUN_CLASE, module: 'modulo', method: 'funcion', singleton_method: 'funcion' },
    contenedores: { class: COMUN_CLASE, module: 'modulo' },
    importaciones: [],
    metodoEnContenedor: 'metodo de clase',
  },
  rust: {
    declaraciones: {
      function_item: 'funcion', struct_item: COMUN_CLASE, enum_item: 'enumeracion',
      trait_item: 'interfaz', mod_item: 'modulo', const_item: 'constante',
      static_item: 'constante', type_item: 'tipo',
    },
    contenedores: { impl_item: COMUN_CLASE, trait_item: 'interfaz' },
    importaciones: ['use_declaration'],
    metodoEnContenedor: 'metodo de clase',
  },
  c: {
    declaraciones: {
      function_definition: 'funcion', struct_specifier: COMUN_CLASE,
      enum_specifier: 'enumeracion', type_definition: 'tipo', preproc_def: 'constante',
    },
    contenedores: {},
    importaciones: ['preproc_include'],
  },
  cpp: {
    declaraciones: {
      function_definition: 'funcion', class_specifier: COMUN_CLASE,
      struct_specifier: COMUN_CLASE, enum_specifier: 'enumeracion',
      namespace_definition: 'modulo', type_definition: 'tipo', preproc_def: 'constante',
    },
    contenedores: { class_specifier: COMUN_CLASE, struct_specifier: COMUN_CLASE },
    importaciones: ['preproc_include'],
    metodoEnContenedor: 'metodo de clase',
  },
  bash: {
    declaraciones: { function_definition: 'funcion' },
    contenedores: {},
    importaciones: [],
  },
  lua: {
    declaraciones: { function_declaration: 'funcion' },
    contenedores: {},
    importaciones: [],
  },
  kotlin: {
    declaraciones: {
      class_declaration: COMUN_CLASE, object_declaration: 'modulo',
      function_declaration: 'funcion', property_declaration: 'propiedad',
    },
    contenedores: { class_declaration: COMUN_CLASE, object_declaration: 'modulo' },
    importaciones: ['import_header'],
    metodoEnContenedor: 'metodo de clase',
  },
  swift: {
    declaraciones: {
      class_declaration: COMUN_CLASE, protocol_declaration: 'interfaz',
      function_declaration: 'funcion', property_declaration: 'propiedad',
    },
    contenedores: { class_declaration: COMUN_CLASE, protocol_declaration: 'interfaz' },
    importaciones: ['import_declaration'],
    metodoEnContenedor: 'metodo de clase',
  },
  dart: {
    declaraciones: {
      class_definition: COMUN_CLASE, enum_declaration: 'enumeracion',
      function_signature: 'funcion', method_signature: 'funcion',
    },
    contenedores: { class_definition: COMUN_CLASE },
    importaciones: ['import_or_export'],
    metodoEnContenedor: 'metodo de clase',
  },
};

export const extensionesConGramatica = () => Object.keys(GRAMATICA_DE);
export const gramaticaDe = (ext: string): string | null => GRAMATICA_DE[ext] ?? null;

// --------------------------------------------------------------- carga

type ParserCtor = new () => { setLanguage(l: unknown): void; parse(s: string): { rootNode: Nodo } | null };

let iniciando: Promise<{ Parser: ParserCtor; Language: { load(u: string): Promise<unknown> } }> | null = null;
const gramaticas = new Map<string, Promise<unknown>>();

/**
 * Base desde la que se piden los .wasm. Por omision es la propia aplicacion,
 * que funciona igual en desarrollo y empaquetada. Se puede cambiar para leer
 * las gramaticas de otro sitio: es lo que hacen las pruebas, que las cargan
 * del disco en lugar de por HTTP.
 */
let baseGramaticas: string | null = null;

export function usarGramaticasDesde(base: string) {
  baseGramaticas = base.endsWith('/') ? base : `${base}/`;
}

const rutaWasm = (archivo: string) =>
  `${baseGramaticas ?? `${import.meta.env.BASE_URL}gramaticas/`}${archivo}`;

async function motor() {
  if (!iniciando) {
    iniciando = (async () => {
      const mod = await import('web-tree-sitter');
      await mod.Parser.init({ locateFile: () => rutaWasm('tree-sitter.wasm') });
      return { Parser: mod.Parser as unknown as ParserCtor, Language: mod.Language };
    })();
  }
  return iniciando;
}

function cargarGramatica(nombre: string) {
  let pendiente = gramaticas.get(nombre);
  if (!pendiente) {
    pendiente = motor().then((m) => m.Language.load(rutaWasm(`tree-sitter-${nombre}.wasm`)));
    gramaticas.set(nombre, pendiente);
  }
  return pendiente;
}

// --------------------------------------------------------------- analisis

const IDENTIFICADORES = new Set([
  'identifier', 'type_identifier', 'field_identifier', 'constant',
  'simple_identifier', 'type_declaration', 'word', 'name', 'namespace',
  'qualified_identifier', 'scoped_identifier', 'dotted_name',
]);

/**
 * El nombre de una declaración. Casi siempre está en el campo "name"; cuando
 * no (C envuelve el nombre dentro del declarador, Go lo mete en un spec), se
 * busca el primer identificador que cuelgue del nodo.
 */
function nombreDe(nodo: Nodo): string | null {
  const campo = nodo.childForFieldName('name');
  if (campo) return campo.text.trim() || null;

  const declarador = nodo.childForFieldName('declarator');
  if (declarador) {
    const anidado = nombreDe(declarador);
    if (anidado) return anidado;
  }

  // Búsqueda en anchura y poco profunda: el nombre siempre está cerca de la
  // raíz de la declaración, y así no se cuela un identificador del cuerpo.
  let nivel = [nodo];
  for (let profundidad = 0; profundidad < 4 && nivel.length; profundidad++) {
    const siguiente: Nodo[] = [];
    for (const actual of nivel) {
      for (const hijo of actual.namedChildren) {
        if (IDENTIFICADORES.has(hijo.type)) return hijo.text.trim() || null;
        siguiente.push(hijo);
      }
    }
    nivel = siguiente;
  }
  return null;
}

/** Firma corta de una declaración: su primera línea, sin el cuerpo. */
function resumen(nodo: Nodo): string {
  const primera = nodo.text.split('\n')[0].trim();
  return primera.length > 120 ? `${primera.slice(0, 117)}...` : primera;
}

/**
 * Una asignación solo cuenta cuando está fuera de toda función: ahí es una
 * constante del módulo. Las de dentro son variables de trabajo y llenarían el
 * panel de ruido. No vale medir la profundidad, porque Python envuelve la
 * asignación de nivel superior en un `expression_statement`.
 */
const esAsignacionUtil = (nodo: Nodo, dentroDeFuncion: boolean) =>
  nodo.type !== 'assignment' || !dentroDeFuncion;

const ES_FUNCION = new Set<SymbolKind>(['funcion', 'metodo de clase', 'constructor de clase']);

export interface AnalisisGramatica {
  simbolos: DetectedSymbol[];
  imports: string[];
  classes: string[];
}

function recorrer(
  raiz: Nodo,
  descripcion: Descripcion,
  filePath: string,
  lenguaje: string,
): AnalisisGramatica {
  const simbolos: DetectedSymbol[] = [];
  const imports: string[] = [];
  const classes: string[] = [];
  const ocurrencias = new Map<string, number>();
  const importaciones = new Set(descripcion.importaciones);

  const visitar = (nodo: Nodo, contenedor: string | null, dentroDeFuncion: boolean) => {
    if (importaciones.has(nodo.type)) {
      const especificador = extraerImport(nodo);
      if (especificador) imports.push(especificador);
    }

    const kindBase = descripcion.declaraciones[nodo.type];
    const esContenedor = nodo.type in descripcion.contenedores;
    let nombreCompleto = contenedor;

    let enFuncion = dentroDeFuncion;

    if (kindBase && esAsignacionUtil(nodo, dentroDeFuncion)) {
      const nombre = nombreDe(nodo);
      if (nombre) {
        // Dentro de una clase, una función es un método y lleva su apellido.
        const kind: SymbolKind =
          contenedor && descripcion.metodoEnContenedor && (kindBase === 'funcion' || kindBase === 'metodo de clase')
            ? descripcion.metodoEnContenedor
            : kindBase;
        const cualificado = contenedor ? `${contenedor}.${nombre}` : nombre;
        const vistas = ocurrencias.get(cualificado) ?? 0;
        ocurrencias.set(cualificado, vistas + 1);

        simbolos.push({
          id: `${filePath}::${cualificado}#${vistas}`,
          name: nombre,
          qualifiedName: cualificado,
          kind,
          category: CATEGORIA_DE[kind],
          filePath,
          line: nodo.startPosition.row + 1,
          endLine: nodo.endPosition.row + 1,
          isAsync: /\basync\b/.test(nodo.text.slice(0, 60)),
          isGenerator: false,
          params: [],
          code: nodo.text.slice(0, 20000),
          codeHash: '',
          language: lenguaje,
          detail: resumen(nodo),
        });
        if (kind === 'clase') classes.push(cualificado);
        if (esContenedor) nombreCompleto = cualificado;
        if (ES_FUNCION.has(kind)) enFuncion = true;
      }
    } else if (esContenedor) {
      // Un `impl` de Rust no se declara con nombre propio, pero sí da apellido.
      const nombre = nombreDe(nodo);
      if (nombre) nombreCompleto = contenedor ? `${contenedor}.${nombre}` : nombre;
    }

    for (const hijo of nodo.namedChildren) visitar(hijo, nombreCompleto, enFuncion);
  };

  visitar(raiz, null, false);
  return { simbolos, imports, classes };
}

const COMILLAS = /^['"<]|['">]$/g;

/** El archivo o el módulo al que apunta una importación, sin adornos. */
function extraerImport(nodo: Nodo): string | null {
  const texto = nodo.text.trim();
  // Lo entrecomillado es lo habitual: "os", 'react', <stdio.h>, "./util".
  const entrecomillado = /["'<]([^"'<>]+)["'>]/.exec(texto);
  if (entrecomillado) return entrecomillado[1];

  // Si no, la última palabra con puntos: import java.util.List, use std::fmt.
  const limpio = texto
    .replace(/^(import|from|using|use|require|include|package)\s+/i, '')
    .replace(/[;{]/g, ' ')
    .trim()
    .split(/\s+/)[0];
  const resultado = limpio?.replace(COMILLAS, '').trim();
  return resultado || null;
}

/**
 * Analiza un archivo con su gramática. Devuelve `null` cuando el lenguaje no
 * está soportado, para que quien llama use los analizadores de siempre.
 */
export async function analizarConGramatica(
  filePath: string,
  source: string,
  ext: string,
): Promise<AnalisisGramatica | null> {
  const nombre = GRAMATICA_DE[ext];
  if (!nombre) return null;
  const descripcion = DESCRIPCIONES[nombre];
  if (!descripcion) return null;

  const [{ Parser }, gramatica] = await Promise.all([motor(), cargarGramatica(nombre)]);
  const parser = new Parser();
  parser.setLanguage(gramatica);
  const arbol = parser.parse(source);
  if (!arbol) return null;

  return recorrer(arbol.rootNode, descripcion, filePath, nombre);
}
