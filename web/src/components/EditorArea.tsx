import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useStore } from '../state/useStore';
import { languageOf } from '../lib/analyzer';
import { WebView } from './WebView';
import { Icon } from './Icon';

export function EditorArea() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const files = useStore((s) => s.files);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const updateWebTab = useStore((s) => s.updateWebTab);
  const editFile = useStore((s) => s.editFile);
  const saveFile = useStore((s) => s.saveFile);
  const settings = useStore((s) => s.settings);
  const jumpTo = useStore((s) => s.jumpTo);
  const clearJump = useStore((s) => s.clearJump);
  const log = useStore((s) => s.log);
  const setFolderPickerOpen = useStore((s) => s.setFolderPickerOpen);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeFile = active?.kind === 'file' ? files[active.path] : undefined;

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveFile());
    monaco.editor.onDidChangeMarkers(() => {
      const model = editor.getModel();
      if (!model) return;
      const errors = monaco.editor
        .getModelMarkers({ resource: model.uri })
        .filter((m) => m.severity === monaco.MarkerSeverity.Error);
      if (errors.length) {
        log('errores', 'warn', `${model.uri.path.slice(1)}: ${errors.length} error(es) de sintaxis detectados por el editor.`);
      }
    });
  };

  useEffect(() => {
    if (!jumpTo || !editorRef.current || active?.kind !== 'file' || jumpTo.path !== active.path) return;
    const editor = editorRef.current;
    editor.revealLineInCenter(jumpTo.line);
    editor.setPosition({ lineNumber: jumpTo.line, column: 1 });
    editor.focus();
    clearJump();
  }, [jumpTo, active, clearJump]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveFile]);

  return (
    <>
      <div className="tabs">
        {tabs.map((tab) => {
          const dirty = tab.kind === 'file' && files[tab.path] && files[tab.path].content !== files[tab.path].saved;
          const label = tab.kind === 'file' ? tab.path.split('/').pop() : tab.title;
          return (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.kind === 'file' ? tab.path : tab.url}
            >
              {tab.kind === 'web' && <Icon name="play" size={11} />}
              {dirty && <span className="dirty" title="Cambios sin guardar" />}
              <span>{label}</span>
              <span
                className="close"
                onClick={(e) => {
                  e.stopPropagation();
                  if (dirty && !window.confirm(`"${label}" tiene cambios sin guardar. ¿Cerrar de todos modos?`)) return;
                  closeTab(tab.id);
                }}
              >
                <Icon name="close" size={11} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="editor-host">
        {!active ? (
          <div className="empty">
            <Icon name="file" size={26} />
            <h3>Ningún archivo abierto</h3>
            <p>Selecciona un archivo en el explorador, crea uno nuevo o abre una carpeta de tu equipo.</p>
            <button className="btn outline" onClick={() => setFolderPickerOpen(true)}>
              <Icon name="folderOpen" size={13} /> Abrir una carpeta
            </button>
          </div>
        ) : active.kind === 'web' ? (
          <WebView
            url={active.url}
            title={active.title}
            onUrlChange={(url) => updateWebTab(active.id, url)}
          />
        ) : activeFile ? (
          <Editor
            key={active.path}
            height="100%"
            theme={settings.editor.theme === 'dark' ? 'vs-dark' : 'light'}
            path={active.path}
            language={languageOf(active.path)}
            value={activeFile.content}
            onChange={(value) => editFile(active.path, value ?? '')}
            onMount={onMount}
            options={{
              fontSize: settings.editor.fontSize,
              tabSize: settings.editor.tabSize,
              wordWrap: settings.editor.wordWrap ? 'on' : 'off',
              minimap: { enabled: settings.editor.minimap },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              fontLigatures: true,
              padding: { top: 10 },
              // El editor no interrumpe: sin sugerencias automáticas de IA.
              quickSuggestions: { other: true, comments: false, strings: false },
            }}
          />
        ) : null}
      </div>
    </>
  );
}
