import type { DetectedSymbol } from './types';

/**
 * Detección de código que nadie usa.
 *
 * Busca cada nombre declarado en el resto del proyecto. Es una heurística
 * honesta, no un analizador de alcances: por eso el resultado se presenta
 * siempre como "posible", con el motivo por el que se sospecha y los avisos
 * de cuándo puede equivocarse.
 *
 * Nunca borra nada ni lo propone: solo señala dónde mirar.
 */

export interface Huerfano {
  symbol: DetectedSymbol;
  /** Veces que aparece el nombre fuera de su propia declaración. */
  usos: number;
  motivo: string;
  /** false cuando hay razones para dudar del veredicto. */
  fiable: boolean;
  aviso?: string;
}

/** Tipos a los que tiene sentido buscarles uso. */
const ANALIZABLES = new Set([
  'funcion', 'funcion flecha', 'expresion de funcion', 'clase', 'interfaz',
  'tipo', 'enumeracion', 'constante', 'hook personalizado', 'componente React',
  'variable CSS',
]);

/** Nombres que se llaman solos o desde fuera del código. */
const PUNTOS_DE_ENTRADA = /^(main|init|inicializar|setup|start|arrancar|default|constructor|render|App)$/i;

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function detectarHuerfanos(
  symbols: DetectedSymbol[],
  contenidos: Record<string, string>,
): Huerfano[] {
  const huerfanos: Huerfano[] = [];

  // Un nombre repetido en varios sitios no se puede juzgar solo por el texto.
  const repetidos = new Set<string>();
  const vistos = new Set<string>();
  for (const s of symbols) {
    if (vistos.has(s.name)) repetidos.add(s.name);
    vistos.add(s.name);
  }

  for (const symbol of symbols) {
    if (!ANALIZABLES.has(symbol.kind)) continue;
    if (symbol.name.length < 3) continue;           // nombres de una letra dan demasiados falsos
    if (PUNTOS_DE_ENTRADA.test(symbol.name)) continue;

    const patron = symbol.kind === 'variable CSS'
      ? new RegExp(`var\\(\\s*${escapar(symbol.name)}\\s*[,)]`, 'g')
      : new RegExp(`\\b${escapar(symbol.name)}\\b`, 'g');

    let usos = 0;
    let usadoFuera = false;

    for (const [ruta, texto] of Object.entries(contenidos)) {
      patron.lastIndex = 0;
      const apariciones = (texto.match(patron) ?? []).length;
      if (!apariciones) continue;

      if (ruta === symbol.filePath) {
        // En su propio archivo, una de las apariciones es la declaración.
        const lineas = texto.split('\n').slice(symbol.line - 1, symbol.endLine).join('\n');
        patron.lastIndex = 0;
        const propias = (lineas.match(patron) ?? []).length;
        usos += Math.max(0, apariciones - propias);
      } else {
        usos += apariciones;
        usadoFuera = true;
      }
    }

    if (usos > 0) continue;

    const exportado = /^\s*export\s/m.test(symbol.code);
    const esCss = symbol.kind === 'variable CSS';

    huerfanos.push({
      symbol,
      usos,
      motivo: usadoFuera
        ? 'Solo aparece en su propia declaración'
        : `No se encontró ningún uso de "${symbol.name}" en el proyecto`,
      fiable: !exportado && !repetidos.has(symbol.name),
      aviso: exportado
        ? 'Está exportado: puede usarse desde fuera del proyecto, así que quizá no sobre.'
        : repetidos.has(symbol.name)
          ? 'Hay varios elementos con este nombre: el recuento puede no ser exacto.'
          : esCss
            ? 'Las variables CSS también pueden usarse desde JavaScript o desde el HTML.'
            : undefined,
    });
  }

  return huerfanos.sort((a, b) => Number(b.fiable) - Number(a.fiable) || a.symbol.filePath.localeCompare(b.symbol.filePath));
}
