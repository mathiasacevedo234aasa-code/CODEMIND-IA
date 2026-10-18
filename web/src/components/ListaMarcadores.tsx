import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { useMarcadores } from '../lib/marcadores';
import { Icon } from './Icon';

/** Todos los marcadores del proyecto: saltar a cada uno, ver su nota, quitarlo. */
export function ListaMarcadores() {
  const [abierta, setAbierta] = useState(false);
  const lista = useMarcadores((s) => s.lista);
  const quitar = useMarcadores((s) => s.quitar);
  useEffect(() => {
    const abrir = () => setAbierta(true);
    window.addEventListener('codemind:marcadores', abrir);
    return () => window.removeEventListener('codemind:marcadores', abrir);
  }, []);
  if (!abierta) return null;
  const ir = async (ruta: string, linea: number) => {
    setAbierta(false);
    const st = useStore.getState();
    await st.openFile(ruta);
    st.jumpToLine(ruta, linea);
  };
  const ordenados = [...lista].sort((a, b) => a.ruta.localeCompare(b.ruta) || a.linea - b.linea);
  return (
    <div className="overlay" onClick={() => setAbierta(false)}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Marcadores</h2>
          <button className="btn icon" onClick={() => setAbierta(false)}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {!ordenados.length && <p className="hint">No hay marcadores. En el editor, Ctrl+Alt+K marca la línea; Ctrl+Alt+Shift+K, con nota.</p>}
          {ordenados.map((m) => (
            <div key={`${m.ruta}:${m.linea}`} className="problema con-ruta" onClick={() => void ir(m.ruta, m.linea)}>
              <span>★</span>
              <code>{m.ruta}:{m.linea}</code>
              <span className="msg">{m.nota || <span className="hint">sin nota</span>}</span>
              <button className="btn icon sm" title="Quitar" onClick={(e) => { e.stopPropagation(); quitar(m.ruta, m.linea); }}>
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
