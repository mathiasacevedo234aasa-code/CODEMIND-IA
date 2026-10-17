import { useMemo } from 'react';
import { useStore } from '../state/useStore';
import { useCobertura } from '../lib/useCobertura';
import { tonoDe } from '../lib/cobertura';
import { Icon } from './Icon';

/**
 * Cabecera de la documentación del archivo abierto.
 *
 * Dice cuánto está documentado, deja documentar todo lo que falta de una vez
 * y, mientras eso ocurre, enseña por dónde va. Documentar en lote no aprueba
 * nada: cada propuesta acaba en Revisión como siempre.
 */
export function DocArchivoBarra() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const cola = useStore((s) => s.colaDoc);
  const documentarArchivo = useStore((s) => s.documentarArchivo);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const proveedorNombre = useStore((s) => s.proveedorNombre);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const proposals = useStore((s) => s.proposals);
  const { porArchivo } = useCobertura();

  const activa = tabs.find((t) => t.id === activeTabId);
  const ruta = activa?.kind === 'file' ? activa.path : null;
  const cob = ruta ? porArchivo[ruta] : undefined;

  const pendientes = useMemo(
    () => (ruta
      ? symbolsFn().filter((x) => x.filePath === ruta && !x.menor && !approved[x.id]
          && !proposals.some((p) => p.functionId === x.id)).length
      : 0),
    [ruta, symbolsFn, analysis, approved, proposals], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Mientras hay una cola de un archivo en marcha, se enseña aunque sea de
  // otro. La de una carpeta tiene su propia tarjeta flotante.
  if (cola?.activa && !cola.carpeta) return <div className="doc-barra"><ProgresoCola /></div>;

  if (!ruta || !cob || cob.total === 0) return null;

  return (
    <div className="doc-barra">
      <div className="doc-barra-fila">
        <strong>{cob.porcentaje}% documentado</strong>
        <span className="meta">
          {cob.alDia + cob.revisar} de {cob.total}{cob.revisar ? ` · ${cob.revisar} por revisar` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {pendientes > 0 && (
          <button
            className="btn sm primary"
            disabled={!apiKeyConfigured}
            title={apiKeyConfigured
              ? 'Genera una propuesta para cada elemento sin documentar. Todas quedan en Revisión: no se aprueba nada solo.'
              : `Configura ${proveedorNombre} primero`}
            onClick={() => void documentarArchivo(ruta)}
          >
            <Icon name="brain" size={12} /> Documentar los {pendientes} que faltan
          </button>
        )}
      </div>
      <div className={`barra-cobertura ${tonoDe(cob) === 'warn' ? 'warn' : ''}`}>
        <span style={{ width: `${cob.porcentaje}%` }} />
      </div>
      {cola && !cola.activa && cola.ruta === ruta && cola.motivoParada && (
        <div className="review-banner" style={{ borderColor: 'var(--danger)' }}>
          <strong>Se paró antes de empezar de verdad.</strong> {cola.motivoParada}
          <div className="hint" style={{ marginTop: 4 }}>
            Es un error que se repetiría con todos los elementos, así que no se siguió intentando.
          </div>
        </div>
      )}
      {cola && !cola.activa && cola.ruta === ruta && !cola.motivoParada && cola.fallidos.length > 0 && (
        <details className="hint" style={{ marginTop: 6 }}>
          <summary>{cola.fallidos.length} no se pudieron generar</summary>
          {cola.fallidos.map((f) => <div key={f.nombre}><code>{f.nombre}</code>: {f.motivo}</div>)}
        </details>
      )}
    </div>
  );
}

/** Progreso de la cola en marcha, con pausa y cancelar. Sirve para archivo y carpeta. */
export function ProgresoCola() {
  const cola = useStore((s) => s.colaDoc);
  const cancelar = useStore((s) => s.cancelarColaDoc);
  const pausar = useStore((s) => s.pausarColaDoc);
  if (!cola?.activa) return null;
  const pct = Math.round((cola.hechos / Math.max(1, cola.total)) * 100);
  const nombre = cola.carpeta ? (cola.ruta ? `${cola.ruta}/` : 'el proyecto entero') : cola.ruta.split('/').pop();
  return (
    <>
      <div className="doc-barra-fila">
        {cola.pausada ? <span className="tag warn">En pausa</span> : <span className="spinner" />}
        <strong>Documentando {nombre}</strong>
        <span className="meta">{cola.hechos} de {cola.total}</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn sm outline"
          disabled={cola.cancelada}
          title={cola.pausada ? 'Seguir con el siguiente' : 'Termina el que está en curso y espera'}
          onClick={() => pausar(!cola.pausada)}
        >
          {cola.pausada ? 'Reanudar' : 'Pausa'}
        </button>
        <button className="btn sm outline" disabled={cola.cancelada} onClick={cancelar}>
          {cola.cancelada ? 'Cancelando...' : 'Cancelar'}
        </button>
      </div>
      <div className="barra-cobertura"><span style={{ width: `${pct}%` }} /></div>
      {cola.actual && <p className="hint">{cola.pausada ? 'Termina: ' : 'Ahora: '}<code>{cola.actual}</code></p>}
      {cola.fallidos.length > 0 && <p className="hint" style={{ color: 'var(--warn)' }}>{cola.fallidos.length} sin generar hasta ahora.</p>}
    </>
  );
}

/** La cola de una carpeta dura mucho: una tarjeta que se ve desde cualquier vista. */
export function ColaCarpetaFlotante() {
  const cola = useStore((s) => s.colaDoc);
  if (!cola?.activa || !cola.carpeta) return null;
  return <div className="cola-flotante"><ProgresoCola /></div>;
}

/** Tras importar una carpeta: ofrecer un borrador de la descripción general. */
export function OfertaBorrador() {
  const id = useStore((s) => s.ofrecerBorrador);
  const project = useStore((s) => s.project);
  const setOfrecer = useStore((s) => s.setOfrecerBorrador);
  const setPedir = useStore((s) => s.setPedirBorradorAlAbrir);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);
  if (!id || project?.id !== id) return null;
  return (
    <div className="cola-flotante">
      <strong>Proyecto importado</strong>
      <p className="hint" style={{ margin: '4px 0 8px' }}>
        ¿Quieres que la IA proponga un borrador de la descripción general a partir del código? Lo revisas y decides qué guardar.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn sm primary" onClick={() => { setOfrecer(null); setPedir(true); setDocCenterOpen(true); }}>
          Proponer borrador
        </button>
        <button className="btn sm outline" onClick={() => setOfrecer(null)}>Ahora no</button>
      </div>
    </div>
  );
}
