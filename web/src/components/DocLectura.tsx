import { useMemo } from 'react';
import { useStore } from '../state/useStore';
import { panelDe } from '../lib/types';
import { DocView } from './DocView';
import { Icon } from './Icon';
import { DocArchivoBarra } from './DocArchivoBarra';

/**
 * Leer la documentación sin buscarla.
 *
 * Antes, documentar algo y volver a leerlo eran dos mundos distintos: la
 * documentación quedaba guardada pero para verla había que abrir el centro de
 * documentación, entrar en su sección, encontrar el elemento y desplegarlo.
 * Cuatro pasos y saber dónde mirar. En la práctica, nadie la leía.
 *
 * Aquí está donde se necesita: al lado del código, con lo documentado del
 * archivo que tienes abierto, y con un vistazo directo a lo que hayas elegido
 * en el panel de elementos.
 */
export function DocLectura() {
  const approved = useStore((s) => s.approved);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const statusOf = useStore((s) => s.statusOf);
  const goToSymbol = useStore((s) => s.goToSymbol);
  const generateDoc = useStore((s) => s.generateDoc);
  const generating = useStore((s) => s.generating);
  const seleccionado = useStore((s) => s.symbolSeleccionado);
  const setSeleccionado = useStore((s) => s.setSymbolSeleccionado);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);

  const activa = tabs.find((t) => t.id === activeTabId);
  const rutaActiva = activa?.kind === 'file' ? activa.path : null;

  const todos = useMemo(() => symbolsFn(), [symbolsFn, analysis]);

  /** Lo documentado del archivo abierto: es lo que uno quiere leer ahora. */
  const delArchivo = useMemo(
    () => todos.filter((s) => s.filePath === rutaActiva && approved[s.id]),
    [todos, rutaActiva, approved],
  );

  const elegido = useMemo(
    () => todos.find((s) => s.id === seleccionado && approved[s.id]) ?? delArchivo[0] ?? null,
    [todos, seleccionado, approved, delArchivo],
  );

  const doc = elegido ? approved[elegido.id] : null;
  const totalDocumentado = Object.keys(approved).length;

  if (!doc) {
    return (
      <div className="doc-lectura">
        <DocArchivoBarra />
        <div className="empty" style={{ height: 'auto', paddingTop: 30 }}>
          <Icon name="docs" size={22} />
          <h3>Nada documentado que leer aquí</h3>
          <p>
            {rutaActiva
              ? <>Ningún elemento de <code>{rutaActiva.split('/').pop()}</code> tiene documentación aprobada todavía.</>
              : 'Abre un archivo para ver su documentación.'}
          </p>
          <p className="hint">
            En el panel de elementos, pulsa <strong>Documentar</strong> en lo que quieras entender. La propuesta
            aparece en <strong>Revisión</strong> y solo es oficial cuando tú la apruebas.
          </p>
          {totalDocumentado > 0 && (
            <button className="btn sm outline" onClick={() => setDocCenterOpen(true)}>
              <Icon name="docs" size={12} /> Ver los {totalDocumentado} documentados del proyecto
            </button>
          )}
        </div>
      </div>
    );
  }

  const estado = statusOf(elegido!);

  return (
    <div className="doc-lectura">
      <DocArchivoBarra />
      {delArchivo.length > 1 && (
        <div className="doc-lectura-lista">
          {delArchivo.map((s) => (
            <button
              key={s.id}
              className={`mode-chip ${s.id === elegido!.id ? 'active' : ''}`}
              onClick={() => setSeleccionado(s.id)}
              title={`${s.kind} · línea ${s.line}`}
            >
              {s.qualifiedName}
            </button>
          ))}
        </div>
      )}

      <div className="doc-lectura-cabecera">
        <span className={`tag ${estado === 'revisar' ? 'warn' : 'ok'}`}>
          {estado === 'revisar' ? 'El código cambió' : 'Al día'}
        </span>
        <span className="meta">{elegido!.filePath} · línea {elegido!.line}</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" onClick={() => void goToSymbol(elegido!)}>
          <Icon name="link" size={12} /> Ir al código
        </button>
      </div>

      {estado === 'revisar' && (
        <div className="review-banner" style={{ marginBottom: 10 }}>
          Esta explicación se aprobó para una versión anterior del código. Sigue aquí porque borrarla sería
          perder trabajo, pero conviene revisarla.
          <div style={{ marginTop: 6 }}>
            <button className="btn sm primary" disabled={generating} onClick={() => void generateDoc(elegido!)}>
              {generating ? <span className="spinner" /> : <Icon name="brain" size={12} />} Pedir una nueva
            </button>
          </div>
        </div>
      )}

      <div className="doc-lectura-cuerpo">
        <DocView doc={doc.doc} kind={doc.kind} />
      </div>

      <p className="hint" style={{ padding: '8px 0 0' }}>
        Aprobada el {new Date(doc.approvedAt).toLocaleString('es')}
        {doc.model ? ` · ${doc.model}` : ''}{doc.edited ? ' · editada por ti' : ''}
      </p>
    </div>
  );
}

/** El número de elementos documentados del archivo abierto, para la pestaña. */
export function useDocumentadosDelArchivo() {
  const approved = useStore((s) => s.approved);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);

  const activa = tabs.find((t) => t.id === activeTabId);
  const ruta = activa?.kind === 'file' ? activa.path : null;

  return useMemo(
    () => (ruta ? symbolsFn().filter((s) => s.filePath === ruta && approved[s.id]).length : 0),
    [symbolsFn, analysis, approved, ruta],
  );
}

/** Cuál es la mitad activa, por si hace falta al abrir código desde aquí. */
export const mitadDe = panelDe;
