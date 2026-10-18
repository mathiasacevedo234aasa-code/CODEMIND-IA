import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useStore } from '../state/useStore';
import { languageOf } from '../lib/analyzer';
import { fontStackOf } from '../lib/editorFonts';
import { activarEmmet } from '../lib/emmet';
import { registrarProveedores } from '../lib/proveedoresMonaco';
import { GRUPOS, panelDe, type PanelEditor as Mitad } from '../lib/types';
import { WebView } from './WebView';
import { Icon } from './Icon';
import { VistaMarkdown } from './VistaMarkdown';
import { HistorialLocal } from './HistorialLocal';
import { HistoriaGit } from './HistoriaGit';
import { Esquema } from './Esquema';
import { VisorMedio, VisorTramos } from './Visores';
import { BarraMarkdown } from './BarraMarkdown';
import { useMarcadores } from '../lib/marcadores';
import { ejecutarSeleccion } from '../lib/ejecutarSeleccion';
import { ask } from '../lib/dialogs';
import { esBorrador } from '../lib/borrador';
import { fijarEditorActivo } from '../lib/editorActivo';
import type * as Monaco from 'monaco-editor';
import { registrarTemaImportado, useTemaMonaco } from '../lib/tema';
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

  // Los grupos con alguna pestaña (el primero siempre).
  const grupos = GRUPOS.filter((g) => g === 'a' || tabs.some((t) => panelDe(t) === g));
  const dividido = grupos.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveFile(undefined, { formatear: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveFile]);

  return (
    <div className={`editor-mitades ${dividido ? 'dividido' : ''}`}>
      {grupos.map((g) => <MitadEditor key={g} mitad={g} dividido={dividido} />)}
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
  const cerrarGrupo = useStore((s) => s.cerrarGrupo);
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
  const temaMonaco = useTemaMonaco();
  const [historial, setHistorial] = useState<string | null>(null);
  const [historiaGit, setHistoriaGit] = useState<string | null>(null);
  const gitDisponible = useStore((s) => s.gitAvailable);
  const [verEsquema, setVerEsquema] = useState(false);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const marcas = useRef<string[]>([]);
  const projectId = useStore((s) => s.project?.id);
  const analysisMarcas = useStore((s) => s.analysis);
  const approvedMarcas = useStore((s) => s.approved);
  const marcadores = useMarcadores((s) => s.lista);
  const glifos = useRef<{ id: string; linea: number }[]>([]);
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
    monacoRef.current = monaco;
    setMontajes((n) => n + 1);
    fijarEditorActivo(editor);
    editor.onDidFocusEditorText(() => fijarEditorActivo(editor));

    // Cursor y scroll se recuerdan por archivo: al volver a abrirlo, todo
    // está donde lo dejaste (salvo que se pida saltar a una línea concreta).
    const rutaVista = active?.kind === 'file' ? active.path : null;
    const claveVista = rutaVista && projectId ? `codemind.vista.${projectId}.${rutaVista}` : null;
    if (claveVista) {
      try {
        const guardada = localStorage.getItem(claveVista);
        if (guardada) editor.restoreViewState(JSON.parse(guardada));
      } catch { /* sin almacenamiento o estado viejo: se empieza arriba */ }
      let espera: number | undefined;
      const guardarVista = () => {
        window.clearTimeout(espera);
        espera = window.setTimeout(() => {
          try { localStorage.setItem(claveVista, JSON.stringify(editor.saveViewState())); } catch { /* sin almacenamiento */ }
        }, 400);
      };
      editor.onDidChangeCursorPosition(guardarVista);
      editor.onDidScrollChange(guardarVista);
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveFile(undefined, { formatear: true }));
    editor.onDidFocusEditorText(() => setPanelActivo(mitad));
    // La posición del cursor la usan las migas y la barra de estado.
    const rutaMontada = active?.kind === 'file' ? active.path : null;
    const avisarCursor = () => {
      const p = editor.getPosition();
      if (rutaMontada && p && editor.hasTextFocus()) setCursor({ path: rutaMontada, line: p.lineNumber, column: p.column, cursores: editor.getSelections()?.length ?? 1 });
    };
    editor.onDidChangeCursorPosition(avisarCursor);
    editor.onDidFocusEditorText(avisarCursor);

    // Emmet: html:5, ul>li*3, div.clase... Se activa una sola vez por sesión.
    if (emmetActivo) activarEmmet(monaco);

    // "Explícame esto" sobre cualquier trozo de código, no solo funciones
    // detectadas. Aparece en el menú contextual y tiene atajo propio.
    // Marcadores: Ctrl+Alt+K marca o desmarca la línea; con Mayúsculas, con nota.
    const lineaActual = () => editor.getPosition()?.lineNumber ?? 1;
    editor.addAction({
      id: 'codemind.marcador',
      label: 'Marcar o desmarcar esta línea',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyK],
      run: () => { if (rutaMontada) useMarcadores.getState().alternar(rutaMontada, lineaActual()); },
    });
    editor.addAction({
      id: 'codemind.marcador-nota',
      label: 'Marcar esta línea con una nota…',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyK],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.7,
      run: async () => {
        if (!rutaMontada) return;
        const linea = lineaActual();
        const previa = useMarcadores.getState().lista.find((m) => m.ruta === rutaMontada && m.linea === linea);
        const nota = await ask({ title: 'Nota del marcador', label: `${rutaMontada}:${linea}`, value: previa?.nota ?? '', confirmText: 'Guardar', allowEmpty: true });
        if (nota !== null) useMarcadores.getState().alternar(rutaMontada, linea, nota);
      },
    });
    // Siguiente / anterior marcador, en todo el proyecto.
    const saltar = (paso: 1 | -1) => {
      const lista = [...useMarcadores.getState().lista].sort((a, b) => a.ruta.localeCompare(b.ruta) || a.linea - b.linea);
      if (!lista.length || !rutaMontada) return;
      const aqui = lista.findIndex((m) => m.ruta.localeCompare(rutaMontada) * paso > 0 || (m.ruta === rutaMontada && (m.linea - lineaActual()) * paso > 0));
      const destino = paso === 1 ? lista[aqui === -1 ? 0 : aqui] : [...lista].reverse().find((m) => m.ruta.localeCompare(rutaMontada) < 0 || (m.ruta === rutaMontada && m.linea < lineaActual())) ?? lista[lista.length - 1];
      const st = useStore.getState();
      void st.openFile(destino.ruta).then(() => st.jumpToLine(destino.ruta, destino.linea));
    };
    editor.addAction({ id: 'codemind.marcador-siguiente', label: 'Ir al siguiente marcador', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL], run: () => saltar(1) });
    editor.addAction({ id: 'codemind.marcador-anterior', label: 'Ir al marcador anterior', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyJ], run: () => saltar(-1) });
    // Mientras se escribe, los marcadores siguen a su línea.
    editor.onDidChangeModelContent(() => {
      const modelo = editor.getModel();
      if (!modelo || !rutaMontada || !glifos.current.length) return;
      const cambios = glifos.current
        .map((g) => ({ antes: g.linea, ahora: modelo.getDecorationRange(g.id)?.startLineNumber ?? g.linea }))
        .filter((c) => c.antes !== c.ahora);
      if (cambios.length) {
        glifos.current = glifos.current.map((g) => ({ ...g, linea: cambios.find((c) => c.antes === g.linea)?.ahora ?? g.linea }));
        useMarcadores.getState().recolocar(rutaMontada, cambios);
      }
    });

    // Ejecutar solo la selección (o la línea) en el Terminal.
    editor.addAction({
      id: 'codemind.ejecutar-seleccion',
      label: 'Ejecutar la selección en el Terminal',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.8,
      run: (ed) => {
        const sel = ed.getSelection();
        const modelo = ed.getModel();
        if (!sel || !modelo) return;
        const texto = sel.isEmpty() ? modelo.getLineContent(sel.startLineNumber) : modelo.getValueInRange(sel);
        void ejecutarSeleccion(texto);
      },
    });

    // Renombrar en todo el proyecto, con vista previa (F2).
    editor.addAction({
      id: 'codemind.renombrar',
      label: 'Renombrar en todo el proyecto…',
      keybindings: [monaco.KeyCode.F2],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      run: (ed) => {
        const pos = ed.getPosition();
        const palabra = pos ? ed.getModel()?.getWordAtPosition(pos)?.word : null;
        if (palabra) window.dispatchEvent(new CustomEvent('codemind:renombrar', { detail: palabra }));
      },
    });
    // Cuántos cursores hay: con varios, la barra de estado lo dice y recuerda Esc.
    editor.onDidChangeCursorSelection(() => {
      const n = editor.getSelections()?.length ?? 1;
      const c = useStore.getState().cursor;
      if (c && (c.cursores ?? 1) !== n) useStore.getState().setCursor({ ...c, cursores: n });
    });

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
      const todos = monaco.editor.getModelMarkers({ resource: model.uri });
      // Al panel de problemas van errores y avisos; las pistas, no.
      useStore.getState().setMarcadores(model.uri.path.slice(1), todos
        .filter((m) => m.severity >= monaco.MarkerSeverity.Warning)
        .map((m) => ({
          nivel: m.severity === monaco.MarkerSeverity.Error ? 'error' as const : 'aviso' as const,
          linea: m.startLineNumber,
          mensaje: m.message,
        })));
      const errors = todos.filter((m) => m.severity === monaco.MarkerSeverity.Error);
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
  // Marcas en el minimapa y en la regla lateral: verde lo documentado, naranja
  // lo que cambió desde que se documentó. Se ve de un vistazo dónde mirar.
  useEffect(() => {
    const montado = editorRef.current;
    const monaco = monacoRef.current;
    if (!montado || !monaco || active?.kind !== 'file' || montado.path !== active.path) return;
    const st = useStore.getState();
    const nuevas = (analysisMarcas[active.path]?.symbols ?? [])
      .filter((x) => !x.menor && st.statusOf(x) !== 'sin-documentar')
      .map((x) => {
        const color = st.statusOf(x) === 'revisar' ? '#d9a441' : '#3fb984';
        return {
          range: new monaco.Range(x.line, 1, x.line, 1),
          options: {
            isWholeLine: true,
            minimap: { color, position: monaco.editor.MinimapPosition.Inline },
            overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Left },
          },
        };
      });
    marcas.current = montado.editor.deltaDecorations(marcas.current, nuevas);
  }, [analysisMarcas, approvedMarcas, active, montajes]);

  // Los marcadores, como estrella en el margen (con su nota al pasar el cursor).
  useEffect(() => {
    const montado = editorRef.current;
    const monaco = monacoRef.current;
    if (!montado || !monaco || active?.kind !== 'file' || montado.path !== active.path) return;
    const propios = marcadores.filter((m) => m.ruta === active.path);
    const ids = montado.editor.deltaDecorations(glifos.current.map((g) => g.id), propios.map((m) => ({
      range: new monaco.Range(m.linea, 1, m.linea, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'marcador-glifo',
        glyphMarginHoverMessage: { value: m.nota ? `★ ${m.nota}` : '★ Marcador (Ctrl+Alt+K para quitarlo)' },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        overviewRuler: { color: '#5b8cff', position: monaco.editor.OverviewRulerLane.Right },
        minimap: { color: '#5b8cff', position: monaco.editor.MinimapPosition.Gutter },
      },
    })));
    glifos.current = ids.map((id, i) => ({ id, linea: propios[i].linea }));
  }, [marcadores, active, montajes]);

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
          const label = tab.kind === 'file' ? (esBorrador(tab.path) ? 'Borrador' : tab.path.split('/').pop()) : tab.title;
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
        {active?.kind === 'file' && esConfiguracion(active.path) && (
          <button
            className="btn sm outline"
            title="La IA explica para qué sirve cada parte de este archivo (no lo cambia)"
            onClick={() => explicarConfiguracion(active.path, activeFile?.content ?? '')}
          >
            Explicar
          </button>
        )}
        {active?.kind === 'file' && (
          <button className={`btn icon sm ${verEsquema ? 'activo' : ''}`} title="Esquema del archivo" onClick={() => setVerEsquema((v) => !v)}>
            <Icon name="fn" size={13} />
          </button>
        )}
        {active?.kind === 'file' && !esBorrador(active.path) && (
          <button className="btn icon sm" title="Historial local: versiones anteriores de este archivo" onClick={() => setHistorial(active.path)}>
            <Icon name="history" size={13} />
          </button>
        )}
        {historial && <HistorialLocal ruta={historial} alCerrar={() => setHistorial(null)} />}
        {active?.kind === 'file' && gitDisponible && !esBorrador(active.path) && !activeFile?.vista && (
          <button className="btn icon sm" title="Historia en git: commits y quién escribió cada línea (blame)" onClick={() => setHistoriaGit(active.path)}>
            <Icon name="git" size={13} />
          </button>
        )}
        {historiaGit && <HistoriaGit ruta={historiaGit} alCerrar={() => setHistoriaGit(null)} />}
        {enfocada && <BotonEjecutarArchivo />}
        {active && (
          <button
            className="btn icon sm"
            title={!dividido ? 'Dividir el editor: ver dos archivos a la vez' : 'Mandar esta pestaña a un grupo nuevo a la derecha (hasta 4)'}
            onClick={() => { setActiveTab(active.id); dividirEditor(); }}
          >
            <Icon name="columns" size={13} />
          </button>
        )}
        {dividido && mitad !== 'a' && (
          <button className="btn icon sm" title="Cerrar este grupo (sus pestañas pasan al primero; no se cierra ninguna)" onClick={() => cerrarGrupo(mitad)}>
            <Icon name="close" size={13} />
          </button>
        )}
      </div>

      {active?.kind === 'file' && <Migas ruta={active.path} />}
      {active?.kind === 'file' && /\.(md|mdx|markdown)$/i.test(active.path) && !activeFile?.vista && <BarraMarkdown />}
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
        ) : activeFile?.vista === 'medio' ? (
          <VisorMedio ruta={active.path} />
        ) : activeFile?.vista === 'tramos' ? (
          <VisorTramos ruta={active.path} />
        ) : activeFile ? (
          <Editor
            key={`${mitad}:${active.path}`}
            height="100%"
            theme={temaMonaco}
            beforeMount={registrarTemaImportado}
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
              wordWrap: ajusteDeLinea(active.path, settings.editor) ? 'on' : 'off',
              glyphMargin: true,
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
        {verEsquema && active?.kind === 'file' && <Esquema ruta={active.path} alCerrar={() => setVerEsquema(false)} />}
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

/**
 * Ajuste de línea por tipo de archivo: las listas de Configuración mandan
 * sobre el ajuste general (p. ej. siempre en .md, nunca en .csv).
 */
function ajusteDeLinea(ruta: string, editor: { wordWrap: boolean; ajusteSiempre?: string; ajusteNunca?: string }) {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? '';
  const lista = (t?: string) => (t ?? '').split(',').map((x) => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  if (lista(editor.ajusteNunca).includes(ext)) return false;
  if (lista(editor.ajusteSiempre).includes(ext)) return true;
  return editor.wordWrap;
}

/** Archivos de configuración que merece la pena poder explicar de un clic. */
function esConfiguracion(ruta: string) {
  const n = (ruta.split('/').pop() ?? '').toLowerCase();
  return /^(package\.json|tsconfig.*\.json|jsconfig\.json|\.eslintrc.*|eslint\.config\..*|\.prettierrc.*|vite\.config\..*|webpack\.config\..*|babel\.config\..*|docker-compose.*\.ya?ml|dockerfile|\.gitignore|\.editorconfig|pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod|composer\.json|pom\.xml|build\.gradle.*|\.env\.example)$/i.test(n);
}

function explicarConfiguracion(ruta: string, contenido: string) {
  useStore.getState().askAssistant(
    `Explica ${ruta.split('/').pop()}: para qué sirve cada sección, opción o script, en el orden en que aparecen, y qué efecto tiene en el proyecto. No propongas cambios.`,
    `Archivo ${ruta}:
\`\`\`
${contenido.slice(0, 15000)}
\`\`\``,
  );
}
