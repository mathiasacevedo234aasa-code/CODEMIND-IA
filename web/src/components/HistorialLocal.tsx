import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type VersionLocal } from '../lib/api';
import { contenidoActual } from './Comparacion';
import { Icon } from './Icon';

/**
 * Las versiones anteriores de un archivo que guardó CodeMind AI (ver
 * server/src/services/historialLocal.js). Se pueden comparar con lo que hay
 * ahora y restaurar: restaurar pone ese contenido en el editor, y no queda
 * guardado hasta que tú guardes.
 */
export function HistorialLocal({ ruta, alCerrar }: { ruta: string; alCerrar: () => void }) {
  const project = useStore((s) => s.project);
  const setComparacion = useStore((s) => s.setComparacion);
  const editFile = useStore((s) => s.editFile);
  const log = useStore((s) => s.log);
  const [versiones, setVersiones] = useState<VersionLocal[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    api.historialLocal(project.id, ruta).then((r) => setVersiones(r.versiones)).catch((e) => setFallo((e as Error).message));
  }, [project, ruta]);

  const cargar = (v: VersionLocal) => api.versionLocal(project!.id, ruta, v.id).then((r) => r.contenido);

  const comparar = (v: VersionLocal) => {
    setComparacion({
      ruta,
      titulo: `${ruta}: ${new Date(v.en).toLocaleString()} ↔ ahora`,
      etiqueta: 'historial local',
      cargar: async () => {
        const [antes, despues] = await Promise.all([cargar(v), contenidoActual(ruta)]);
        return { binary: false, antes, despues };
      },
    });
  };

  const restaurar = async (v: VersionLocal) => {
    if (!window.confirm(`Se pondrá en el editor la versión del ${new Date(v.en).toLocaleString()}. No se guarda hasta que guardes, y lo que hay ahora también queda en el historial al guardar. ¿Seguir?`)) return;
    try {
      const contenido = await cargar(v);
      await useStore.getState().openFile(ruta);
      editFile(ruta, contenido);
      log('sistema', 'info', `Restaurada en el editor la versión de ${ruta} del ${new Date(v.en).toLocaleString()} (sin guardar).`);
      alCerrar();
    } catch (err) {
      setFallo((err as Error).message);
    }
  };

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Historial local · {ruta.split('/').pop()}</h2>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          <p className="hint">
            Cada vez que guardas, lo que había antes queda aquí (como mucho una versión por minuto, las últimas 50).
            Funciona aunque el proyecto no use Git.
          </p>
          {fallo && <div className="review-banner" style={{ borderColor: 'var(--bad)' }}>{fallo}</div>}
          {!versiones && !fallo && <p className="hint"><span className="spinner" /> Cargando...</p>}
          {versiones?.length === 0 && <p className="hint">Todavía no hay versiones anteriores: aparecen al guardar cambios.</p>}
          {versiones?.map((v) => (
            <div key={v.id} className="stash-fila">
              <Icon name="history" size={12} />
              <span className="msg">{new Date(v.en).toLocaleString()}</span>
              <span className="hint">{v.lineas} líneas</span>
              <button className="btn sm outline" onClick={() => comparar(v)}>Comparar</button>
              <button className="btn sm outline" onClick={() => void restaurar(v)}>Restaurar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
