import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { languageOf } from '../lib/analyzer';
import { Icon } from './Icon';

/**
 * Barra de estado inferior: rama de Git, lenguaje del archivo, línea y
 * columna, proveedor y modelo de IA, y si la vista previa está en marcha.
 * Cada parte lleva a su sitio al pulsarla.
 *
 * La rama y la vista previa se preguntan al backend cada pocos segundos;
 * la línea, el lenguaje y la IA salen del estado que ya tiene la página.
 */
export function BarraEstado() {
  const project = useStore((s) => s.project);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const cursor = useStore((s) => s.cursor);
  const settings = useStore((s) => s.settings);
  const proveedorNombre = useStore((s) => s.proveedorNombre);
  const proveedores = useStore((s) => s.proveedores);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const gitAvailable = useStore((s) => s.gitAvailable);
  const setLeftView = useStore((s) => s.setLeftView);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setBottomTab = useStore((s) => s.setBottomTab);
  const marcadores = useStore((s) => s.marcadores);

  const [rama, setRama] = useState<{ nombre: string | null; cambios: number } | null>(null);
  const [preview, setPreview] = useState<{ activo: boolean; puerto?: number } | null>(null);

  useEffect(() => {
    if (!project) return;
    let vivo = true;
    const consultar = async () => {
      if (document.hidden) return;
      if (gitAvailable) {
        const st = await api.gitStatus(project.id).catch(() => null);
        if (vivo) setRama(st?.isRepo ? { nombre: st.branch, cambios: st.staged.length + st.unstaged.length + st.untracked.length } : null);
      }
      const pv = await api.previewEstado(project.id).catch(() => null);
      if (vivo) setPreview(pv);
    };
    void consultar();
    const t = window.setInterval(() => void consultar(), 6000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [project, gitAvailable]);

  if (!project) return null;

  const activa = tabs.find((t) => t.id === activeTabId);
  const ruta = activa?.kind === 'file' ? activa.path : null;
  const modelo = settings.modelos?.[settings.proveedor] || proveedores.find((p) => p.id === settings.proveedor)?.modeloPorDefecto || '';
  const errores = Object.values(marcadores).flat().filter((m) => m.nivel === 'error').length;
  const avisos = Object.values(marcadores).flat().length - errores;

  return (
    <footer className="barra-estado" aria-label="Barra de estado">
      {rama && (
        <button onClick={() => setLeftView('git')} title="Control de versiones">
          <Icon name="git" size={11} /> {rama.nombre ?? '(cabeza separada)'}{rama.cambios ? ` · ${rama.cambios} cambio(s)` : ''}
        </button>
      )}
      <button onClick={() => setBottomTab('errores')} title="Problemas">
        <Icon name="warn" size={11} /> {errores} · {avisos}
      </button>
      {preview?.activo && (
        <button onClick={() => setBottomTab('preview')} title="Vista previa en marcha">
          <span className="status-dot ok" /> Vista previa :{preview.puerto}
        </button>
      )}
      <span style={{ flex: 1 }} />
      {(cursor?.cursores ?? 1) > 1 && <span title="Varios cursores: lo que escribas va a todos. Esc vuelve a uno.">{cursor!.cursores} cursores · Esc para uno</span>}
      {ruta && cursor?.path === ruta && <span>Ln {cursor.line}, Col {cursor.column}</span>}
      {ruta && <span>{languageOf(ruta)}</span>}
      <button onClick={() => setSettingsOpen(true)} title="Proveedor y modelo de IA">
        <span className={`status-dot ${apiKeyConfigured ? 'ok' : 'warn'}`} /> {proveedorNombre}{modelo ? ` · ${modelo}` : ''}
      </button>
    </footer>
  );
}
