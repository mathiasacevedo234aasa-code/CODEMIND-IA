import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type BlameResultado } from '../lib/api';
import { Icon } from './Icon';

/**
 * Historia de un archivo en git: los commits que lo tocaron y, línea a línea,
 * quién la escribió y en qué commit (blame).
 */
export function HistoriaGit({ ruta, alCerrar }: { ruta: string; alCerrar: () => void }) {
  const project = useStore((s) => s.project);
  const [vista, setVista] = useState<'commits' | 'blame'>('blame');
  const [commits, setCommits] = useState<{ corto: string; autor: string; fecha: string; asunto: string }[] | null>(null);
  const [blame, setBlame] = useState<BlameResultado | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    api.historialGit(project.id, ruta).then((r) => setCommits(r.commits)).catch((e) => setFallo((e as Error).message));
    api.blame(project.id, ruta).then(setBlame).catch((e) => setFallo((e as Error).message));
  }, [project, ruta]);

  const ir = async (linea: number) => {
    alCerrar();
    const st = useStore.getState();
    await st.openFile(ruta);
    st.jumpToLine(ruta, linea);
  };

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 14 }}>Historia de {ruta}</h2>
          <button className={`mode-chip ${vista === 'blame' ? 'active' : ''}`} onClick={() => setVista('blame')}>Quién escribió cada línea</button>
          <button className={`mode-chip ${vista === 'commits' ? 'active' : ''}`} onClick={() => setVista('commits')}>Commits ({commits?.length ?? '…'})</button>
          <span style={{ flex: 1 }} />
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {fallo && <p className="hint" style={{ padding: 12 }}>{fallo}</p>}
          {vista === 'commits' && commits && (
            commits.length ? commits.map((c) => (
              <div key={c.corto} className="commit-row" style={{ padding: '4px 12px' }}>
                <code>{c.corto}</code><span className="commit-subject">{c.asunto}</span><span className="commit-meta">{c.autor} · {c.fecha}</span>
              </div>
            )) : <p className="hint" style={{ padding: 12 }}>Este archivo todavía no está en ningún commit.</p>
          )}
          {vista === 'blame' && blame && (
            <div className="blame">
              {blame.lineas.map((l, i) => {
                const c = blame.commits[l.hash];
                const primera = i === 0 || blame.lineas[i - 1].hash !== l.hash;
                return (
                  <div key={l.linea} className={`blame-fila ${primera ? 'primera' : ''}`} onClick={() => void ir(l.linea)}>
                    <span className="blame-info" title={c ? `${c.hash} · ${c.autor} · ${c.fecha}\n${c.asunto}` : ''}>
                      {primera && c ? <><code>{c.hash}</code> {c.autor} · {c.fecha} · {c.asunto}</> : ''}
                    </span>
                    <span className="blame-n">{l.linea}</span>
                    <span className="blame-texto">{l.texto || ' '}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
