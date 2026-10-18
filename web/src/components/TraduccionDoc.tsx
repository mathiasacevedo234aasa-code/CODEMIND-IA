import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { ApprovedDoc, FunctionDoc } from '../lib/types';
import { DocView } from './DocView';

/**
 * Versión bilingüe de una documentación aprobada.
 *
 * La IA traduce (mismos campos, nombres de código intactos), tú la lees y
 * decides si se guarda. Una traducción hecha para una versión anterior de la
 * documentación se marca como vieja y no entra en la exportación.
 */
export function TraduccionDoc({ doc }: { doc: ApprovedDoc }) {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const idiomaApp = useStore((s) => s.settings.idioma ?? 'es');
  const idioma: 'es' | 'en' = (project?.idiomaDoc ?? idiomaApp) === 'en' ? 'es' : 'en';
  const nombre = idioma === 'en' ? 'inglés' : 'español';
  const guardada = doc.traducciones?.[idioma];
  const vigente = guardada && guardada.de === doc.versionId;

  const [ver, setVer] = useState(false);
  const [borrador, setBorrador] = useState<FunctionDoc | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const traducir = async () => {
    if (!project) return;
    setOcupado(true);
    try {
      const r = await api.traducirDoc(project.id, doc.functionId, idioma);
      setBorrador(r.doc);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async () => {
    if (!project || !borrador) return;
    const { approved } = await api.guardarTraduccion(project.id, doc.functionId, idioma, borrador);
    useStore.setState({ approved });
    setBorrador(null);
    setVer(true);
  };

  return (
    <div className="traduccion">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="hint">Versión en {nombre}:</span>
        {vigente && (
          <button className="btn sm outline" onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar' : 'Ver'}</button>
        )}
        {guardada && !vigente && <span className="tag warn" title="Se tradujo una versión anterior de esta documentación">vieja</span>}
        <button className="btn sm outline" disabled={ocupado} onClick={() => void traducir()}>
          {ocupado ? <span className="spinner" /> : null} {guardada ? 'Volver a traducir' : 'Traducir'}
        </button>
      </div>
      {borrador && (
        <div className="card" style={{ marginTop: 8, borderColor: 'var(--accent)' }}>
          <h4>Traducción propuesta (sin guardar)</h4>
          <DocView doc={borrador} kind={doc.kind} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn sm primary" onClick={() => void guardar()}>Guardar traducción</button>
            <button className="btn sm outline" onClick={() => setBorrador(null)}>Descartar</button>
          </div>
        </div>
      )}
      {ver && vigente && !borrador && (
        <div className="card" style={{ marginTop: 8 }}>
          <DocView doc={guardada.doc} kind={doc.kind} />
        </div>
      )}
    </div>
  );
}
