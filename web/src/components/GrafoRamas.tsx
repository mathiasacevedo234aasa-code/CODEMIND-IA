import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type CommitGrafo } from '../lib/api';

const FILA = 26;
const CARRIL = 14;
const COLORES = ['#5b8cff', '#3fb984', '#d9a441', '#cf649a', '#56b6c2', '#e06c75', '#a07cdf'];

/**
 * Grafo de ramas: los últimos commits de todas las ramas, con sus uniones.
 * Los que no están en la rama actual se pueden traer con cherry-pick (tras
 * confirmarlo).
 */
export function GrafoRamas({ alCambiar }: { alCambiar: () => void }) {
  const project = useStore((s) => s.project);
  const log = useStore((s) => s.log);
  const [datos, setDatos] = useState<{ commits: CommitGrafo[]; head: string | null } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; conflicto?: boolean } | null>(null);
  const cargar = () => { if (project) api.grafo(project.id).then(setDatos).catch(() => setDatos({ commits: [], head: null })); };
  useEffect(cargar, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carriles: cada commit hereda el carril de quien lo esperaba (su hijo).
  const { carril, ancho } = useMemo(() => {
    const carril = new Map<string, number>();
    const esperados: (string | null)[] = [];
    for (const c of datos?.commits ?? []) {
      let i = esperados.indexOf(c.hash);
      if (i === -1) { i = esperados.indexOf(null); if (i === -1) { i = esperados.length; esperados.push(null); } }
      carril.set(c.hash, i);
      esperados[i] = c.padres[0] ?? null;
      // Otros carriles que esperaban este mismo commit (una fusión) quedan libres.
      esperados.forEach((h, j) => { if (j !== i && h === c.hash) esperados[j] = null; });
      for (const p of c.padres.slice(1)) {
        if (!esperados.includes(p)) {
          const libre = esperados.indexOf(null);
          if (libre === -1) esperados.push(p); else esperados[libre] = p;
        }
      }
    }
    return { carril, ancho: Math.max(1, ...[...carril.values()].map((v) => v + 1)) };
  }, [datos]);

  if (!datos) return <p className="hint" style={{ padding: 10 }}><span className="spinner" /> Leyendo las ramas…</p>;
  if (!datos.commits.length) return <p className="hint" style={{ padding: 10 }}>Sin commits todavía.</p>;

  const fila = new Map(datos.commits.map((c, i) => [c.hash, i]));
  const x = (h: string) => 8 + (carril.get(h) ?? 0) * CARRIL;
  const y = (i: number) => i * FILA + FILA / 2;

  const traer = async (c: CommitGrafo) => {
    if (!project) return;
    if (!window.confirm(`¿Traer el commit ${c.corto} ("${c.asunto}") a la rama actual? Se crea un commit nuevo con los mismos cambios.`)) return;
    try {
      await api.cherryPick(project.id, { hash: c.hash });
      log('git', 'info', `Cherry-pick de ${c.corto}: ${c.asunto}`);
      setAviso(null);
      cargar();
      alCambiar();
    } catch (err) {
      const t = (err as Error).message;
      setAviso({ texto: t, conflicto: /conflictos/i.test(t) });
      alCambiar();
    }
  };

  return (
    <div className="grafo-ramas">
      {aviso && (
        <div className="review-banner" style={{ borderColor: 'var(--warn)', margin: '0 0 8px' }}>
          {aviso.texto}
          {aviso.conflicto && project && (
            <button className="btn sm outline" style={{ marginLeft: 8 }}
              onClick={() => void api.cherryPick(project.id, { abortar: true }).then(() => { setAviso(null); cargar(); alCambiar(); })}>
              Deshacer el cherry-pick
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex' }}>
        <svg width={8 + ancho * CARRIL} height={datos.commits.length * FILA} style={{ flexShrink: 0 }}>
          {datos.commits.map((c, i) => c.padres.map((p) => {
            const j = fila.get(p);
            if (j === undefined) return null;
            return <path key={`${c.hash}-${p}`} d={`M ${x(c.hash)} ${y(i)} C ${x(c.hash)} ${y(i) + FILA / 2}, ${x(p)} ${y(j) - FILA / 2}, ${x(p)} ${y(j)}`}
              stroke={COLORES[(carril.get(p) ?? 0) % COLORES.length]} strokeWidth="1.6" fill="none" />;
          }))}
          {datos.commits.map((c, i) => (
            <circle key={c.hash} cx={x(c.hash)} cy={y(i)} r={c.hash === datos.head ? 5 : 3.5}
              fill={c.enRamaActual ? COLORES[(carril.get(c.hash) ?? 0) % COLORES.length] : 'var(--bg)'}
              stroke={COLORES[(carril.get(c.hash) ?? 0) % COLORES.length]} strokeWidth="1.6" />
          ))}
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          {datos.commits.map((c) => (
            <div key={c.hash} className="grafo-fila" style={{ height: FILA }} title={`${c.hash}\n${c.autor} · ${c.fecha}`}>
              {c.refs.map((r) => <span key={r} className={`tag ${r.startsWith('tag: ') ? 'warn' : 'info'}`}>{r.replace('tag: ', '🏷 ')}</span>)}
              <span className="commit-subject">{c.asunto}</span>
              <span className="commit-meta">{c.corto}</span>
              {!c.enRamaActual && (
                <button className="btn sm outline" title="Traer este commit a la rama actual (cherry-pick)" onClick={() => void traer(c)}>
                  Traer
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="hint">Relleno: ya está en tu rama. Hueco: está en otra rama; «Traer» lo copia a la tuya.</p>
    </div>
  );
}
