import { useEffect, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { languageOf } from '../lib/analyzer';
import { Icon } from './Icon';

/**
 * Comparación lado a lado, de solo lectura.
 *
 * A la izquierda lo que había (HEAD o lo preparado), a la derecha lo que hay.
 * Con "Anterior" y "Siguiente" se salta de un cambio al otro sin buscarlos con
 * la rueda del ratón. No se puede editar desde aquí: comparar no es cambiar.
 */
interface Versiones { binary: boolean; antes: string; despues: string }

/**
 * Sin `cargar`, compara las versiones de Git de `ruta`. Con `cargar`, lo que
 * devuelva: dos archivos cualquiera, o una versión del historial local.
 */
export function DiffLadoALado({ ruta, staged = false, alCerrar, cargar, titulo, etiqueta }: {
  ruta: string;
  staged?: boolean;
  alCerrar: () => void;
  cargar?: () => Promise<Versiones>;
  titulo?: string;
  etiqueta?: string;
}) {
  const project = useStore((s) => s.project);
  const theme = useStore((s) => s.settings.editor.theme);
  const [datos, setDatos] = useState<Versiones | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [cambios, setCambios] = useState(0);
  const [actual, setActual] = useState(-1);
  const editor = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!project) return;
    (cargar ? cargar() : api.gitVersiones(project.id, ruta, staged))
      .then(setDatos)
      .catch((e) => setFallo((e as Error).message));
  }, [project, ruta, staged]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [alCerrar]);

  const ir = (paso: 1 | -1) => {
    const lista = editor.current?.getLineChanges() ?? [];
    if (!lista.length) return;
    const i = (actual + paso + lista.length) % lista.length;
    setActual(i);
    const c = lista[i];
    const linea = c.modifiedEndLineNumber > 0 ? c.modifiedStartLineNumber : Math.max(1, c.modifiedStartLineNumber);
    const derecho = editor.current!.getModifiedEditor();
    derecho.revealLineInCenter(linea);
    derecho.setPosition({ lineNumber: linea, column: 1 });
  };

  return (
    <div className="overlay" onClick={alCerrar}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontSize: 14 }}>{titulo ?? ruta}</h2>
          <span className="tag muted">{etiqueta ?? (staged ? 'último commit → preparado' : 'preparado → tu disco')}</span>
          <span style={{ flex: 1 }} />
          <span className="hint">{cambios ? `${actual >= 0 ? actual + 1 : '–'} de ${cambios} cambio(s)` : 'Sin cambios'}</span>
          <button className="btn sm outline" disabled={!cambios} onClick={() => ir(-1)} title="Cambio anterior">↑ Anterior</button>
          <button className="btn sm outline" disabled={!cambios} onClick={() => ir(1)} title="Cambio siguiente">↓ Siguiente</button>
          <button className="btn icon" onClick={alCerrar}><Icon name="close" /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {fallo && <p className="hint" style={{ padding: 12 }}>No se pudo cargar la comparación: {fallo}</p>}
          {datos?.binary && <p className="hint" style={{ padding: 12 }}>Archivo binario: no hay texto que comparar.</p>}
          {datos && !datos.binary && (
            <DiffEditor
              original={datos.antes}
              modified={datos.despues}
              language={languageOf(ruta)}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              options={{ readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false }, automaticLayout: true }}
              onMount={(ed) => {
                editor.current = ed;
                ed.onDidUpdateDiff(() => setCambios(ed.getLineChanges()?.length ?? 0));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
