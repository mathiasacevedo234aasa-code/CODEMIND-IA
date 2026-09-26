import { useStore } from '../state/useStore';
import { Icon } from './Icon';

export function TopBar() {
  const project = useStore((s) => s.project);
  const files = useStore((s) => s.files);
  const saving = useStore((s) => s.saving);
  const saveAll = useStore((s) => s.saveAll);
  const apiKeyConfigured = useStore((s) => s.apiKeyConfigured);
  const proveedorNombre = useStore((s) => s.proveedorNombre);
  const gitAvailable = useStore((s) => s.gitAvailable);
  const githubConfigured = useStore((s) => s.githubConfigured);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const setLeftView = useStore((s) => s.setLeftView);
  const setBottomTab = useStore((s) => s.setBottomTab);
  const refreshPreview = useStore((s) => s.refreshPreview);
  const closeProject = useStore((s) => s.closeProject);
  const proposals = useStore((s) => s.proposals);
  const rightOpen = useStore((s) => s.rightOpen);
  const setRightOpen = useStore((s) => s.setRightOpen);
  const setRightTab = useStore((s) => s.setRightTab);

  const dirty = Object.values(files).filter((f) => f.content !== f.saved);
  const theme = settings.editor.theme;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">CM</span>
        <span>CodeMind AI</span>
      </div>

      {project && (
        <>
          <div className="divider" />
          <div className="project-chip">
            <strong title={project.root ?? project.name}>{project.name}</strong>
            <span>
              {saving
                ? 'Guardando...'
                : dirty.length
                  ? `${dirty.length} archivo(s) sin guardar`
                  : project.mode === 'carpeta'
                    ? 'Carpeta del equipo · todo guardado'
                    : 'Todo guardado'}
            </span>
          </div>

          <button className="btn outline" onClick={() => void saveAll()} disabled={!dirty.length || saving} title="Ctrl+S">
            <Icon name="save" />
            Guardar
          </button>

          <button
            className="btn"
            onClick={() => { setBottomTab('preview'); refreshPreview(); }}
            title="Vista previa de HTML, CSS y JavaScript"
          >
            <Icon name="play" />
            Vista previa
          </button>

          <button className="btn" onClick={() => setLeftView('ejecutar')} title="Ejecutar el servidor del proyecto">
            <Icon name="terminal" />
            Ejecutar
          </button>

          <button
            className={`btn ${rightOpen ? '' : 'outline'}`}
            onClick={() => { if (rightOpen) setRightOpen(false); else setRightTab('asistente'); }}
            title={rightOpen ? 'Ocultar el panel del asistente' : 'Mostrar el panel del asistente'}
          >
            <Icon name="brain" />
            Asistente
            {proposals.length > 0 && <span className="tag info">{proposals.length}</span>}
          </button>
        </>
      )}

      <div className="spacer" />

      <button
        className="status-chip"
        title={gitAvailable ? 'Git disponible. Abre el panel de control de versiones.' : 'Git no está instalado en este equipo'}
        onClick={() => setLeftView('git')}
        disabled={!project}
      >
        <span className={`status-dot ${gitAvailable ? 'ok' : ''}`} /> Git
      </button>
      <button
        className="status-chip"
        title={githubConfigured ? 'Cuenta de GitHub conectada' : 'GitHub sin conectar'}
        onClick={() => setLeftView('github')}
        disabled={!project}
      >
        <span className={`status-dot ${githubConfigured ? 'ok' : ''}`} /> GitHub
      </button>
      <span
        className={`tag ${apiKeyConfigured ? 'ok' : 'warn'}`}
        title={apiKeyConfigured
          ? `${proveedorNombre} esta configurado en el backend`
          : `${proveedorNombre} no esta configurado: ve a Configuracion`}
      >
        <span className={`status-dot ${apiKeyConfigured ? 'ok' : 'warn'}`} /> {proveedorNombre}
      </span>

      <button
        className="btn icon"
        onClick={() => void saveSettings({ editor: { ...settings.editor, theme: theme === 'dark' ? 'light' : 'dark' } })}
        title="Cambiar tema"
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      {project && (
        <button className="btn icon" onClick={closeProject} title="Cerrar proyecto">
          <Icon name="close" />
        </button>
      )}
    </header>
  );
}
