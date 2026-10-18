import type { DetectedSymbol, SymbolCategory } from './types';

/**
 * Mapa del proyecto: qué archivo depende de cuál.
 *
 * Responde a la pregunta con la que nació CodeMind AI: "¿qué estoy
 * construyendo?". Un listado de funciones no lo cuenta; un mapa de quién llama
 * a quién, sí.
 *
 * Las aristas salen de hechos comprobables —los `import`, los `<script src>`,
 * los `<link href>` y los `@import`—, nunca de suposiciones. Lo que no se
 * puede resolver se marca como externo en lugar de inventar un destino.
 */

export interface NodoMapa {
  path: string;
  /** Carpeta a la que pertenece, para agrupar visualmente. */
  carpeta: string;
  simbolos: number;
  documentados: number;
  categoria: SymbolCategory;
  /** Cuántos archivos dependen de este. */
  entrantes: number;
  /** De cuántos archivos depende este. */
  salientes: number;
  externo: boolean;
}

export interface AristaMapa {
  desde: string;
  hasta: string;
  /** Especificador original, tal y como aparece escrito en el código. */
  via: string;
  /** import('x'): se carga cuando hace falta. Se dibuja punteada. */
  dinamica?: boolean;
}

export interface MapaProyecto {
  nodos: NodoMapa[];
  aristas: AristaMapa[];
  /** Archivos que nadie importa y que no son puntos de entrada evidentes. */
  sinEntradas: string[];
  /** Ciclos de dependencias, cada uno como la lista de archivos implicados. */
  ciclos: string[][];
  /** Los archivos de los que más cosas dependen. */
  masUsados: { path: string; entrantes: number }[];
  externos: string[];
}

const EXTENSIONES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss', '.json'];
const INDICES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

const normalizar = (ruta: string) => ruta.replace(/\\/g, '/');

/** Une un especificador a una carpeta base, resolviendo los . y los .. */
function unir(base: string, especificador: string): string {
  const partes = especificador.startsWith('/')
    ? especificador.slice(1).split('/')
    : [...base.split('/').filter(Boolean), ...especificador.split('/')];

  const pila: string[] = [];
  for (const parte of partes) {
    if (parte === '.' || parte === '') continue;
    if (parte === '..') pila.pop();
    else pila.push(parte);
  }
  return pila.join('/');
}

/** Prueba las extensiones y los index habituales sobre una ruta candidata. */
function primeroQueExista(candidato: string, existentes: Set<string>): string | null {
  if (!candidato) return null;
  for (const ext of EXTENSIONES) {
    if (existentes.has(candidato + ext)) return candidato + ext;
  }
  for (const indice of INDICES) {
    if (existentes.has(`${candidato}/${indice}`)) return `${candidato}/${indice}`;
  }
  return null;
}

/**
 * Resuelve un especificador contra los archivos que existen de verdad.
 *
 * Primero se intenta como ruta del proyecto y solo si no existe se considera
 * externo. Hace falta porque las reglas no son iguales en todos los lenguajes:
 * en JavaScript `utilidades` es un paquete, pero en un `<link href>` o en un
 * `@import` de CSS esa misma cadena es un archivo de al lado.
 */
function resolver(desde: string, especificador: string, existentes: Set<string>): string | null {
  const limpio = normalizar(especificador).split('?')[0].split('#')[0];
  if (!limpio || /^(https?:)?\/\//.test(limpio) || limpio.startsWith('data:')) return null;

  const base = desde.includes('/') ? desde.slice(0, desde.lastIndexOf('/')) : '';

  // Relativo al archivo que lo escribe, que es el caso habitual.
  const relativo = primeroQueExista(unir(base, limpio), existentes);
  if (relativo) return relativo;

  // Y, por si acaso, relativo a la raíz del proyecto.
  return primeroQueExista(unir('', limpio), existentes);
}

/** Un especificador es externo si no se resuelve y parece el nombre de un paquete. */
function pareceExterno(especificador: string): boolean {
  const limpio = normalizar(especificador);
  if (limpio.startsWith('.') || limpio.startsWith('/')) return false;
  if (/^(https?:)?\/\//.test(limpio) || limpio.startsWith('data:')) return false;
  // "estilos.css" sin resolver es un archivo que falta, no un paquete de npm.
  return !/\.(css|scss|less|html?|png|jpe?g|svg|gif|webp|ico|woff2?)$/i.test(limpio);
}

/** Categoría predominante de un archivo, para darle color en el mapa. */
function categoriaDe(simbolos: DetectedSymbol[]): SymbolCategory {
  if (!simbolos.length) return 'codigo';
  const cuenta: Record<string, number> = {};
  for (const s of simbolos) cuenta[s.category] = (cuenta[s.category] ?? 0) + 1;
  return Object.entries(cuenta).sort(([, a], [, b]) => b - a)[0][0] as SymbolCategory;
}

/** Puntos de entrada tipicos: que no los importe nadie es lo normal. */
const ES_ENTRADA = /(^|\/)(index|main|app|server)\.(html?|[jt]sx?|mjs)$|\.html?$/i;

export function construirMapa(
  analysis: Record<string, { symbols: DetectedSymbol[]; imports: string[]; importsDinamicos?: string[] }>,
  documentados: Set<string>,
): MapaProyecto {
  const rutas = Object.keys(analysis);
  const existentes = new Set(rutas);

  const aristas: AristaMapa[] = [];
  const externos = new Set<string>();
  const entrantes = new Map<string, number>();
  const salientes = new Map<string, number>();

  for (const ruta of rutas) {
    const todos = [
      ...analysis[ruta].imports.map((e) => ({ e, dinamica: false })),
      ...(analysis[ruta].importsDinamicos ?? []).map((e) => ({ e, dinamica: true })),
    ];
    for (const { e: especificador, dinamica } of todos) {
      const destino = resolver(ruta, especificador, existentes);
      if (!destino) {
        // No es un archivo del proyecto. Puede ser un paquete externo o un
        // enlace roto; solo se anota como externo lo que parece un paquete.
        if (pareceExterno(especificador)) {
          // Los paquetes con ámbito (@scope/nombre) llevan dos segmentos.
          const limpio = normalizar(especificador);
          externos.add(limpio.startsWith('@') ? limpio.split('/').slice(0, 2).join('/') : limpio.split('/')[0]);
        }
        continue;
      }
      if (destino === ruta) continue; // un archivo que se importa a sí mismo no aporta nada
      if (aristas.some((a) => a.desde === ruta && a.hasta === destino)) continue;

      aristas.push({ desde: ruta, hasta: destino, via: especificador, ...(dinamica ? { dinamica: true } : {}) });
      entrantes.set(destino, (entrantes.get(destino) ?? 0) + 1);
      salientes.set(ruta, (salientes.get(ruta) ?? 0) + 1);
    }
  }

  const nodos: NodoMapa[] = rutas.map((ruta) => {
    const simbolos = analysis[ruta].symbols;
    return {
      path: ruta,
      carpeta: ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/')) : '(raíz)',
      simbolos: simbolos.length,
      documentados: simbolos.filter((s) => documentados.has(s.id)).length,
      categoria: categoriaDe(simbolos),
      entrantes: entrantes.get(ruta) ?? 0,
      salientes: salientes.get(ruta) ?? 0,
      externo: false,
    };
  });

  const sinEntradas = nodos
    .filter((n) => n.entrantes === 0 && !ES_ENTRADA.test(n.path))
    .map((n) => n.path)
    .sort();

  return {
    nodos,
    aristas,
    sinEntradas,
    ciclos: detectarCiclos(rutas, aristas),
    masUsados: nodos
      .filter((n) => n.entrantes > 0)
      .sort((a, b) => b.entrantes - a.entrantes)
      .slice(0, 5)
      .map((n) => ({ path: n.path, entrantes: n.entrantes })),
    externos: [...externos].sort(),
  };
}

/**
 * Busca ciclos con un recorrido en profundidad. Un ciclo no es un error por sí
 * mismo, pero saber que existe explica muchos comportamientos raros.
 */
function detectarCiclos(rutas: string[], aristas: AristaMapa[]): string[][] {
  const vecinos = new Map<string, string[]>();
  for (const a of aristas) {
    if (!vecinos.has(a.desde)) vecinos.set(a.desde, []);
    vecinos.get(a.desde)!.push(a.hasta);
  }

  const ciclos: string[][] = [];
  const vistos = new Set<string>();
  const enPila = new Set<string>();
  const pila: string[] = [];

  const recorrer = (nodo: string) => {
    if (enPila.has(nodo)) {
      const inicio = pila.indexOf(nodo);
      if (inicio !== -1) {
        const ciclo = pila.slice(inicio);
        // Se guarda una sola vez cada ciclo, sin importar por dónde se entró.
        const firma = [...ciclo].sort().join('|');
        if (!ciclos.some((c) => [...c].sort().join('|') === firma)) ciclos.push(ciclo);
      }
      return;
    }
    if (vistos.has(nodo)) return;

    vistos.add(nodo);
    enPila.add(nodo);
    pila.push(nodo);
    for (const siguiente of vecinos.get(nodo) ?? []) recorrer(siguiente);
    pila.pop();
    enPila.delete(nodo);
  };

  for (const ruta of rutas) recorrer(ruta);
  return ciclos;
}

// ------------------------------------------------------------- disposicion

export interface Posicion {
  path: string;
  x: number;
  y: number;
}

/**
 * Coloca los nodos con una simulación de fuerzas sencilla: los unidos se
 * atraen, todos se repelen. Se calcula de una vez, sin animación, porque lo
 * que importa es leer el mapa, no verlo moverse.
 */
export function calcularPosiciones(mapa: MapaProyecto, ancho: number, alto: number): Posicion[] {
  const n = mapa.nodos.length;
  if (!n) return [];

  const indice = new Map(mapa.nodos.map((nodo, i) => [nodo.path, i]));
  const x = new Float64Array(n);
  const y = new Float64Array(n);

  // Posición inicial en círculo: converge mejor que empezar al azar, y además
  // es reproducible, así que el mapa no cambia de forma en cada apertura.
  const radio = Math.min(ancho, alto) * 0.35;
  for (let i = 0; i < n; i++) {
    const angulo = (i / n) * Math.PI * 2;
    x[i] = ancho / 2 + Math.cos(angulo) * radio;
    y[i] = alto / 2 + Math.sin(angulo) * radio;
  }

  const enlaces = mapa.aristas
    .map((a) => [indice.get(a.desde), indice.get(a.hasta)])
    .filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined);

  const REPULSION = 9000;
  const LONGITUD = 110;
  const ITERACIONES = 260;

  for (let paso = 0; paso < ITERACIONES; paso++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[i] - x[j];
        let dy = y[i] - y[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i - j) || 1; dy = 1; d2 = 2; }
        const fuerza = REPULSION / d2;
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * fuerza; fy[i] += (dy / d) * fuerza;
        fx[j] -= (dx / d) * fuerza; fy[j] -= (dy / d) * fuerza;
      }
    }

    for (const [a, b] of enlaces) {
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const fuerza = (d - LONGITUD) * 0.06;
      fx[a] += (dx / d) * fuerza; fy[a] += (dy / d) * fuerza;
      fx[b] -= (dx / d) * fuerza; fy[b] -= (dy / d) * fuerza;
    }

    // Enfriamiento: los primeros pasos mueven mucho, los últimos afinan.
    const temperatura = 1 - paso / ITERACIONES;
    for (let i = 0; i < n; i++) {
      x[i] += Math.max(-24, Math.min(24, fx[i])) * temperatura;
      y[i] += Math.max(-24, Math.min(24, fy[i])) * temperatura;
      // Atracción suave al centro, para que nada se escape del lienzo.
      x[i] += (ancho / 2 - x[i]) * 0.006;
      y[i] += (alto / 2 - y[i]) * 0.006;
      x[i] = Math.max(40, Math.min(ancho - 40, x[i]));
      y[i] = Math.max(30, Math.min(alto - 30, y[i]));
    }
  }

  return mapa.nodos.map((nodo, i) => ({ path: nodo.path, x: x[i], y: y[i] }));
}
