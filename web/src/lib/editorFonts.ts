/**
 * Tipografías disponibles para el editor.
 *
 * No se descarga ninguna fuente: se ofrecen pilas que terminan siempre en una
 * fuente monoespaciada del sistema, así que si la primera no está instalada el
 * editor sigue viéndose bien en lugar de caer en una fuente proporcional.
 *
 * `ligatures` indica si esa familia tiene ligaduras de programación (las que
 * unen `=>` o `!==` en un solo glifo). Si no las tiene, activarlas no rompe
 * nada, simplemente no se nota, y la interfaz lo avisa.
 */
export interface FontStack {
  id: string;
  label: string;
  stack: string;
  ligatures: boolean;
  note?: string;
}

const FALLBACK = 'Consolas, "Courier New", monospace';

export const FONT_STACKS: FontStack[] = [
  {
    id: 'default',
    label: 'Predeterminada del sistema',
    stack: `ui-monospace, "Cascadia Mono", ${FALLBACK}`,
    ligatures: false,
  },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    stack: `"Cascadia Code", "Cascadia Mono", ${FALLBACK}`,
    ligatures: true,
    note: 'Viene con Windows Terminal y Visual Studio.',
  },
  {
    id: 'consolas',
    label: 'Consolas',
    stack: `Consolas, ${FALLBACK}`,
    ligatures: false,
    note: 'Instalada en todos los Windows.',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack: `"JetBrains Mono", ${FALLBACK}`,
    ligatures: true,
    note: 'Hay que instalarla aparte.',
  },
  {
    id: 'fira',
    label: 'Fira Code',
    stack: `"Fira Code", ${FALLBACK}`,
    ligatures: true,
    note: 'Hay que instalarla aparte.',
  },
  {
    id: 'courier',
    label: 'Courier New',
    stack: `"Courier New", monospace`,
    ligatures: false,
    note: 'Clásica, con trazo fino.',
  },
];

export const fontStackOf = (id: string): FontStack =>
  FONT_STACKS.find((f) => f.id === id) ?? FONT_STACKS[0];

/**
 * Comprueba si una familia está realmente instalada, midiendo el ancho de un
 * texto con esa fuente y comparándolo con el de una fuente de referencia. Si
 * coinciden exactamente, el navegador ha usado la de reserva.
 */
export function isFontAvailable(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return false;

  const sample = 'mmmmmmmmmmlliWWWW0123456789';
  const measure = (font: string) => {
    context.font = `72px ${font}`;
    return context.measureText(sample).width;
  };

  // monospace siempre existe; si el ancho cambia, la familia pedida se aplicó.
  const base = measure('monospace');
  return measure(`"${family}", monospace`) !== base;
}
