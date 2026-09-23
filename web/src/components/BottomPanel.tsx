import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { buildPreview, findHtmlEntries } from '../lib/preview';
import type { BottomTab } from '../state/useStore';
import type { LogChannel } from '../lib/types';
import { Icon } from './Icon';

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'consola', label: 'Consola' },
  { id: 'errores', label: 'Errores' },
  { id: 'preview', label: 'Vista previa' },
  { id: 'procesos', label: 'Procesos' },
  { id: 'git', label: 'Registro de Git' },
  { id: 'documentacion', label: 'Documentación' },
];

/** Qué canales de registro alimenta cada pestaña. */
const CHANNELS: Partial<Record<BottomTab, LogChannel[]>> = {
  consola: ['console', 'sistema'],
  errores: ['errores'],
  documentacion: ['documentacion'],
  git: ['git'],
  procesos: ['procesos'],
};

function Preview() {
  const project = useStore((s) => s.project);
  const tree = useStore((s) => s.tree);
  const files = useStore((s) => s.files);
  const previewKey = useStore((s) => s.previewKey);
  const log = useStore((s) => s.log);
  const openWebTab = useStore((s) => s.openWebTab);

  const entries = useMemo(() => findHtmlEntries(tree), [tree]);
  const [entry, setEntry] = useState('');
  const [html, setHtml] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry && entries.length) setEntry(entries[0]);
  }, [entries, entry]);

  useEffect(() => {
    if (!project || !entry) return;
    // Se usa el contenido del editor, no el del disco: así la vista previa
    // refleja lo que el usuario está escribiendo ahora mismo.
    const overrides = Object.fromEntries(Object.entries(files).map(([path, f]) => [path, f.content]));
    buildPreview(project.id, entry, overrides)
      .then((res) => {
        setHtml(res.html);
        setWarnings(res.warnings);
        setError(null);
        res.warnings.forEach((w) => log('errores', 'warn', `Vista previa: ${w}`));
      })
      .catch((err: Error) => setError(err.message));
    // Se reconstruye al pulsar "Vista previa" o al cambiar de entrada.
  }, [project, entry, previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { __codemind?: boolean; level?: string; text?: string };
      if (!data?.__codemind) return;
      log(
        data.level === 'error' ? 'errores' : 'console',
        data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'info',
        `[vista previa] ${data.text}`,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [log]);

  if (!entries.length) {
    return (
      <p className="hint" style={{ fontFamily: 'var(--sans)' }}>
        No hay ningún archivo .html en el proyecto. Esta vista previa ejecuta HTML, CSS y JavaScript de navegador.
        Un proyecto de React, Vue, Angular, Svelte o TypeScript necesita compilación y su propio servidor de desarrollo:
        arráncalo desde el panel <strong>Ejecutar</strong> y ábrelo en una pestaña del editor.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={entry} onChange={(e) => setEntry(e.target.value)} style={{ width: 'auto' }}>
          {entries.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn sm outline" onClick={() => useStore.getState().refreshPreview()}>
          <Icon name="refresh" size={12} /> Actualizar
        </button>
        <button
          className="btn sm outline"
          onClick={() => {
            const w = window.open('', '_blank');
            if (w) { w.document.write(html); w.document.close(); }
          }}
        >
          Abrir en pestaña nueva
        </button>
        {warnings.length > 0 && <span className="tag warn">{warnings.length} aviso(s)</span>}
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" onClick={() => openWebTab('http://localhost:5173', 'Navegador')} title="Abrir el navegador integrado">
          <Icon name="link" size={12} /> Navegador
        </button>
      </div>
      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : (
        <iframe
          title="Vista previa"
          srcDoc={html}
          // Sin allow-same-origin: el HTML previsualizado no comparte origen con
          // la aplicación y no puede tocar su almacenamiento ni su backend.
          sandbox="allow-scripts allow-modals allow-forms"
          style={{ flex: 1, width: '100%', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
        />
      )}
    </div>
  );
}

export function BottomPanel() {
  const bottomTab = useStore((s) => s.bottomTab);
  const setBottomTab = useStore((s) => s.setBottomTab);
  const bottomOpen = useStore((s) => s.bottomOpen);
  const toggleBottom = useStore((s) => s.toggleBottom);
  const logs = useStore((s) => s.logs);
  const gitAvailable = useStore((s) => s.gitAvailable);

  const channels = CHANNELS[bottomTab];
  const filtered = channels ? logs.filter((l) => channels.includes(l.channel)) : [];

  const counts = useMemo(() => {
    const map: Partial<Record<BottomTab, number>> = {};
    for (const [tab, chans] of Object.entries(CHANNELS) as [BottomTab, LogChannel[]][]) {
      map[tab] = logs.filter((l) => chans.includes(l.channel)).length;
    }
    return map;
  }, [logs]);

  return (
    <div className="bottom">
      <div className="bottom-tabs">
        {TABS.map((t) => (
          <div key={t.id} className={`bottom-tab ${bottomTab === t.id ? 'active' : ''}`} onClick={() => setBottomTab(t.id)}>
            {t.label}
            {counts[t.id] ? <span className="tag muted">{counts[t.id]}</span> : null}
          </div>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn icon sm" onClick={toggleBottom} title={bottomOpen ? 'Contraer' : 'Expandir'}>
          <Icon name={bottomOpen ? 'chevronDown' : 'chevronRight'} size={13} />
        </button>
      </div>

      {bottomOpen && (
        <div className="bottom-body">
          {bottomTab === 'preview' ? (
            <Preview />
          ) : filtered.length === 0 ? (
            <p className="hint" style={{ fontFamily: 'var(--sans)' }}>
              {bottomTab === 'git' && !gitAvailable
                ? 'Git no está disponible en este equipo, así que no hay operaciones que registrar.'
                : bottomTab === 'git'
                  ? 'Aquí aparecen las operaciones de Git y GitHub que realices, con su resultado real.'
                  : bottomTab === 'procesos'
                    ? 'Aquí aparecen los servidores y tareas que arranques desde el panel Ejecutar.'
                    : 'Sin entradas.'}
            </p>
          ) : (
            filtered.map((l) => (
              <div key={l.id} className={`log-line ${l.level}`}>
                <span className="at">{new Date(l.at).toLocaleTimeString('es')}</span>
                <span className="msg">{l.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
