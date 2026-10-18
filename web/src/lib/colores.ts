import type * as Monaco from 'monaco-editor';

/**
 * Colores del editor.
 *
 * Dos temas propios (oscuro y claro) donde cada cosa tiene su color: palabras
 * clave, variables, parámetros, propiedades, funciones, clases, constantes,
 * cadenas, números... Y un proveedor "semántico" que distingue esas clases de
 * nombres, porque el resaltado básico de Monaco los pinta todos igual.
 */

export const TEMA_OSCURO = 'codemind-oscuro';
export const TEMA_CLARO = 'codemind-claro';

type Paleta = Record<
  'fondo' | 'texto' | 'comentario' | 'clave' | 'control' | 'cadena' | 'numero' | 'funcion' | 'metodo' | 'clase' |
  'tipo' | 'variable' | 'parametro' | 'propiedad' | 'constante' | 'operador' | 'regex' | 'etiqueta' | 'atributo' |
  'escape' | 'puntuacion',
  string
>;

const OSCURA: Paleta = {
  fondo: '#1a1b26',
  texto: '#c0caf5',
  comentario: '#6b7394',
  clave: '#bb9af7', // violeta
  control: '#ff5370', // rojo: if, return, for…
  cadena: '#9ece6a', // verde
  numero: '#ff9e64', // naranja
  funcion: '#7aa2f7', // azul
  metodo: '#7dcfff', // celeste
  clase: '#e0af68', // ámbar
  tipo: '#2ac3de', // turquesa
  variable: '#e8e3a8', // amarillo pálido
  parametro: '#ff79c6', // rosa, en cursiva
  propiedad: '#73daca', // verde agua
  constante: '#ff9e64',
  operador: '#89ddff',
  regex: '#b4f9f8',
  etiqueta: '#f7768e',
  atributo: '#e0af68',
  escape: '#ff007c',
  puntuacion: '#9aa5ce',
};

const CLARA: Paleta = {
  fondo: '#fbfbfd',
  texto: '#2e3440',
  comentario: '#8a8f98',
  clave: '#8839ef',
  control: '#d20f39',
  cadena: '#40a02b',
  numero: '#fe640b',
  funcion: '#1e66f5',
  metodo: '#04a5e5',
  clase: '#b8860b',
  tipo: '#179299',
  variable: '#a0522d',
  parametro: '#ea76cb',
  propiedad: '#0f8a7a',
  constante: '#fe640b',
  operador: '#04a5e5',
  regex: '#179299',
  etiqueta: '#d20f39',
  atributo: '#df8e1d',
  escape: '#e64553',
  puntuacion: '#6c6f85',
};

const sin = (c: string) => c.replace('#', '');

function reglas(p: Paleta): Monaco.editor.ITokenThemeRule[] {
  const r = (token: string, color: string, fontStyle?: string) => ({ token, foreground: sin(color), ...(fontStyle ? { fontStyle } : {}) });
  return [
    r('', p.texto),
    r('comment', p.comentario, 'italic'),
    r('comment.doc', p.comentario, 'italic'),
    r('keyword', p.clave),
    r('keyword.flow', p.control),
    r('keyword.control', p.control),
    r('storage', p.clave),
    r('string', p.cadena),
    r('string.key', p.propiedad),
    r('string.value', p.cadena),
    r('string.escape', p.escape),
    r('string.link', p.funcion, 'underline'),
    r('number', p.numero),
    r('number.hex', p.numero),
    r('number.float', p.numero),
    r('regexp', p.regex),
    r('type', p.tipo),
    r('type.identifier', p.clase),
    r('identifier', p.variable),
    r('variable', p.variable),
    r('variable.predefined', p.constante),
    r('variable.parameter', p.parametro, 'italic'),
    r('constant', p.constante),
    r('predefined', p.metodo),
    r('operator', p.operador),
    r('delimiter', p.puntuacion),
    r('delimiter.bracket', p.puntuacion),
    r('delimiter.html', p.puntuacion),
    r('delimiter.xml', p.puntuacion),
    r('tag', p.etiqueta),
    r('metatag', p.clave),
    r('attribute.name', p.atributo),
    r('attribute.value', p.cadena),
    r('annotation', p.clase),
    r('key', p.propiedad),
    r('emphasis', p.texto, 'italic'),
    r('strong', p.texto, 'bold'),
    r('keyword.md', p.clave),
    // Tokens semánticos (los pone el proveedor de abajo).
    r('control', p.control),
    r('function', p.funcion),
    r('method', p.metodo),
    r('class', p.clase),
    r('namespace', p.tipo),
    r('parameter', p.parametro, 'italic'),
    r('property', p.propiedad),
    r('variable.readonly', p.constante),
    r('variable.declaration', p.variable, 'bold'),
  ];
}

function colores(p: Paleta, oscuro: boolean): Monaco.editor.IColors {
  return {
    'editor.background': p.fondo,
    'editor.foreground': p.texto,
    'editorLineNumber.foreground': oscuro ? '#3b4261' : '#b4b8c4',
    'editorLineNumber.activeForeground': oscuro ? '#c0caf5' : '#2e3440',
    'editor.lineHighlightBackground': oscuro ? '#222436' : '#f0f1f6',
    'editor.selectionBackground': oscuro ? '#33467c' : '#c9d6f7',
    'editor.inactiveSelectionBackground': oscuro ? '#2a3150' : '#e0e6f7',
    'editor.wordHighlightBackground': oscuro ? '#3d59a133' : '#1e66f522',
    'editorCursor.foreground': oscuro ? '#c0caf5' : '#1e66f5',
    'editorIndentGuide.background1': oscuro ? '#292e42' : '#e6e7ee',
    'editorIndentGuide.activeBackground1': oscuro ? '#3b4261' : '#c5c8d4',
    'editorBracketHighlight.foreground1': oscuro ? '#e0af68' : '#df8e1d',
    'editorBracketHighlight.foreground2': oscuro ? '#bb9af7' : '#8839ef',
    'editorBracketHighlight.foreground3': oscuro ? '#7dcfff' : '#04a5e5',
    'editorBracketHighlight.foreground4': oscuro ? '#9ece6a' : '#40a02b',
    'editorBracketHighlight.foreground5': oscuro ? '#f7768e' : '#d20f39',
    'editorBracketHighlight.foreground6': oscuro ? '#ff9e64' : '#fe640b',
    'editorBracketMatch.background': oscuro ? '#3b426155' : '#1e66f522',
    'editorBracketMatch.border': oscuro ? '#7aa2f7' : '#1e66f5',
    'editorSuggestWidget.background': oscuro ? '#1f2335' : '#ffffff',
    'editorSuggestWidget.border': oscuro ? '#3b4261' : '#d5d8e2',
    'editorSuggestWidget.selectedBackground': oscuro ? '#2e3c64' : '#dce6fb',
    'editorSuggestWidget.highlightForeground': oscuro ? '#7aa2f7' : '#1e66f5',
    'editorSuggestWidget.focusHighlightForeground': oscuro ? '#7dcfff' : '#1e66f5',
    'editorHoverWidget.background': oscuro ? '#1f2335' : '#ffffff',
    'editorHoverWidget.border': oscuro ? '#3b4261' : '#d5d8e2',
    'editorWidget.background': oscuro ? '#1f2335' : '#ffffff',
    'editorInlayHint.foreground': oscuro ? '#737aa2' : '#8a8f98',
    'editorInlayHint.background': oscuro ? '#24283b' : '#eef0f5',
    'minimap.background': p.fondo,
    'scrollbarSlider.background': oscuro ? '#3b426166' : '#b4b8c466',
  };
}

export function registrarTemasPropios(monaco: typeof Monaco) {
  monaco.editor.defineTheme(TEMA_OSCURO, { base: 'vs-dark', inherit: true, rules: reglas(OSCURA), colors: colores(OSCURA, true) });
  monaco.editor.defineTheme(TEMA_CLARO, { base: 'vs', inherit: true, rules: reglas(CLARA), colors: colores(CLARA, false) });
}

// ------------------------------------------------------- color semántico

const TIPOS = ['variable', 'parameter', 'property', 'function', 'method', 'class', 'namespace', 'control'];
const MODIFICADORES = ['readonly', 'declaration'];
const T = Object.fromEntries(TIPOS.map((t, i) => [t, i])) as Record<string, number>;

/** Palabras que preceden al nombre que se declara. */
const DECLARA = /\b(?:const|let|var|val|auto|my|local|static|final)\s+([A-Za-z_$][\w$]*)/g;
const FUNCION = /\b(?:function\*?|def|fn|func|fun|sub|proc)\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;
// Métodos de clase: "  async nombre(a, b) {" al principio de la línea.
const METODO = /^[ 	]*(?:(?:public|private|protected|static|async|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::[^{=;]*)?\{/gm;
const CONTROL = new Set(['if', 'else', 'for', 'while', 'do', 'return', 'switch', 'case', 'default', 'break', 'continue', 'throw', 'try', 'catch', 'finally', 'await', 'yield', 'import', 'export', 'from', 'elif', 'except', 'raise', 'with', 'match', 'loop', 'pass', 'goto']);
const FLECHA = /\(([^()]*)\)\s*(?::[^=]*?)?=>|([A-Za-z_$][\w$]*)\s*=>/g;

/** Nombres de parámetros de una lista "(a, b = 1, {c, d}: T)". */
function nombresDeParametros(lista: string): string[] {
  return lista
    .replace(/=[^,]*/g, '')
    .replace(/:[^,]*/g, '')
    .split(/[,{}[\]\s.*&]+/)
    .map((x) => x.trim())
    .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x) && !['self', 'this', 'mut'].includes(x));
}

/**
 * Proveedor de tokens semánticos que funciona con cualquier lenguaje.
 *
 * Usa los tokens que Monaco ya produce (así no se tocan cadenas ni
 * comentarios) y, a cada "identifier", le da un tipo según su contexto:
 * llamada → función, tras un punto → propiedad o método, MAYÚSCULAS →
 * constante, Inicial mayúscula → clase, parámetro conocido → parámetro, y
 * el resto → variable. Es una aproximación, no un compilador.
 */
export function registrarColorSemantico(monaco: typeof Monaco) {
  const leyenda = { tokenTypes: TIPOS, tokenModifiers: MODIFICADORES };
  monaco.languages.registerDocumentSemanticTokensProvider({ scheme: 'file' }, {
    getLegend: () => leyenda,
    releaseDocumentSemanticTokens: () => {},
    provideDocumentSemanticTokens(modelo) {
      const texto = modelo.getValue();
      // Archivos enormes: no merece la pena (y Monaco se volvería lento).
      if (texto.length > 400_000) return null;
      const lenguaje = modelo.getLanguageId();
      if (['plaintext', 'markdown', 'json', 'css', 'scss', 'less', 'html', 'xml', 'yaml'].includes(lenguaje)) return null;

      const parametros = new Set<string>();
      const declarados = new Set<string>();
      let m: RegExpExecArray | null;
      FUNCION.lastIndex = 0;
      while ((m = FUNCION.exec(texto))) nombresDeParametros(m[2]).forEach((n) => parametros.add(n));
      METODO.lastIndex = 0;
      while ((m = METODO.exec(texto))) if (!CONTROL.has(m[1])) nombresDeParametros(m[2]).forEach((n) => parametros.add(n));
      FLECHA.lastIndex = 0;
      while ((m = FLECHA.exec(texto))) nombresDeParametros(m[1] ?? m[2] ?? '').forEach((n) => parametros.add(n));
      DECLARA.lastIndex = 0;
      while ((m = DECLARA.exec(texto))) declarados.add(m[1]);

      const lineas = texto.split('\n');
      const tokens = monaco.editor.tokenize(texto, lenguaje);
      const datos: number[] = [];
      let lineaAnt = 0;
      let colAnt = 0;

      tokens.forEach((fila, nl) => {
        const linea = lineas[nl] ?? '';
        fila.forEach((tk, i) => {
          const fin = i + 1 < fila.length ? fila[i + 1].offset : linea.length;
          const nombre = linea.slice(tk.offset, fin);
          // Palabras de control de flujo: su propio color, distinto del resto.
          if (tk.type.startsWith('keyword') && CONTROL.has(nombre)) {
            const dl = nl - lineaAnt;
            datos.push(dl, dl === 0 ? tk.offset - colAnt : tk.offset, nombre.length, T.control, 0);
            lineaAnt = nl;
            colAnt = tk.offset;
            return;
          }
          // Monaco añade el lenguaje al final: "identifier.ts", "type.identifier.ts".
          if (!tk.type.startsWith('identifier') && !tk.type.startsWith('type.identifier')) return;
          if (!/^[A-Za-z_$][\w$]*$/.test(nombre)) return;

          const antes = linea.slice(0, tk.offset).trimEnd();
          const despues = linea.slice(fin).trimStart();
          const trasPunto = antes.endsWith('.') || antes.endsWith('?.') || antes.endsWith('->') || antes.endsWith('::');
          const llamada = despues.startsWith('(') || /^<[\w\s,<>[\]]*>\(/.test(despues);
          const declaracion = /\b(?:const|let|var|val|auto|function\*?|def|fn|func|class|interface|type|enum|struct)\s+$/.test(antes);

          let tipo: string;
          let mods = 0;
          if (llamada) tipo = trasPunto ? 'method' : 'function';
          else if (/\b(?:function\*?|def|fn|func)\s+$/.test(antes)) tipo = 'function';
          else if (trasPunto) tipo = 'property';
          else if (/^[A-Z][A-Z0-9_]+$/.test(nombre)) { tipo = 'variable'; mods |= 1; }
          else if (/^[A-Z]/.test(nombre)) tipo = 'class';
          else if (parametros.has(nombre) && !declarados.has(nombre)) tipo = 'parameter';
          else if (/^\s*:\s*[^:=]/.test(despues) && /(?:[{,;]|^)\s*$/.test(antes) && !/=/.test(despues.split(/[,;]/)[0])) tipo = 'property'; // { clave: valor }
          else tipo = 'variable';
          if (declaracion && tipo === 'variable') mods |= 2;

          const dl = nl - lineaAnt;
          const dc = dl === 0 ? tk.offset - colAnt : tk.offset;
          datos.push(dl, dc, nombre.length, T[tipo], mods);
          lineaAnt = nl;
          colAnt = tk.offset;
        });
      });
      return { data: new Uint32Array(datos) };
    },
  });
}
