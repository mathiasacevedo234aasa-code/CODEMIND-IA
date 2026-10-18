import { useStore } from '../state/useStore';

/**
 * Atrás / adelante entre los sitios donde has estado (Alt+← / Alt+→), como en
 * un navegador. Se apunta un sitio cada vez que saltas: cambiar de archivo,
 * ir a una definición, a un resultado de búsqueda, a un marcador...
 */
type Sitio = { path: string; line: number };
const atras: Sitio[] = [];
const adelante: Sitio[] = [];
let navegando = false;

const igual = (a?: Sitio, b?: Sitio) => a && b && a.path === b.path && a.line === b.line;

function apuntar(s: Sitio | null | undefined) {
  if (navegando || !s) return;
  if (igual(atras[atras.length - 1], s)) return;
  atras.push(s);
  if (atras.length > 100) atras.shift();
  adelante.length = 0;
}

/** Se engancha a la tienda: cada salto apunta el sitio de donde se venía. */
export function activarNavegacion() {
  return useStore.subscribe((s, prev) => {
    // Donde estaba el cursor; si en ese archivo no se llegó a poner, su línea 1.
    const tabPrevia = prev.tabs.find((t) => t.id === prev.activeTabId);
    const rutaPrevia = tabPrevia?.kind === 'file' ? tabPrevia.path : null;
    const desde = prev.cursor && prev.cursor.path === rutaPrevia
      ? { path: prev.cursor.path, line: prev.cursor.line }
      : rutaPrevia ? { path: rutaPrevia, line: 1 } : null;
    if (s.activeTabId !== prev.activeTabId || (s.jumpTo && s.jumpTo !== prev.jumpTo)) apuntar(desde);
  });
}

async function ir(s: Sitio) {
  navegando = true;
  try {
    const st = useStore.getState();
    await st.openFile(s.path);
    st.jumpToLine(s.path, s.line);
  } finally {
    setTimeout(() => { navegando = false; }, 100);
  }
}

function aquí(): Sitio | null {
  const st = useStore.getState();
  const tab = st.tabs.find((t) => t.id === st.activeTabId);
  const ruta = tab?.kind === 'file' ? tab.path : null;
  if (!ruta) return null;
  return st.cursor?.path === ruta ? { path: ruta, line: st.cursor.line } : { path: ruta, line: 1 };
}

export function volverAtras() {
  const s = atras.pop();
  if (!s) return;
  const a = aquí();
  if (a) adelante.push(a);
  void ir(s);
}

export function irAdelante() {
  const s = adelante.pop();
  if (!s) return;
  const a = aquí();
  if (a) atras.push(a);
  void ir(s);
}
