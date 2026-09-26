import type { DetectedSymbol } from '../types.ts';
import { CATEGORIA_DE } from '../types.ts';

/**
 * Analizador de Markdown: sus encabezados son el índice del documento, y en
 * un proyecto la documentación cuenta tanto como el código.
 */
export function analizarMarkdown(filePath: string, fuente: string): DetectedSymbol[] {
  const lineas = fuente.split('\n');
  const simbolos: DetectedSymbol[] = [];
  const ocurrencias = new Map<string, number>();
  let dentroDeBloque = false;

  lineas.forEach((linea, indice) => {
    // Los ### dentro de un bloque de código no son encabezados.
    if (/^\s*```/.test(linea)) dentroDeBloque = !dentroDeBloque;
    if (dentroDeBloque) return;

    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(linea);
    if (!m) return;

    const nivel = m[1].length;
    const titulo = m[2].trim();
    const vistas = ocurrencias.get(titulo) ?? 0;
    ocurrencias.set(titulo, vistas + 1);

    // El encabezado llega hasta el siguiente del mismo nivel o superior.
    let fin = lineas.length;
    for (let i = indice + 1; i < lineas.length; i++) {
      const siguiente = /^(#{1,6})\s+/.exec(lineas[i]);
      if (siguiente && siguiente[1].length <= nivel) {
        fin = i;
        break;
      }
    }

    simbolos.push({
      id: `${filePath}::${titulo}#${vistas}`,
      name: titulo,
      qualifiedName: titulo,
      kind: 'encabezado',
      category: CATEGORIA_DE['encabezado'],
      filePath,
      line: indice + 1,
      endLine: fin,
      isAsync: false,
      isGenerator: false,
      params: [],
      code: lineas.slice(indice, fin).join('\n').slice(0, 20000),
      codeHash: '',
      language: 'markdown',
      detail: `Nivel ${nivel} · ${fin - indice - 1} línea(s) de contenido`,
    });
  });

  return simbolos;
}
