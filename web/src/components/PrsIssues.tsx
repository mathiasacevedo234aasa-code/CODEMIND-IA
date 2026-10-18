import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type PrsIssuesResultado } from '../lib/api';
import { Icon } from './Icon';

/**
 * Pull requests e issues abiertos del repositorio en GitHub, en lectura.
 * Para comentar, revisar o fusionar, el enlace lleva a GitHub.
 */
export function PrsIssues() {
  const project = useStore((s) => s.project);
  const [datos, setDatos] = useState<PrsIssuesResultado | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!project) return null;

  const cargar = async () => {
    setCargando(true);
    setFallo(null);
    try { setDatos(await api.prsIssues(project.id)); } catch (e) { setFallo((e as Error).message); } finally { setCargando(false); }
  };

  const Lista = ({ titulo, items, tipo }: { titulo: string; items: PrsIssuesResultado['prs']; tipo: string }) => (
    <>
      <p className="panel-title" style={{ marginTop: 10 }}>{titulo} ({items.length})</p>
      {!items.length && <p className="hint">Ninguno abierto.</p>}
      {items.map((x) => {
        const id = `${tipo}${x.numero}`;
        return (
          <div key={id} className="card" style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} onClick={() => setAbierto(abierto === id ? null : id)}>
              <Icon name={abierto === id ? 'chevronDown' : 'chevronRight'} size={11} />
              <strong>#{x.numero}</strong>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.titulo}</span>
              {x.borrador && <span className="tag muted">borrador</span>}
              {x.etiquetas.map((e) => <span key={e} className="tag info">{e}</span>)}
            </div>
            {abierto === id && (
              <>
                <p className="hint">
                  {x.autor} · {new Date(x.creado).toLocaleDateString()} · {x.comentarios} comentario(s)
                  {x.rama ? ` · ${x.rama} → ${x.haciaRama}` : ''}
                </p>
                <pre className="log-raw" style={{ maxHeight: 200, whiteSpace: 'pre-wrap' }}>{x.cuerpo || '(sin descripción)'}</pre>
                <a href={x.url} target="_blank" rel="noreferrer">Abrir en GitHub</a>
              </>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>Pull requests e issues {datos ? `· ${datos.repo}` : ''}</h4>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" disabled={cargando} onClick={() => void cargar()}>
          {cargando ? <span className="spinner" /> : <Icon name="refresh" size={12} />} {datos ? 'Actualizar' : 'Ver'}
        </button>
      </div>
      <p className="hint">Solo lectura: para comentar, revisar o fusionar, abre cada uno en GitHub.</p>
      {fallo && <p className="hint" style={{ color: 'var(--bad)' }}>{fallo}</p>}
      {datos && <><Lista titulo="Pull requests" items={datos.prs} tipo="pr" /><Lista titulo="Issues" items={datos.issues} tipo="is" /></>}
    </div>
  );
}
