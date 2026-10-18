import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import type { SearchResults } from '../lib/types';
import { Icon } from './Icon';

const IDENTIFICADOR = /^[A-Za-z_$][\w$]*$/;

/**
 * Renombrar un nombre en todo el proyecto, con vista previa.
 *
 * Es por texto (palabra completa, distinguiendo mayúsculas), no un análisis
 * de tipos: también cambia ese nombre en comentarios y textos, y no distingue
 * dos cosas distintas que se llamen igual. Por eso se enseña cada aparición y
 * se elige archivo a archivo antes de tocar nada.
 */
export function RenombrarSimbolo({ nombre, alCerrar }: { nombre: string; alCerrar: () => void }) {
  const project = useStore((s) => s.project);
  const files = useStore((s) => s.files);
  const log = useStore((s) => s.log);
  const [nuevo, setNuevo] = useState(nombre);
  const [resultados, setResultados] = useState<SearchResults | null>(null);
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    api.search(project.id, { query: nombre, wholeWord: true, caseSensitive: true })
      .then((r) => { setResultados(r); setIncluidos(new Set(r.files.map((f) => f.path))); })
      .catch((e) => setFallo((e as Error).message));
  }, [project, nombre]);

  const sinGuardar = [...incluidos].filter((p) => files[p] && files[p].content !== files[p].saved);
  const valido = IDENTIFICADOR.test(nuevo) && nuevo !== nombre;
  const total = resultados?.files.filter((f) => incluidos.has(f.path)).reduce((n, f) => n + f.matches.length, 0) ?? 0;

  const aplicar = async () => {
    if (!project || !valido) return;
    setOcupado(true);
    try {
      const r = await api.replaceApply(project.id, {
        query: nombre, wholeWord: true, caseSensitive: true, replacement: nuevo, paths: [...incluidos],
      });
      // Lo que está abierto se vuelve a leer: el disco ha cambiado.
      for (const f of r.files) {
        if (!useStore.getState().files[f.path]) continue;
        const { content } = await api.readFile(project.id, f.path);
        useStore.setState((s) => ({ files: { ...s.files, [f.path]: { content, saved: content } } }));
      }
      log('sistema', 'info', `Renombrado "${nombre}" a "${nuevo}": ${r.totalReplacements} cambio(s) en ${r.files.length} archivo(s).`);
      await useStore.getState().scanProject();
      alCerrar();
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Renombrar «{nombre}» en todo el proyecto</h2>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nuevo nombre</label>
            <input autoFocus value={nuevo} onChange={(e) => setNuevo(e.target.value.trim())} />
            {!IDENTIFICADOR.test(nuevo) && nuevo && <p className="hint" style={{ color: 'var(--bad)' }}>No es un nombre válido.</p>}
          </div>
          <p className="hint">
            Se busca la palabra completa, con mayúsculas exactas. Cambia también comentarios y textos que la contengan:
            revisa la lista y desmarca lo que no quieras tocar.
          </p>
          {fallo && <div className="review-banner" style={{ borderColor: 'var(--bad)' }}>{fallo}</div>}
          {!resultados && !fallo && <p className="hint"><span className="spinner" /> Buscando apariciones…</p>}
          {resultados?.files.map((f) => (
            <div key={f.path} className="card" style={{ marginBottom: 6 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox" style={{ width: 'auto' }}
                  checked={incluidos.has(f.path)}
                  onChange={(e) => setIncluidos((s) => { const n = new Set(s); if (e.target.checked) n.add(f.path); else n.delete(f.path); return n; })}
                />
                <code>{f.path}</code>
                <span className="tag muted">{f.matches.length}</span>
              </label>
              {f.matches.slice(0, 8).map((m, i) => (
                <div key={i} className="hint" style={{ fontFamily: 'var(--mono)', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.line}: {m.preview.trim()}
                </div>
              ))}
            </div>
          ))}
          {sinGuardar.length > 0 && (
            <div className="review-banner" style={{ borderColor: 'var(--warn)' }}>
              Con cambios sin guardar: {sinGuardar.join(', ')}. Guárdalos primero: el renombrado trabaja sobre el disco.
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span className="hint">{total} cambio(s) en {incluidos.size} archivo(s)</span>
          <span style={{ flex: 1 }} />
          <button className="btn outline" onClick={alCerrar}>Cancelar</button>
          <button className="btn primary" disabled={!valido || !total || ocupado || sinGuardar.length > 0} onClick={() => void aplicar()}>
            {ocupado ? <span className="spinner" /> : null} Renombrar
          </button>
        </div>
      </div>
    </div>
  );
}
