import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { ask } from '../lib/dialogs';
import { Icon } from './Icon';

/** La siguiente versión, a partir de la última etiqueta del tipo vX.Y.Z. */
export function siguientesVersiones(nombres: string[]) {
  const ultima = nombres.map((n) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(n)).find(Boolean);
  const pref = nombres.find((n) => /^v\d/.test(n)) || !nombres.length ? 'v' : '';
  if (!ultima) return [`${pref}0.1.0`, `${pref}1.0.0`];
  const [ma, mi, pa] = [Number(ultima[1]), Number(ultima[2]), Number(ultima[3])];
  return [`${pref}${ma}.${mi}.${pa + 1}`, `${pref}${ma}.${mi + 1}.0`, `${pref}${ma + 1}.0.0`];
}

/** Etiquetas (versiones) del repositorio: crear, borrar y subir a GitHub. */
export function Etiquetas() {
  const project = useStore((s) => s.project);
  const log = useStore((s) => s.log);
  const setError = useStore((s) => s.setError);
  const githubConfigured = useStore((s) => s.githubConfigured);
  const [lista, setLista] = useState<{ nombre: string; fecha: string; commit: string; mensaje: string }[]>([]);
  useEffect(() => { if (project) api.etiquetas(project.id).then((r) => setLista(r.etiquetas)).catch(() => {}); }, [project]);
  if (!project) return null;

  const crear = async () => {
    const [parche, menor, mayor] = siguientesVersiones(lista.map((e) => e.nombre));
    const nombre = await ask({
      title: 'Nueva versión (etiqueta)',
      label: 'Nombre de la etiqueta, sobre el commit actual',
      value: parche,
      hint: mayor
        ? `Sugerencias: ${parche} (solo arreglos), ${menor} (novedades), ${mayor} (cambios incompatibles).`
        : `Sugerencias: ${parche} (primera versión de pruebas) o ${menor} (primera versión estable).`,
      confirmText: 'Siguiente',
      validate: (v) => (/^[\w][\w.\-/]{0,99}$/.test(v.trim()) ? null : 'Letras, números, puntos, guiones y barras.'),
    });
    if (!nombre) return;
    const mensaje = await ask({ title: `Mensaje de ${nombre}`, label: 'Qué trae esta versión (opcional)', confirmText: 'Crear etiqueta', allowEmpty: true, multiline: true });
    if (mensaje === null) return;
    try {
      setLista((await api.etiquetar(project.id, { nombre: nombre.trim(), mensaje })).etiquetas);
      log('git', 'info', `Etiqueta ${nombre} creada.`);
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="panel-title">Versiones (etiquetas)</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" onClick={() => void crear()}><Icon name="plus" size={12} /> Nueva</button>
      </div>
      {!lista.length && <p className="hint">Sin etiquetas. Una etiqueta marca un commit como versión (v1.0.0…).</p>}
      {lista.map((e) => (
        <div key={e.nombre} className="stash-fila">
          <span className="tag warn">🏷 {e.nombre}</span>
          <span className="msg" title={e.mensaje}>{e.mensaje}</span>
          <span className="hint">{e.fecha}</span>
          {githubConfigured && (
            <button className="btn sm outline" title="Subir esta etiqueta a GitHub"
              onClick={() => void api.subirEtiqueta(project.id, e.nombre).then(() => log('git', 'info', `Etiqueta ${e.nombre} subida a GitHub.`)).catch((err) => setError((err as Error).message))}>
              Subir
            </button>
          )}
          <button className="btn icon sm" title="Borrar la etiqueta en este equipo (no en GitHub)"
            onClick={() => { if (window.confirm(`¿Borrar la etiqueta ${e.nombre} en este equipo? En GitHub, si estaba subida, se queda.`)) void api.etiquetar(project.id, { borrar: e.nombre }).then((r) => setLista(r.etiquetas)); }}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
