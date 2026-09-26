import type { DetectedSymbol, SymbolKind } from '../types.ts';
import { CATEGORIA_DE } from '../types.ts';

/**
 * Analizador de CSS, SCSS y LESS.
 *
 * Recorre el texto contando llaves para saber qué selectores son de primer
 * nivel y cuáles están anidados dentro de una consulta de medios. Reconoce
 * reglas, `@media`, `@keyframes` y variables `--nombre`, que en un proyecto
 * con temas suelen ser la parte más importante y la que nadie documenta.
 *
 * No es un parser completo de CSS: es un lector de estructura, que es lo que
 * hace falta para listar, navegar y explicar.
 */
export function analizarCss(filePath: string, fuente: string, offsetLineas = 0): DetectedSymbol[] {
  const simbolos: DetectedSymbol[] = [];
  const lineas = fuente.split('\n');
  const ocurrencias = new Map<string, number>();

  const anadir = (
    nombre: string,
    kind: SymbolKind,
    inicio: number,
    fin: number,
    detail?: string,
    codigo?: string,
  ) => {
    const vistas = ocurrencias.get(nombre) ?? 0;
    ocurrencias.set(nombre, vistas + 1);
    simbolos.push({
      id: `${filePath}::${nombre}#${vistas}`,
      name: nombre,
      qualifiedName: nombre,
      kind,
      category: CATEGORIA_DE[kind],
      filePath,
      line: inicio + offsetLineas,
      endLine: fin + offsetLineas,
      isAsync: false,
      isGenerator: false,
      params: [],
      code: (codigo ?? lineas.slice(inicio - 1, fin).join('\n')).slice(0, 20000),
      codeHash: '',
      language: 'css',
      detail,
    });
  };

  let i = 0;
  let linea = 1;
  let acumulado = '';
  let inicioBloque = 1;
  const pila: { nombre: string; kind: SymbolKind; linea: number }[] = [];

  const avanzar = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (fuente.charCodeAt(i) === 10) linea++;
      i++;
    }
  };

  while (i < fuente.length) {
    const c = fuente[i];

    // Comentarios: se saltan enteros para que no ensucien el selector.
    if (c === '/' && fuente[i + 1] === '*') {
      const fin = fuente.indexOf('*/', i + 2);
      avanzar((fin === -1 ? fuente.length : fin + 2) - i);
      continue;
    }
    if (c === '/' && fuente[i + 1] === '/') {
      const fin = fuente.indexOf('\n', i);
      avanzar((fin === -1 ? fuente.length : fin) - i);
      continue;
    }

    if (c === '{') {
      const encabezado = acumulado.trim().replace(/\s+/g, ' ');
      acumulado = '';
      if (encabezado) {
        const kind: SymbolKind = encabezado.startsWith('@media')
          ? 'consulta de medios'
          : /^@(keyframes|-\w+-keyframes)/.test(encabezado)
            ? 'animacion'
            : 'regla CSS';
        pila.push({ nombre: encabezado, kind, linea: inicioBloque });
      } else {
        pila.push({ nombre: '', kind: 'regla CSS', linea: inicioBloque });
      }
      avanzar();
      inicioBloque = linea;
      continue;
    }

    if (c === '}') {
      const bloque = pila.pop();
      // Los pasos de una animacion (from, to, 50%) no son reglas por su cuenta:
      // solo tienen sentido dentro de su @keyframes, que ya se lista entero.
      const dentroDeAnimacion = pila.some((b) => b.kind === 'animacion');
      if (bloque?.nombre && !dentroDeAnimacion) {
        const cuerpo = lineas.slice(bloque.linea - 1, linea).join('\n');
        // Las propiedades declaradas dan una idea de qué hace la regla.
        const props = [...cuerpo.matchAll(/(^|[;{])\s*([a-zA-Z-]+)\s*:/g)]
          .map((m) => m[2])
          .filter((p) => !p.startsWith('--'));
        const unicas = [...new Set(props)];
        const detalle = unicas.length
          ? `${unicas.length} propiedad(es): ${unicas.slice(0, 5).join(', ')}${unicas.length > 5 ? '...' : ''}`
          : undefined;
        anadir(bloque.nombre, bloque.kind, bloque.linea, linea, detalle);
      }
      avanzar();
      inicioBloque = linea;
      continue;
    }

    if (c === ';') {
      // Variables CSS de primer nivel: --color-fondo: #111;
      const decl = acumulado.trim();
      const variable = /^(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (variable && pila.length <= 1) {
        anadir(variable[1], 'variable CSS', linea, linea, `Valor: ${variable[2].trim().slice(0, 60)}`, decl);
      }
      acumulado = '';
      avanzar();
      inicioBloque = linea;
      continue;
    }

    // Los espacios anteriores al selector no se acumulan, y la linea del
    // bloque se fija en su PRIMER caracter real. Si no, un selector que
    // empieza en la linea siguiente al cierre del anterior heredaba su linea,
    // y con ella un fragmento de codigo equivocado.
    if (!acumulado.trim()) {
      if (/\s/.test(c)) {
        avanzar();
        continue;
      }
      inicioBloque = linea;
    }
    acumulado += c;
    avanzar();
  }

  return simbolos;
}
