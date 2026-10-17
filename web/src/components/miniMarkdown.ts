/**
 * Markdown mínimo para enseñar el historial de versiones.
 *
 * No es un conversor completo ni pretende serlo: encabezados, negrita,
 * código, listas y párrafos, que es todo lo que usa CHANGELOG.md. Lo
 * importante es el orden: se escapa el HTML ANTES de dar formato, así que
 * nada del texto puede convertirse en una etiqueta de verdad.
 */
const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const enLinea = (t: string) =>
  escapar(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>');

export function marked(markdown: string): string {
  const salida: string[] = [];
  let parrafo: string[] = [];
  let lista: string[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length) salida.push(`<p>${enLinea(parrafo.join(' '))}</p>`);
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista.length) salida.push(`<ul>${lista.map((l) => `<li>${enLinea(l)}</li>`).join('')}</ul>`);
    lista = [];
  };

  for (const linea of markdown.split(/\r?\n/)) {
    const titulo = /^(#{1,4})\s+(.*)$/.exec(linea);
    if (titulo) {
      cerrarParrafo();
      cerrarLista();
      const n = Math.min(titulo[1].length + 1, 5);
      salida.push(`<h${n}>${enLinea(titulo[2])}</h${n}>`);
    } else if (/^\s*[-*]\s+/.test(linea)) {
      cerrarParrafo();
      lista.push(linea.replace(/^\s*[-*]\s+/, ''));
    } else if (/^\s{2,}\S/.test(linea) && lista.length) {
      // Continuación de un elemento de lista partido en varias líneas.
      lista[lista.length - 1] += ` ${linea.trim()}`;
    } else if (!linea.trim() || linea.trim() === '---') {
      cerrarParrafo();
      cerrarLista();
    } else {
      cerrarLista();
      parrafo.push(linea.trim());
    }
  }
  cerrarParrafo();
  cerrarLista();
  return salida.join('\n');
}
