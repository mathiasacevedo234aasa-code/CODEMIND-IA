import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { Icon } from './Icon';

/**
 * Un conflicto en tres columnas: lo que había antes (base), tu versión y la
 * que llega. Se resuelve quedándose con una entera, o editando el archivo a
 * mano y marcándolo como resuelto. Nada se decide solo.
 */
export function Conflicto3({ ruta, alCerrar, alResolver }: { ruta: string; alCerrar: () => void; alResolver: () => void }) {
  const project = useStore((s) => s.project);
  const setError = useStore((s) => s.setError);
  const [v, setV] = useState<{ base: string; mia: string; suya: string; actual: string } | null>(null);
  useEffect(() => {
    if (project) api.conflicto(project.id, ruta).then(setV).catch((e) => setError((e as Error).message));
  }, [project, ruta, setError]);

  const resolver = async (lado: 'mia' | 'suya' | 'actual') => {
    if (!project) return;
    const avisos = { mia: 'Te quedas con TU versión entera; la que llega se descarta para este archivo.', suya: 'Te quedas con la versión que LLEGA entera; la tuya se descarta para este archivo.', actual: 'Se marca como resuelto tal como está ahora en el disco.' };
    if (!window.confirm(`${avisos[lado]}\n\n¿Seguir?`)) return;
    try {
      await api.resolverConflicto(project.id, ruta, lado);
      // Si estaba abierto, se relee: el disco ha cambiado.
      if (useStore.getState().files[ruta]) {
        const { content } = await api.readFile(project.id, ruta);
        useStore.setState((s) => ({ files: { ...s.files, [ruta]: { content, saved: content } } }));
      }
      alResolver();
      alCerrar();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const Columna = ({ titulo, texto, nota }: { titulo: string; texto: string; nota: string }) => (
    <div className="col-conflicto">
      <div className="col-conflicto-cab"><strong>{titulo}</strong> <span className="hint">{nota}</span></div>
      <pre>{texto.split('\n').map((l, i) => <div key={i}><span className="blame-n">{i + 1}</span> {l}</div>)}</pre>
    </div>
  );

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 14 }}>Conflicto en {ruta}</h2>
          <span style={{ flex: 1 }} />
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        {!v ? <p className="hint" style={{ padding: 12 }}><span className="spinner" /> Leyendo…</p> : (
          <div className="conflicto-3">
            <Columna titulo="Base" texto={v.base} nota="como estaba antes de separarse" />
            <Columna titulo="La tuya" texto={v.mia} nota="tu rama" />
            <Columna titulo="La que llega" texto={v.suya} nota="la otra rama" />
          </div>
        )}
        <div className="modal-foot">
          <button className="btn outline" onClick={() => void resolver('mia')}>Quedarme con la mía</button>
          <button className="btn outline" onClick={() => void resolver('suya')}>Quedarme con la que llega</button>
          <button className="btn outline" onClick={() => { alCerrar(); void useStore.getState().openFile(ruta); }}>Editar a mano</button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={() => void resolver('actual')} title="Cuando lo hayas editado y quitado las marcas <<<<<<< >>>>>>>">Marcar como resuelto</button>
        </div>
      </div>
    </div>
  );
}
