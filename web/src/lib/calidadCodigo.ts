import type { DetectedSymbol } from './types';

/**
 * Señales de calidad del código, todas informativas: no se cambia nada y no
 * son errores. Están para saber dónde mirar.
 */

export interface Hallazgo { ruta: string; linea: number; texto: string; detalle?: string }

/** TODO, FIXME, HACK y XXX en comentarios. */
export function pendientes(fuentes: Record<string, string>): (Hallazgo & { tipo: string })[] {
  const salida: (Hallazgo & { tipo: string })[] = [];
  const re = /(?:\/\/|#|\/\*|<!--|--|\*)\s*(TODO|FIXME|HACK|XXX)\b[:\s-]*(.*)/i;
  for (const [ruta, texto] of Object.entries(fuentes)) {
    texto.split('\n').forEach((l, i) => {
      const m = re.exec(l);
      if (m) salida.push({ ruta, linea: i + 1, tipo: m[1].toUpperCase(), texto: m[2].replace(/\*\/|-->/g, '').trim() || '(sin texto)' });
    });
  }
  return salida;
}

/** Sangría con tabuladores y espacios mezclados, finales de línea mezclados. */
export function formato(fuentes: Record<string, string>): Hallazgo[] {
  const salida: Hallazgo[] = [];
  for (const [ruta, texto] of Object.entries(fuentes)) {
    const crlf = (texto.match(/\r\n/g) ?? []).length;
    const lf = (texto.match(/(?<!\r)\n/g) ?? []).length;
    if (crlf && lf) salida.push({ ruta, linea: 1, texto: `Finales de línea mezclados: ${crlf} CRLF (Windows) y ${lf} LF (Unix).` });
    const lineas = texto.split('\n');
    const conTab = lineas.findIndex((l) => /^\t+/.test(l));
    const conEsp = lineas.findIndex((l) => /^ {2,}\S/.test(l));
    if (conTab !== -1 && conEsp !== -1) {
      salida.push({ ruta, linea: Math.max(conTab, conEsp) + 1, texto: 'Sangría mezclada: hay líneas con tabuladores y otras con espacios.' });
    }
    const mixtaEnLinea = lineas.findIndex((l) => /^(\t+ +| +\t+)/.test(l));
    if (mixtaEnLinea !== -1) salida.push({ ruta, linea: mixtaEnLinea + 1, texto: 'Esta línea mezcla tabuladores y espacios en la misma sangría.' });
  }
  return salida;
}

// Escritos como \uXXXX dentro de cadenas: en el código fuente, varios de
// estos caracteres literales romperían la propia expresión regular.
const INVISIBLES: [RegExp, string][] = [
  [new RegExp('\u200B'), 'espacio de ancho cero (U+200B)'],
  [new RegExp('\u200C|\u200D'), 'unión/no unión de ancho cero'],
  [new RegExp('\uFEFF'), 'BOM en medio del texto (U+FEFF)'],
  [new RegExp('\u00A0'), 'espacio de no separación (U+00A0)'],
  [new RegExp('[\u2028\u2029]'), 'separador de línea Unicode'],
  [new RegExp('[\u202A-\u202E\u2066-\u2069]'), 'control de dirección del texto (bidi)'],
];

/** Caracteres que no se ven y suelen dar errores raros (o esconder algo). */
export function invisibles(fuentes: Record<string, string>): Hallazgo[] {
  const salida: Hallazgo[] = [];
  for (const [ruta, texto] of Object.entries(fuentes)) {
    texto.split('\n').forEach((l, i) => {
      // El BOM al principio del archivo es legítimo.
      const linea = i === 0 ? l.replace(new RegExp('^\uFEFF'), '') : l;
      for (const [re, nombre] of INVISIBLES) {
        if (re.test(linea)) salida.push({ ruta, linea: i + 1, texto: `Contiene un ${nombre}.` });
      }
    });
  }
  return salida;
}

/**
 * Bloques repetidos: 6 líneas seguidas (sin contar vacías ni espacios) que
 * aparecen en más de un sitio. Se agrupan los tramos solapados.
 */
export function duplicados(fuentes: Record<string, string>, ventana = 6) {
  const vistos = new Map<string, { ruta: string; linea: number }[]>();
  for (const [ruta, texto] of Object.entries(fuentes)) {
    const lineas = texto.split('\n').map((l, i) => ({ t: l.trim().replace(/\s+/g, ' '), n: i + 1 })).filter((x) => x.t.length > 2 && !/^[{}()[\];,]+$/.test(x.t));
    for (let i = 0; i + ventana <= lineas.length; i++) {
      const clave = lineas.slice(i, i + ventana).map((x) => x.t).join('\n');
      const lista = vistos.get(clave) ?? [];
      lista.push({ ruta, linea: lineas[i].n });
      vistos.set(clave, lista);
    }
  }
  const grupos: { lugares: { ruta: string; linea: number }[]; muestra: string }[] = [];
  const cubiertos = new Set<string>();
  for (const [clave, lugares] of vistos) {
    if (lugares.length < 2) continue;
    const id = lugares.map((l) => `${l.ruta}:${l.linea}`).join('|');
    // Un tramo solapado con otro ya contado (la misma copia, una línea más abajo) no suma.
    if (lugares.some((l) => cubiertos.has(`${l.ruta}:${l.linea - 1}`))) {
      lugares.forEach((l) => cubiertos.add(`${l.ruta}:${l.linea}`));
      continue;
    }
    lugares.forEach((l) => cubiertos.add(`${l.ruta}:${l.linea}`));
    if (!grupos.some((g) => g.lugares.map((l) => `${l.ruta}:${l.linea}`).join('|') === id)) {
      grupos.push({ lugares, muestra: clave.split('\n').slice(0, 3).join('\n') });
    }
  }
  return grupos;
}

/**
 * Complejidad aproximada (ciclomática: 1 + cada decisión) y longitud de cada
 * función. Solo informativa: una función compleja no está mal por serlo.
 */
export function complejidad(simbolos: DetectedSymbol[], umbral = 10, maxLineas = 80) {
  return simbolos
    .filter((s) => s.category === 'codigo' && !s.menor && /funcion|metodo|hook|componente|constructor/.test(s.kind))
    .map((s) => {
      const sinTextos = s.code.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const decisiones = (sinTextos.match(/\b(if|for|while|case|catch|elif|except|when)\b|&&|\|\||\?\?|\?(?!\.)/g) ?? []).length;
      return { s, complejidad: 1 + decisiones, lineas: s.endLine - s.line + 1 };
    })
    .filter((x) => x.complejidad > umbral || x.lineas > maxLineas)
    .sort((a, b) => b.complejidad - a.complejidad);
}
