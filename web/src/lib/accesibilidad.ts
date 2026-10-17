/**
 * Navegación por teclado en los paneles.
 *
 * Muchas filas pulsables (archivos del explorador, proyectos, cambios de Git,
 * problemas, pestañas...) son <div> con onClick: con el ratón funcionan, con
 * el teclado no se podía llegar a ellas. Aquí, sin tocar cada componente:
 *
 * - Se hacen enfocables con Tab (tabindex=0) y se anuncian como botón.
 * - Intro o Espacio las activan, como un botón de verdad.
 * - Flecha arriba/abajo pasa a la fila anterior/siguiente de la misma lista.
 */
const FILAS = [
  '.tree-row', '.project-row', '.git-row', '.commit-row', '.mapa-fila', '.conv-fila',
  '.problema.con-ruta', '.bottom-tab', '.tab', '.palette-item', '.stash-fila', '.plantilla',
].join(',');

function marcar(raiz: ParentNode) {
  raiz.querySelectorAll<HTMLElement>(FILAS).forEach((el) => {
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (!el.hasAttribute('role') && el.tagName !== 'BUTTON') el.setAttribute('role', 'button');
  });
}

export function activarNavegacionTeclado(): () => void {
  marcar(document);
  const observador = new MutationObserver(() => marcar(document));
  observador.observe(document.body, { childList: true, subtree: true });

  const alPulsar = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.matches?.(FILAS) || el.tagName === 'BUTTON') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      el.click();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // La siguiente fila del mismo tipo dentro del mismo panel.
      const clase = [...el.classList].find((c) => FILAS.includes(`.${c}`));
      const panel = el.closest('.panel, .modal, .bottom, .welcome, .editor-mitad') ?? document;
      const filas = [...panel.querySelectorAll<HTMLElement>(clase ? `.${clase}` : FILAS)].filter((f) => f.offsetParent !== null);
      const i = filas.indexOf(el);
      const destino = filas[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (destino) {
        e.preventDefault();
        destino.focus();
      }
    }
  };
  document.addEventListener('keydown', alPulsar);
  return () => {
    observador.disconnect();
    document.removeEventListener('keydown', alPulsar);
  };
}
