import type { DetectedSymbol, SymbolKind } from '../types.ts';
import { CATEGORIA_DE } from '../types.ts';

/**
 * Analizador de HTML.
 *
 * No usa DOMParser porque necesitamos el NÚMERO DE LÍNEA de cada elemento para
 * poder saltar a él desde el panel, y el DOM no conserva posiciones. Este
 * recorrido es un tokenizador sencillo que va contando líneas mientras avanza.
 *
 * Reconoce TODAS las etiquetas, no una seleccion: si esta en tu pagina, esta
 * en el panel. Lo que cambia entre unas y otras es el tipo que se les asigna,
 * y si cuentan como relleno (un parrafo suelto, un div sin nada) para que el
 * panel pueda esconderlas cuando la pagina es grande.
 *
 * Reconoce tres cosas distintas:
 *  - Bloques `<script>` y `<style>`, que se devuelven con su contenido y su
 *    desplazamiento para que los analicen los analizadores de JS y CSS.
 *  - Elementos estructurales: secciones, formularios, tablas, listas,
 *    cualquier cosa con `id`, y los componentes personalizados (con guion).
 *  - Manejadores en línea (`onclick="..."`), que son código real escondido en
 *    un atributo y que de otro modo nadie documentaría.
 */

export interface BloqueIncrustado {
  tipo: 'script' | 'style';
  codigo: string;
  /** Líneas que hay antes del contenido, para corregir la numeración. */
  offset: number;
  lenguaje: string;
}

export interface AnalisisHtml {
  simbolos: DetectedSymbol[];
  bloques: BloqueIncrustado[];
  /** Archivos a los que enlaza la pagina: scripts, hojas de estilo e imagenes. */
  dependencias: string[];
}

/** Elementos que estructuran una página y merecen aparecer en el panel. */
const ESTRUCTURALES: Record<string, SymbolKind> = {
  header: 'seccion',
  nav: 'seccion',
  main: 'seccion',
  section: 'seccion',
  article: 'seccion',
  aside: 'seccion',
  footer: 'seccion',
  dialog: 'seccion',
  form: 'formulario',
  table: 'tabla',
  ul: 'lista',
  ol: 'lista',
  select: 'formulario',
};

const ENCABEZADOS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Familias del resto de etiquetas, para darle un tipo a cada una. */
const POR_FAMILIA: [Set<string>, SymbolKind][] = [
  [new Set(['a']), 'enlace'],
  [new Set([
    'img', 'picture', 'source', 'video', 'audio', 'canvas', 'svg', 'iframe',
    'embed', 'object', 'figure', 'track', 'map', 'area',
  ]), 'multimedia'],
  [new Set([
    'input', 'button', 'textarea', 'label', 'option', 'optgroup', 'fieldset',
    'legend', 'output', 'progress', 'meter', 'datalist',
  ]), 'control'],
  [new Set([
    'meta', 'title', 'link', 'base', 'noscript', 'head',
  ]), 'metadato'],
  [new Set([
    'p', 'span', 'li', 'dt', 'dd', 'td', 'th', 'blockquote', 'q', 'cite',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'code', 'pre',
    'samp', 'kbd', 'var', 'abbr', 'time', 'sub', 'sup', 'del', 'ins',
    'caption', 'figcaption', 'summary', 'address', 'br', 'hr', 'wbr',
  ]), 'texto'],
];

/** Etiquetas de relleno cuando no llevan ni id ni clase. */
const RELLENO = new Set(['texto', 'contenedor', 'metadato']);

function familiaDe(etiqueta: string): SymbolKind {
  for (const [conjunto, kind] of POR_FAMILIA) if (conjunto.has(etiqueta)) return kind;
  return 'contenedor';
}

const RE_ETIQUETA = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const RE_ATRIBUTO = /([a-zA-Z_:@#.-][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function leerAtributos(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  let m: RegExpExecArray | null;
  RE_ATRIBUTO.lastIndex = 0;
  while ((m = RE_ATRIBUTO.exec(texto))) {
    salida[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return salida;
}

/** Cuenta las líneas que hay hasta una posición, sin cortar toda la cadena. */
function lineaEn(fuente: string, indice: number): number {
  let linea = 1;
  for (let i = 0; i < indice; i++) if (fuente.charCodeAt(i) === 10) linea++;
  return linea;
}

const nombreLegible = (attrs: Record<string, string>, etiqueta: string): string => {
  if (attrs.id) return `#${attrs.id}`;
  if (attrs.class) return `${etiqueta}.${attrs.class.trim().split(/\s+/)[0]}`;
  return etiqueta;
};

export function analizarHtml(filePath: string, fuente: string): AnalisisHtml {
  const simbolos: DetectedSymbol[] = [];
  const bloques: BloqueIncrustado[] = [];
  const dependencias: string[] = [];
  const lineas = fuente.split('\n');
  const ocurrencias = new Map<string, number>();

  /** Para una etiqueta sin atributos, su propio texto es lo que la identifica. */
  const resumenDeTexto = (inicio: number, fin: number, etiqueta: string) => {
    const crudo = lineas.slice(inicio - 1, fin).join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!crudo) return `<${etiqueta}>`;
    return crudo.length > 70 ? `${crudo.slice(0, 67)}...` : crudo;
  };

  const anadir = (
    nombre: string,
    kind: SymbolKind,
    inicio: number,
    fin: number,
    detail?: string,
    codigo?: string,
    menor = false,
  ) => {
    const vistas = ocurrencias.get(nombre) ?? 0;
    ocurrencias.set(nombre, vistas + 1);
    const cuerpo = codigo ?? lineas.slice(inicio - 1, fin).join('\n');
    simbolos.push({
      id: `${filePath}::${nombre}#${vistas}`,
      name: nombre,
      qualifiedName: nombre,
      kind,
      category: CATEGORIA_DE[kind],
      filePath,
      line: inicio,
      endLine: fin,
      isAsync: false,
      isGenerator: false,
      params: [],
      code: cuerpo.slice(0, 20000),
      codeHash: '',
      language: 'html',
      detail,
      menor,
    });
  };

  // Pila para saber dónde termina cada elemento abierto.
  const pila: { etiqueta: string; linea: number; attrs: Record<string, string> }[] = [];
  let m: RegExpExecArray | null;
  RE_ETIQUETA.lastIndex = 0;

  while ((m = RE_ETIQUETA.exec(fuente))) {
    const [completo, cierre, etiquetaCruda, atributos, autoCierre] = m;
    const etiqueta = etiquetaCruda.toLowerCase();
    const linea = lineaEn(fuente, m.index);

    // ---- script y style: se extrae su contenido con el desplazamiento exacto
    if (!cierre && (etiqueta === 'script' || etiqueta === 'style') && !autoCierre) {
      const attrs = leerAtributos(atributos);
      const finApertura = m.index + completo.length;
      const cierreTag = new RegExp(`</${etiqueta}\\s*>`, 'i');
      cierreTag.lastIndex = 0;
      const resto = fuente.slice(finApertura);
      const encontrado = cierreTag.exec(resto);
      const contenido = encontrado ? resto.slice(0, encontrado.index) : resto;
      const lineaFin = lineaEn(fuente, finApertura + contenido.length);

      // Un <script src="..."> no tiene código propio que analizar, pero sí es
      // una dependencia del archivo: se registra aquí porque esta rama sale
      // antes de llegar al registro general de atributos.
      const esExterno = etiqueta === 'script' && Boolean(attrs.src);
      if (esExterno) dependencias.push(attrs.src);
      if (!esExterno && contenido.trim()) {
        bloques.push({
          tipo: etiqueta === 'script' ? 'script' : 'style',
          codigo: contenido,
          offset: lineaEn(fuente, finApertura) - 1,
          lenguaje: etiqueta === 'script' ? (/typescript|ts/i.test(attrs.type ?? '') ? 'typescript' : 'javascript') : 'css',
        });
      }

      const nombre = etiqueta === 'script'
        ? (attrs.src ? `script[${attrs.src}]` : 'script')
        : 'style';
      const detalle = esExterno
        ? 'Script externo: se carga desde otro archivo'
        : `${contenido.split('\n').length} líneas`;
      anadir(nombre, etiqueta === 'script' ? 'bloque de script' : 'bloque de estilo', linea, lineaFin, detalle);

      RE_ETIQUETA.lastIndex = finApertura + contenido.length;
      continue;
    }

    if (cierre) {
      // Se cierra el elemento abierto más reciente con ese nombre.
      for (let i = pila.length - 1; i >= 0; i--) {
        if (pila[i].etiqueta !== etiqueta) continue;
        const abierto = pila[i];
        pila.splice(i);
        registrar(abierto.etiqueta, abierto.attrs, abierto.linea, linea);
        break;
      }
      continue;
    }

    const attrs = leerAtributos(atributos);

    // Enlaces a otros archivos del proyecto: son aristas del mapa.
    if (etiqueta === 'script' && attrs.src) dependencias.push(attrs.src);
    if (etiqueta === 'link' && attrs.href && /stylesheet/i.test(attrs.rel ?? '')) dependencias.push(attrs.href);

    // Manejadores en línea: onclick, onsubmit... son código de verdad.
    for (const [clave, valor] of Object.entries(attrs)) {
      if (!clave.startsWith('on') || !valor.trim()) continue;
      anadir(
        `${nombreLegible(attrs, etiqueta)} ${clave}`,
        'manejador en linea',
        linea,
        linea,
        `Código que se ejecuta en el evento ${clave.slice(2)}`,
        valor,
      );
    }

    const vacio = autoCierre || VACIOS.has(etiqueta);
    if (vacio) registrar(etiqueta, attrs, linea, linea);
    else pila.push({ etiqueta, linea, attrs });
  }

  // Elementos que quedaron sin cerrar: se registran igualmente.
  for (const abierto of pila) registrar(abierto.etiqueta, abierto.attrs, abierto.linea, abierto.linea);

  function registrar(etiqueta: string, attrs: Record<string, string>, inicio: number, fin: number) {
    const personalizado = etiqueta.includes('-');
    const estructural = ESTRUCTURALES[etiqueta];
    const encabezado = ENCABEZADOS.has(etiqueta);

    let kind: SymbolKind;
    if (personalizado) kind = 'componente personalizado';
    else if (estructural) kind = estructural;
    else if (encabezado) kind = 'encabezado';
    else if (attrs.id) kind = 'elemento con id';
    else kind = familiaDe(etiqueta);

    // Los detalles son lo que hace util la lista: sin ellos, diez <p> seguidos
    // son diez lineas iguales. Se muestran los atributos que dicen algo.
    const partes: string[] = [];
    if (attrs.id) partes.push(`id="${attrs.id}"`);
    if (attrs.class) partes.push(`class="${attrs.class}"`);
    if (attrs.href) partes.push(`href="${attrs.href}"`);
    if (attrs.src) partes.push(`src="${attrs.src}"`);
    if (attrs.alt) partes.push(`alt="${attrs.alt}"`);
    if (attrs.type) partes.push(`type="${attrs.type}"`);
    if (attrs.name) partes.push(`name="${attrs.name}"`);
    if (attrs.action) partes.push(`action="${attrs.action}"`);
    if (attrs.role) partes.push(`role="${attrs.role}"`);

    const menor = RELLENO.has(kind) && !attrs.id && !attrs.class;
    anadir(
      nombreLegible(attrs, etiqueta),
      kind,
      inicio,
      fin,
      partes.join('  ') || resumenDeTexto(inicio, fin, etiqueta),
      undefined,
      menor,
    );
  }

  return { simbolos, bloques, dependencias: [...new Set(dependencias)] };
}

/** Etiquetas que no llevan cierre. */
const VACIOS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
