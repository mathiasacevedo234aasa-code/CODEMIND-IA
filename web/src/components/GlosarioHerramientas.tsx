import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';

/**
 * Coherencia del glosario (sinónimos usados donde el glosario fija otra
 * palabra, términos repetidos) y traer términos de otro proyecto.
 */
export function GlosarioHerramientas({ alCambiar }: { alCambiar: () => void }) {
  const project = useStore((s) => s.project);
  const projects = useStore((s) => s.projects);
  const [incons, setIncons] = useState<{ tipo: string; termino: string; alias?: string; otro?: string; elemento?: string; campo?: string }[] | null>(null);
  const [desde, setDesde] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  if (!project) return null;

  const revisar = async () => setIncons((await api.glosarioInconsistencias(project.id)).inconsistencias);
  const importar = async () => {
    const r = await api.glosarioImportar(project.id, desde);
    setAviso(`${r.importados} término(s) importados${r.omitidos ? `; ${r.omitidos} ya estaban y no se tocaron` : ''}.`);
    alCambiar();
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn sm outline" onClick={() => void revisar()} title="Busca en la documentación aprobada los sinónimos (alias) de cada término">
          Buscar términos inconsistentes
        </button>
        <span style={{ flex: 1 }} />
        <select value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Traer el glosario de…</option>
          {projects.filter((p) => p.id !== project.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn sm outline" disabled={!desde} onClick={() => void importar()}>Importar</button>
      </div>
      {aviso && <p className="hint">{aviso}</p>}
      {incons && (
        incons.length === 0
          ? <p className="hint">Sin inconsistencias: la documentación usa los términos del glosario.</p>
          : (
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              {incons.map((x, i) => (
                <li key={i}>
                  {x.tipo === 'duplicado'
                    ? <>«{x.termino}» y «{x.otro}» son el mismo término escrito distinto.</>
                    : <>«{x.elemento}» ({x.campo}) dice «{x.alias}»; el glosario fija «{x.termino}».</>}
                </li>
              ))}
            </ul>
          )
      )}
      <p className="hint" style={{ marginTop: 6 }}>Los sinónimos son los «alias» de cada término. Nada se cambia solo: se señala.</p>
    </div>
  );
}
