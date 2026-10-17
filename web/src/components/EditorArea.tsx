import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useStore } from '../state/useStore';
import { languageOf } from '../lib/analyzer';
import { fontStackOf } from '../lib/editorFonts';
import { activarEmmet } from '../lib/emmet';
import { registrarProveedores } from '../lib/proveedoresMonaco';
import { panelDe, type PanelEditor as Mitad } from '../lib/types';
import { WebView } from './WebView';
import { Icon } from './Icon';
import { VistaMarkdown } from './VistaMarkdown';
import { BotonEjecutarArchivo } from './EjecutarArchivo';

/**
 * Zona central: una o dos mitades con sus propias pestañas.
 *
 * El editor dividido existe para lo que uno hace todo el rato: mirar dos
 * archivos a la vez —la plantilla y su hoja de estilos, el código y su
 * prueba, el archivo y lo que documenta—. Cada mitad recuerda su pestaña, y
 * la mitad con el foco es donde se abre lo siguiente.
 */
export function EditorArea() {
  const tabs = useStore((s) => s.tabs);
  const saveFile = useStore((s) => s.saveFile);

  const dividido = tabs.some((t) => panelDe(t) === 'b');

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
    <div className={`editor-mitades ${dividido ? 'dividido' : ''}`}>
      <MitadEditor mitad="a" dividido={dividido} />
      {dividido && <MitadEditor mitad="b" dividido />}
    </div>
  );
}

function MitadEditor({ mitad, dividido }: { mitad: Mitad; dividido: boolean }) {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const panelActivo = useStore((s) => s.panelActivo);
  const ultimoPorPanel = useStore((s) => s.ultimoPorPanel);
  const files = useStore((s) => s.files);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setPanelActivo = useStore((s) => s.setPanelActivo);
  const closeTab = useStore((s) => s.closeTab);
  const dividirEditor = useStore((s) => s.dividirEditor);
  const unirEditor = useStore((s) => s.unirEditor);
  const updateWebTab = useStore((s) => s.updateWebTab);
  const editFile = useStore((s) => s.editFile);
  const saveFile = useStore((s) => s.saveFile);
  const settings = useStore((s) => s.settings);
  const jumpTo = useStore((s) => s.jumpTo);
  const clearJump = useStore((s) => s.clearJump);
  const log = useStore((s) => s.log);
  const setFolderPickerOpen = useStore((s) => s.setFolderPickerOpen);
  const askAssistant = useStore((s) => s.askAssistant);
  const emmetActivo = useStore((s) => s.settings.editor.emmet);
  const setCursor = useStore((s) => s.setCursor);
  const [vistaMd, setVistaMd] = useState(true);
  const fijarTab = useStore((s) => s.fijarTab);

  // El editor vivo, junto al archivo para el que se creó. Guardar también la
  // ruta importa: Monaco se destruye y se vuelve a crear al cambiar de archivo
  // y al cerrar la última pestaña, y una referencia a un editor ya destruido
  // acepta las órdenes sin hacer nada (era por esto que un salto pedido justo
  // después de abrir un archivo se perdía en silencio).
  const editorRef = useRef<{ editor: Parameters<OnMount>[0]; path: string } | null>(null);
  // Un ref no provoca re-render, así que hace falta un estado para que el
  // salto pendiente se vuelva a intentar en cuanto Monaco termine de montarse.
  // Es un contador y no un booleano porque cada montaje debe reintentarlo.
  const [montajes, setMontajes] = useState(0);

  const mias = tabs.filter((t) => panelDe(t) === mitad);
  // Si el foco está en esta mitad manda la pestaña activa; si está en la otra,
  // esta mitad sigue enseñando la última que se usó aquí.
  const propia = mias.find((t) => t.id === activeTabId);
  const active = propia ?? mias.find((t) => t.id === ultimoPorPanel[mitad]) ?? mias[mias.length - 1] ?? null;
  const activeFile = active?.kind === 'file' ? files[active.path] : undefined;
  const enfocada = panelActivo === mitad;
  const esMdConVista = vistaMd && active?.kind === 'file' && /\.(md|mdx|markdown)$/i.test(active.path);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = active?.kind === 'file' ? { editor, path: active.path } : null;
    setMontajes((n) => n + 1);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveFile());
    editor.onDidFocusEditorText(() => setPanelActivo(mitad));
    // La posición del cursor la usan las migas y la barra de estado.
    const rutaMontada = active?.kind === 'file' ? active.path : null;
    const avisarCursor = () => {
      const p = editor.getPosition();
      if (rutaMontada && p && editor.hasTextFocus()) setCursor({ path: rutaMontada, line: p.lineNumber, column: p.column });
    };
    editor.onDidChangeCursorPosition(avisarCursor);
    editor.onDidFocusEditorText(avisarCursor);

    // Emmet: html:5, ul>li*3, div.clase... Se activa una sola vez por sesión.
    if (emmetActivo) activarEmmet(monaco);

    // "Explícame esto" sobre cualquier trozo de código, no solo funciones
    // detectadas. Aparece en el menú contextual y tiene atajo propio.
    editor.addAction({
      id: 'codemind.explicar-seleccion',
      label: 'Explicar esta selección con la IA',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
      run: (ed) => {
        const seleccion = ed.getSelection();
        const modelo = ed.getModel();
        if (!seleccion || !modelo) return;

        const texto = modelo.getValueInRange(seleccion);
        if (!texto.trim()) {
          useStore.getState().setError('Selecciona primero el código que quieres entender.');
          return;
        }
        const ruta = modelo.uri.path.replace(/^\//, '');
        askAssistant(
          '¿Qué hace exactamente este fragmento? Explícalo paso a paso, sin proponer cambios.',
          `Fragmento seleccionado de ${ruta} (líneas ${seleccion.startLineNumber} a ${seleccion.endLineNumber}):
\`\`\`
${texto.slice(0, 8000)}
\`\`\``,
        );
      },
    });
    // Documentación al pasar el cursor e ir a la definición: una sola vez.
    registrarProveedores(monaco);

    monaco.editor.onDidChangeMarkers(() => {
      const model = editor.getModel();
      if (!model) return;
      const errors = monaco.editor
        .getModelMarkers({ resource: model.uri })
        .filter((m) => m.severity === monaco.MarkerSeverity.Error);
      if (errors.length) {
        // Con ruta, línea y el mensaje del primero: así se puede ir a él o
        // pedir que se explique, en vez de un simple recuento.
        const [primero] = errors;
        const resto = errors.length > 1 ? ` (y ${errors.length - 1} más)` : '';
        log('errores', 'warn', `${model.uri.path.slice(1)}:${primero.startLineNumber} ${primero.message}${resto}`);
      }
    });
  };

  useEffect(() => {
    const montado = editorRef.current;
    if (!jumpTo || !montado || active?.kind !== 'file') return;
    // Las tres rutas tienen que coincidir: la del salto, la de la pestaña que
    // esta mitad enseña y la del editor realmente montado.
    if (jumpTo.path !== active.path || montado.path !== active.path) return;
    // Recién creado, Monaco todavía no ha medido su contenedor y desplazarse
    // no tendría ningún efecto: layout() lo obliga a medirse ahora mismo.
    montado.editor.layout();
    montado.editor.revealLineInCenter(jumpTo.line);
    montado.editor.setPosition({ lineNumber: jumpTo.line, column: 1 });
    montado.editor.focus();
    clearJump();
  }, [jumpTo, active, clearJump, montajes]);

  // Al quedarse sin ningún archivo abierto, Monaco desaparece: hay que soltar
  // la referencia para no darle órdenes a un editor que ya no existe.
  useEffect(() => {
    if (active?.kind !== 'file') editorRef.current = null;
  }, [active]);

  return (
    <div
      className={`editor-mitad ${dividido && enfocada ? 'enfocada' : ''}`}
      onMouseDown={() => { if (!enfocada) setPanelActivo(mitad); }}
    >
      <div className="tabs">
        {mias.map((tab) => {
          const dirty = tab.kind === 'file' && files[tab.path] && files[tab.path].content !== files[tab.path].saved;
          const label = tab.kind === 'file' ? tab.path.split('/').pop() : tab.title;
          return (
            <div
              key={tab.id}
              className={`tab ${tab.id === active?.id ? 'active' : ''} ${tab.id === activeTabId ? 'enfocada' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => { if (tab.kind === 'file') { e.preventDefault(); fijarTab(tab.id); } }}
              title={tab.kind === 'file' ? `${tab.path}\nClic derecho: ${tab.fijada ? 'soltar' : 'fijar'} la pestaña` : tab.url}
            >
              {tab.kind === 'file' && tab.fijada && <span className="tab-fijada" title="Fijada">📌</span>}
              {tab.kind === 'web' && <Icon name="play" size={11} />}
              {dirty && <span className="dirty" title="Cambios sin guardar" />}
              <span>{label}</span>
              {!(tab.kind === 'file' && tab.fijada) && <span
                className="close"
                onClick={(e) => {
                  e.stopPropagation();
                  if (dirty && !window.confirm(`"${label}" tiene cambios sin guardar. ¿Cerrar de todos modos?`)) return;
                  closeTab(tab.id);
                }}
              >
                <Icon name="close" size={11} />
              </span>}
            </div>
          );
        })}

        <span style={{ flex: 1 }} />
        {active?.kind === 'file' && /\.(md|mdx|markdown)$/i.test(active.path) && (
          <button
            className={`btn sm ${vistaMd ? '' : 'outline'}`}
            title="Ver el Markdown formateado al lado, mientras escribes"
            onClick={() => setVistaMd((v) => !v)}
          >
            Vista previa
          </button>
        )}
        {enfocada && <BotonEjecutarArchivo />}
        {active && (
          <button
            className="btn icon sm"
            title={mitad === 'a' && !dividido ? 'Dividir el editor: ver dos archivos a la vez' : 'Mandar esta pestaña a la otra mitad'}
            onClick={() => { setActiveTab(active.id); dividirEditor(); }}
          >
            <Icon name="columns" size={13} />
          </button>
        )}
        {dividido && mitad === 'b' && (
          <button className="btn icon sm" title="Deshacer la división (no cierra nada)" onClick={() => unirEditor()}>
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      {active?.kind === 'file' && <Migas ruta={active.path} />}
      <div className={`editor-host ${esMdConVista ? 'con-vista-md' : ''}`}>
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
            key={`${mitad}:${active.path}`}
            height="100%"
            theme={settings.editor.theme === 'dark' ? 'vs-dark' : 'light'}
            path={active.path}
            language={languageOf(active.path)}
            value={activeFile.content}
            onChange={(value) => editFile(active.path, value ?? '')}
            onMount={onMount}
            options={{
              fontSize: settings.editor.fontSize,
              fontFamily: fontStackOf(settings.editor.fontFamily).stack,
              // 0 deja que Monaco calcule la altura proporcional al tamaño.
              lineHeight: settings.editor.lineHeight || undefined,
              letterSpacing: settings.editor.letterSpacing,
              fontLigatures: settings.editor.fontLigatures,
              tabSize: settings.editor.tabSize,
              wordWrap: settings.editor.wordWrap ? 'on' : 'off',
              minimap: { enabled: settings.editor.minimap && !dividido },
              lineNumbers: settings.editor.lineNumbers,
              guides: { indentation: settings.editor.indentGuides },
              renderLineHighlight: settings.editor.highlightCurrentLine ? 'line' : 'none',
              stickyScroll: { enabled: settings.editor.stickyScroll },
              bracketPairColorization: { enabled: settings.editor.bracketPairColorization },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              padding: { top: 10 },
              // El editor no interrumpe: sin sugerencias automáticas de IA.
              quickSuggestions: { other: true, comments: false, strings: false },
            }}
          />
        ) : null}
        {esMdConVista && activeFile && <VistaMarkdown texto={activeFile.content} />}
      </div>
    </div>
  );
}

/**
 * Migas sobre el editor: carpeta › archivo › clase › método.
 *
 * Los niveles salen del analizador: los elementos cuyo rango contiene la
 * línea del cursor, del más grande al más pequeño. Pulsar uno lleva a él.
 */
function Migas({ ruta }: { ruta: string }) {
  const cursor = useStore((s) => s.cursor);
  const analysis = useStore((s) => s.analysis);
  const jumpToLine = useStore((s) => s.jumpToLine);
  const linea = cursor?.path === ruta ? cursor.line : null;
  const contenedores = linea === null ? [] : (analysis[ruta]?.symbols ?? [])
    .filter((x) => !x.menor && x.category === 'codigo' && x.line <= linea && x.endLine >= linea)
    .sort((a, b) => (b.endLine - b.line) - (a.endLine - a.line));
  const partes = ruta.split('/');
  return (
    <div className="migas" aria-label="Ubicación">
      {partes.map((p, i) => (
        <span key={`r${i}`} className={i === partes.length - 1 ? 'archivo' : 'carpeta'}>
          {p}{i < partes.length - 1 || contenedores.length ? <span className="sep">›</span> : null}
        </span>
      ))}
      {contenedores.map((x, i) => (
        <button key={x.id} className="miga" title={`${x.kind}, línea ${x.line}`} onClick={() => jumpToLine(ruta, x.line)}>
          {x.name}{i < contenedores.length - 1 && <span className="sep">›</span>}
        </button>
      ))}
    </div>
  );
}
