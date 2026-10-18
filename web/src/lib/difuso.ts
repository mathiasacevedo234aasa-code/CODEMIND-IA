/**
 * Puntuación difusa: todas las letras en orden; mejor si son seguidas, si
 * están al principio o si empiezan palabra (las iniciales de calcularTotal o
 * de carrito_total). 0 = no encaja.
 */
export function puntuar(consulta: string, texto: string): number {
  if (!consulta) return 1;
  const q = consulta.toLowerCase();
  const t = texto.toLowerCase();
  const directo = t.indexOf(q);
  if (directo !== -1) return 1000 - directo * 2 - (t.length - q.length) * 0.1;
  let pos = 0;
  let puntos = 0;
  let racha = 0;
  for (const letra of q) {
    const i = t.indexOf(letra, pos);
    if (i === -1) return 0;
    racha = i === pos ? racha + 1 : 0;
    // Inicio de palabra: tras / . _ - o una mayúscula en camelCase.
    const inicio = i === 0 || '/._- '.includes(texto[i - 1]) || (texto[i] !== t[i] && texto[i - 1] === t[i - 1]);
    puntos += 10 + racha * 5 + (inicio ? 8 : 0) - (i - pos);
    pos = i + 1;
  }
  return Math.max(1, puntos);
}
