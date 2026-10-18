import type { DetectedSymbol, SymbolKind } from '../types.ts';
import { CATEGORIA_DE } from '../types.ts';

/**
 * Analizadores pequeños para YAML, SQL y Dockerfile: sin gramática completa,
 * pero lo bastante para que aparezcan en Elementos, en el mapa y se puedan
 * documentar (las claves de un docker-compose, las tablas de un .sql, las
 * etapas de un Dockerfile).
 */

function simbolo(filePath: string, nombre: string, kind: SymbolKind, linea: number, fin: number, lineas: string[], lenguaje: string, detail: string, vistas: Map<string, number>): DetectedSymbol {
  const n = vistas.get(nombre) ?? 0;
  vistas.set(nombre, n + 1);
  return {
    id: `${filePath}::${nombre}#${n}`,
    name: nombre,
    qualifiedName: nombre,
    kind,
    category: CATEGORIA_DE[kind],
    filePath,
    line: linea,
    endLine: fin,
    isAsync: false,
    isGenerator: false,
    params: [],
    code: lineas.slice(linea - 1, fin).join('\n').slice(0, 20000),
    codeHash: '',
    language: lenguaje,
    detail,
  };
}

/** YAML: claves de primer y segundo nivel (en docker-compose, cada servicio). */
export function analizarYaml(filePath: string, fuente: string): DetectedSymbol[] {
  const lineas = fuente.split('\n');
  const vistas = new Map<string, number>();
  const salida: DetectedSymbol[] = [];
  const sangria = (l: string) => l.length - l.trimStart().length;
  lineas.forEach((l, i) => {
    const m = /^(\s*)([A-Za-z0-9_.-]+|"[^"]+"|'[^']+'):(\s|$)/.exec(l);
    if (!m || l.trimStart().startsWith('#') || l.trimStart().startsWith('-')) return;
    const nivel = m[1].length;
    if (nivel > 2) return;
    let fin = lineas.length;
    for (let j = i + 1; j < lineas.length; j++) {
      if (lineas[j].trim() && !lineas[j].trimStart().startsWith('#') && sangria(lineas[j]) <= nivel) { fin = j; break; }
    }
    const nombre = m[2].replace(/^["']|["']$/g, '');
    salida.push(simbolo(filePath, nombre, nivel === 0 ? 'seccion' : 'propiedad', i + 1, fin, lineas, 'yaml',
      nivel === 0 ? `Clave principal · ${fin - i - 1} línea(s)` : 'Clave anidada', vistas));
  });
  return salida;
}

/** SQL: tablas, vistas, funciones, procedimientos, índices y disparadores que se crean. */
export function analizarSql(filePath: string, fuente: string): DetectedSymbol[] {
  const lineas = fuente.split('\n');
  const vistas = new Map<string, number>();
  const salida: DetectedSymbol[] = [];
  const re = /^\s*create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+)?(table|view|function|procedure|index|unique\s+index|trigger|type|sequence)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i;
  const tipos: Record<string, [SymbolKind, string]> = {
    table: ['tabla', 'Tabla'], view: ['tabla', 'Vista'], function: ['funcion', 'Función'], procedure: ['funcion', 'Procedimiento'],
    index: ['metadato', 'Índice'], 'unique index': ['metadato', 'Índice único'], trigger: ['funcion', 'Disparador'],
    type: ['tipo', 'Tipo'], sequence: ['metadato', 'Secuencia'],
  };
  lineas.forEach((l, i) => {
    const m = re.exec(l);
    if (!m) return;
    const clase = m[1].toLowerCase().replace(/\s+/g, ' ');
    const [kind, nombreTipo] = tipos[clase] ?? ['metadato', clase];
    // Hasta el ; que cierra la sentencia (o un $$ ... $$ de función).
    let fin = i + 1;
    let enDolares = false;
    for (let j = i; j < lineas.length; j++) {
      if ((lineas[j].match(/\$\$/g) ?? []).length % 2 === 1) enDolares = !enDolares;
      if (!enDolares && /;\s*(--.*)?$/.test(lineas[j])) { fin = j + 1; break; }
      fin = j + 1;
    }
    const nombre = m[2].replace(/["`[\]]/g, '');
    salida.push(simbolo(filePath, nombre, kind, i + 1, fin, lineas, 'sql', nombreTipo, vistas));
  });
  return salida;
}

/** Dockerfile: cada etapa (FROM ... AS nombre), y los puertos y el comando de arranque. */
export function analizarDockerfile(filePath: string, fuente: string): DetectedSymbol[] {
  const lineas = fuente.split('\n');
  const vistas = new Map<string, number>();
  const salida: DetectedSymbol[] = [];
  const etapas = lineas.map((l, i) => ({ l, i })).filter(({ l }) => /^\s*FROM\s+/i.test(l));
  etapas.forEach(({ l, i }, k) => {
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(l)!;
    const fin = k + 1 < etapas.length ? etapas[k + 1].i : lineas.length;
    salida.push(simbolo(filePath, m[2] ?? `etapa ${k + 1}`, 'seccion', i + 1, fin, lineas, 'dockerfile', `Etapa desde la imagen ${m[1]}`, vistas));
  });
  lineas.forEach((l, i) => {
    const m = /^\s*(EXPOSE|ENTRYPOINT|CMD|HEALTHCHECK)\s+(.+)/i.exec(l);
    if (m) salida.push(simbolo(filePath, `${m[1].toUpperCase()} ${m[2].trim().slice(0, 40)}`, 'metadato', i + 1, i + 1, lineas, 'dockerfile', m[1].toUpperCase(), vistas));
  });
  return salida.sort((a, b) => a.line - b.line);
}
