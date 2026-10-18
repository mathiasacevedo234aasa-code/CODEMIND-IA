import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { avisosDoc } from '../lib/calidadDoc';
import { ask } from '../lib/dialogs';
import type { ApprovedDoc, FunctionDoc } from '../lib/types';

const hace = (iso: string) => {
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
};

/** Avisos sin IA de textos cortos o vagos. */
export function AvisosCalidad({ doc }: { doc: FunctionDoc }) {
  const avisos = avisosDoc(doc);
  if (!avisos.length) return null;
  return (
    <div className="review-banner" style={{ borderColor: 'var(--warn)', margin: '8px 0' }}>
      <strong>{avisos.length} aviso(s) de calidad</strong> (no impiden aprobar):
      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
        {avisos.map((a, i) => <li key={i}><em>{a.campo}</em>: {a.mensaje}</li>)}
      </ul>
    </div>
  );
}

/** 👍 / 👎: lo que digas en 👎 se le pasa a la IA en las siguientes. */
export function Valorar({ functionId }: { functionId: string }) {
  const project = useStore((s) => s.project);
  const [hecho, setHecho] = useState<string | null>(null);
  if (!project) return null;
  const votar = async (voto: 'bien' | 'mal') => {
    let nota = '';
    if (voto === 'mal') {
      // window.prompt no existe en la aplicación de escritorio: diálogo propio.
      const r = await ask({
        title: '¿Qué falló?',
        label: 'Opcional. Se le dirá a la IA en las siguientes documentaciones de este proyecto.',
        placeholder: 'Demasiado larga, no explica qué devuelve...',
        confirmText: 'Enviar',
        allowEmpty: true,
      });
      if (r === null) return;
      nota = r;
    }
    await api.valorar(project.id, { functionId, voto, nota });
    setHecho(voto === 'bien' ? 'Gracias: anotado.' : 'Anotado: se tendrá en cuenta en las siguientes.');
  };
  if (hecho) return <span className="hint">{hecho}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 4 }} title="Tu valoración ajusta las siguientes documentaciones de este proyecto">
      <button className="btn sm outline" onClick={() => void votar('bien')}>👍</button>
      <button className="btn sm outline" onClick={() => void votar('mal')}>👎</button>
    </span>
  );
}

/** Revisión de una documentación aprobada: cuándo, marcar revisada y revisión por IA. */
export function RevisionDoc({ doc, codigoActual }: { doc: ApprovedDoc; codigoActual?: string }) {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const [revision, setRevision] = useState<{ observaciones: { campo: string; tipo: string; detalle: string }[]; veredicto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!project) return null;

  const revisarIA = async () => {
    setOcupado(true);
    try {
      setRevision(await api.revisionIA(project.id, doc.functionId, codigoActual));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const marcar = async () => {
    const { approved } = await api.marcarRevisada(project.id, doc.functionId);
    useStore.setState({ approved });
  };

  return (
    <div className="revision-doc">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="hint">
          Aprobada {hace(doc.approvedAt)}{doc.revisadaEn ? ` · revisada ${hace(doc.revisadaEn)}` : ' · nunca revisada'}
        </span>
        <span style={{ flex: 1 }} />
        <Valorar functionId={doc.functionId} />
        <button className="btn sm outline" onClick={() => void marcar()} title="Confirmas que la has leído y sigue siendo correcta">
          Marcar revisada
        </button>
        <button className="btn sm outline" disabled={ocupado} onClick={() => void revisarIA()} title="La IA la compara con el código actual. Solo observa: no cambia nada.">
          {ocupado ? <span className="spinner" /> : null} Revisar con IA
        </button>
      </div>
      <AvisosCalidad doc={doc.doc} />
      {revision && (
        <div className="card" style={{ marginTop: 8 }}>
          <h4>Revisión de la IA (no cambia nada)</h4>
          {revision.veredicto && <p>{revision.veredicto}</p>}
          {revision.observaciones.length === 0
            ? <p className="hint">Sin observaciones.</p>
            : (
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                {revision.observaciones.map((o, i) => (
                  <li key={i}><span className={`tag ${o.tipo === 'incorrecto' ? 'warn' : 'muted'}`}>{o.tipo}</span> <em>{o.campo}</em>: {o.detalle}</li>
                ))}
              </ul>
            )}
          <p className="hint">Si quieres una versión corregida, pide una nueva: llegará a Revisión.</p>
          <button className="btn sm outline" onClick={() => setRevision(null)}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
