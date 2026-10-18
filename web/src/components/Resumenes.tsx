import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { marked } from './miniMarkdown';
import { Icon } from './Icon';

/**
 * Resumen de commits o de la semana, escrito por la IA con hechos del
 * proyecto. El semanal se puede añadir al registro de progreso, pero solo si
 * tú lo decides.
 */
export function BotonResumen({ tipo, etiqueta }: { tipo: 'commits' | 'semanal'; etiqueta: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="btn sm outline" onClick={() => setAbierto(true)}>
        <Icon name="brain" size={12} /> {etiqueta}
      </button>
      {abierto && <DialogoResumen tipo={tipo} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function DialogoResumen({ tipo, alCerrar }: { tipo: 'commits' | 'semanal'; alCerrar: () => void }) {
  const project = useStore((s) => s.project);
  const addProgress = useStore((s) => s.addProgress);
  const [texto, setTexto] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!project) return;
    api.resumen(project.id, tipo).then((r) => setTexto(r.resumen)).catch((e) => setFallo((e as Error).message));
  }, [project, tipo]);

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{tipo === 'semanal' ? 'Resumen de la semana' : 'Resumen de los últimos commits'}</h2>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div className="modal-body">
          {!texto && !fallo && <p className="hint"><span className="spinner" /> La IA está leyendo la actividad del proyecto...</p>}
          {fallo && <div className="review-banner" style={{ borderColor: 'var(--bad)' }}>{fallo}</div>}
          {texto && <div className="novedades" dangerouslySetInnerHTML={{ __html: marked(texto) }} />}
          {texto && <p className="hint">Escrito por la IA a partir del historial de git y los registros del proyecto. Revísalo antes de usarlo.</p>}
        </div>
        <div className="modal-foot">
          {tipo === 'semanal' && texto && (
            <button
              className="btn outline"
              disabled={guardado}
              onClick={() => void addProgress(`Resumen de la semana del ${new Date().toLocaleDateString()}`, texto, 'hecho').then(() => setGuardado(true))}
            >
              {guardado ? 'Añadido' : 'Añadir al registro de progreso'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={alCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
