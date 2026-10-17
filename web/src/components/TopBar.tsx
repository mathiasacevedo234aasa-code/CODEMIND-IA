import { useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';
import { useTemaOscuro } from '../lib/tema';

export function TopBar() {
  const t = useT();
  const [abriendoPreview, setAbriendoPreview] = useState(false);
  const project = useStore((s) => s.project);
  const openWebTab = useStore((s) => s.openWebTab);
  const log = useStore((s) => s.log);
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
  const theme = useTemaOscuro() ? 'dark' : 'light';

  /**
   * Abrir la vista previa es levantar el servidor del proyecto y enseñarlo.
   *
   * Si por lo que sea no se puede levantar (una carpeta sin permisos, un
   * sistema de archivos raro), se cae a la vista previa simple del panel de
   * abajo en lugar de quedarse sin nada, y se dice lo que ha pasado.
   */
  const abrirVistaPrevia = async () => {
    if (!project) return;
    setAbriendoPreview(true);
    try {
      const res = await api.previewArrancar(project.id);
      openWebTab(res.entrada ? `${res.url}/${res.entrada}` : res.url, `Vista previa · ${project.name}`);
      log('procesos', 'info', `Vista previa en ${res.url}. Se recarga sola al guardar.`);
    } catch (err) {
      log('procesos', 'warn', `No se pudo levantar el servidor de vista previa: ${(err as Error).message}. Se usa la vista previa simple.`);
      setBottomTab('preview');
      refreshPreview();
    } finally {
      setAbriendoPreview(false);
    }
  };

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
            {t('Guardar')}
          </button>

          <button
            className="btn"
            disabled={abriendoPreview}
            onClick={() => void abrirVistaPrevia()}
            title="Levanta un servidor de verdad sobre tu proyecto y lo abre aquí. Se recarga solo al guardar."
          >
            {abriendoPreview ? <span className="spinner" /> : <Icon name="play" />}
            {t('Vista previa')}
          </button>

          <button className="btn" onClick={() => setLeftView('ejecutar')} title="Ejecutar el servidor del proyecto">
            <Icon name="terminal" />
            {t('Ejecutar')}
          </button>

          <button
            className={`btn ${rightOpen ? '' : 'outline'}`}
            onClick={() => { if (rightOpen) setRightOpen(false); else setRightTab('asistente'); }}
            title={t(rightOpen ? 'Ocultar el panel del asistente' : 'Mostrar el panel del asistente')}
          >
            <Icon name="brain" />
            {t('Asistente')}
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
