import { tipoMedio } from '../../lib/medios';
import { esBorrador } from '../../lib/borrador';
import { formatear, sePuedeFormatear } from '../../lib/formatear';
import { api } from '../../lib/api';
import { GRUPOS, panelDe } from '../../lib/types';
import { analizarArchivo, forgetFile, isAnalyzable } from '../../lib/analyzer';
import type { PanelEditor } from '../../lib/types';
import type { ObtenerTienda, PonerTienda, Tienda } from '../tipos';

/** Pestañas, paneles del editor y archivos: abrir, editar, guardar, crear, renombrar y borrar. */

/**
 * Temporizadores de autoguardado, uno por archivo. Viven fuera del estado:
 * son detalles de ejecucion, no informacion que la interfaz deba pintar.
 */
const autoSaveTimers = new Map<string, number>();
const fileTabId = (path: string) => `file:${path}`;

/** Rutas de las pestañas cerradas, la última al final, para Ctrl+Shift+T. */
const cerradas: string[] = [];

export const crearPestanas = (set: PonerTienda, get: ObtenerTienda) => ({
  async openFile(path) {
    const project = get().project;
    if (!project) return;
    const id = fileTabId(path);

    if (get().files[path]) {
      set((s) => ({
        activeTabId: id,
        ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
        tabs: s.tabs.some((t) => t.id === id)
          ? s.tabs
          : [...s.tabs, { kind: 'file', id, path, panel: s.panelActivo }],
      }));
      return;
    }
    // Imágenes, PDF, fuentes...: se ven, no se leen como texto.
    const abrirSinTexto = (vista: 'medio' | 'tramos') => set((s) => ({
      files: { ...s.files, [path]: { content: '', saved: '', vista } },
      tabs: s.tabs.some((t) => t.id === id) ? s.tabs : [...s.tabs, { kind: 'file', id, path, panel: s.panelActivo }],
      activeTabId: id,
      ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
    }));
    if (tipoMedio(path)) {
      abrirSinTexto('medio');
      get().persistSession();
      return;
    }
    try {
      const { content } = esBorrador(path) ? await api.leerBorrador(project.id) : await api.readFile(project.id, path);
      set((s) => ({
        files: { ...s.files, [path]: { content, saved: content } },
        tabs: s.tabs.some((t) => t.id === id)
          ? s.tabs
          : [...s.tabs, { kind: 'file', id, path, panel: s.panelActivo }],
        activeTabId: id,
        ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
      }));
      if (isAnalyzable(path)) {
        const analisis = await analizarArchivo(path, content);
        set((s) => ({ analysis: { ...s.analysis, [path]: analisis } }));
      }
      get().persistSession();
    } catch (err) {
      // Más de 2 MB: se abre por tramos, de solo lectura, en vez de no abrirlo.
      if (/demasiado grande/i.test((err as Error).message)) {
        abrirSinTexto('tramos');
        get().persistSession();
        return;
      }
      set({ error: (err as Error).message });
    }
  },

  openWebTab(url, title) {
    const id = `web:${url}`;
    set((s) => {
      const existing = s.tabs.find((t) => t.id === id);
      if (existing) return { activeTabId: id };
      return {
        tabs: [...s.tabs, { kind: 'web', id, url, title: title || url, panel: s.panelActivo }],
        activeTabId: id,
        ultimoPorPanel: { ...s.ultimoPorPanel, [s.panelActivo]: id },
      };
    });
    get().log('procesos', 'info', `Abierto en el navegador integrado: ${url}`);
    get().persistSession();
  },

  updateWebTab(id, url) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.kind === 'web' ? { ...t, url } : t)),
    }));
  },

  closeTab(id) {
    const cerrada = get().tabs.find((t) => t.id === id);
    if (cerrada?.kind === 'file') {
      cerradas.push(cerrada.path);
      if (cerradas.length > 20) cerradas.shift();
    }
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const closed = s.tabs.find((t) => t.id === id);
      const files = { ...s.files };
      // El archivo solo se descarga de memoria si no queda abierto en la otra
      // mitad: con el editor dividido puede estar en las dos.
      if (closed?.kind === 'file' && !tabs.some((t) => t.kind === 'file' && t.path === closed.path)) {
        delete files[closed.path];
      }
      // El relevo se busca en la misma mitad: cerrar algo de la derecha no
      // debe saltar el foco a la izquierda.
      const mitad = panelDe(closed);
      const vecinas = tabs.filter((t) => panelDe(t) === mitad);
      const relevo = vecinas[vecinas.length - 1] ?? tabs[tabs.length - 1] ?? null;

      const ultimoPorPanel = { ...s.ultimoPorPanel };
      if (ultimoPorPanel[mitad] === id) ultimoPorPanel[mitad] = vecinas[vecinas.length - 1]?.id ?? null;

      return {
        tabs,
        files,
        ultimoPorPanel,
        // Si la mitad derecha se queda vacia, el foco vuelve a la izquierda.
        panelActivo: tabs.some((t) => panelDe(t) === s.panelActivo) ? s.panelActivo : 'a',
        activeTabId: s.activeTabId === id ? relevo?.id ?? null : s.activeTabId,
      };
    });
    get().persistSession();
  },

  setActiveTab: (id) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      const mitad = panelDe(tab);
      return {
        activeTabId: id,
        panelActivo: mitad,
        ultimoPorPanel: { ...s.ultimoPorPanel, [mitad]: id },
      };
    });
    get().persistSession();
  },

  /**
   * Manda la pestana activa a la otra mitad. Es el gesto de "quiero ver estos
   * dos archivos a la vez": la plantilla y su hoja de estilos, el codigo y su
   * prueba, el archivo y su documentacion.
   */
  fijarTab(id: string) {
    set((s) => {
      const tabs = s.tabs.map((t) => (t.id === id && t.kind === 'file' ? { ...t, fijada: !t.fijada } : t));
      // Las fijadas primero, conservando el orden relativo de cada grupo.
      const fijo = (t: (typeof tabs)[number]) => (t.kind === 'file' && t.fijada ? 0 : 1);
      return { tabs: [...tabs].sort((a, b) => fijo(a) - fijo(b)) };
    });
    get().persistSession();
  },

  async reabrirCerrada() {
    // La más reciente que no esté ya abierta.
    while (cerradas.length) {
      const ruta = cerradas.pop()!;
      if (get().tabs.some((t) => t.kind === 'file' && t.path === ruta)) continue;
      await get().openFile(ruta);
      return;
    }
  },

  dividirEditor() {
    const { activeTabId, tabs } = get();
    const actual = tabs.find((t) => t.id === activeTabId);
    if (!actual) return;
    // Un grupo nuevo a la derecha mientras quepan (hasta 4); con los cuatro
    // en uso, al siguiente, en círculo.
    const enUso = GRUPOS.filter((g) => g === 'a' || tabs.some((t) => panelDe(t) === g));
    const libre = GRUPOS.find((g) => !enUso.includes(g));
    const siguiente = enUso[(enUso.indexOf(panelDe(actual)) + 1) % enUso.length];
    get().moverTabAPanel(actual.id, libre ?? siguiente);
  },

  cerrarGrupo(panel: PanelEditor) {
    if (panel === 'a') return;
    set((s) => ({
      tabs: s.tabs.map((t) => (panelDe(t) === panel ? { ...t, panel: 'a' as PanelEditor } : t)),
      panelActivo: s.panelActivo === panel ? 'a' : s.panelActivo,
      ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: null },
    }));
    get().persistSession();
  },

  moverTabAPanel(id, panel) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, panel } : t)),
      activeTabId: id,
      panelActivo: panel,
      ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: id },
    }));
    get().persistSession();
  },

  /** Deshace la division: todo vuelve a una sola mitad, sin cerrar nada. */
  unirEditor() {
    set((s) => ({
      tabs: s.tabs.map((t) => ({ ...t, panel: 'a' as PanelEditor })),
      panelActivo: 'a',
      ultimoPorPanel: { a: s.activeTabId, b: null, c: null, d: null },
    }));
    get().persistSession();
  },

  /**
   * Mueve el foco a una mitad del editor.
   *
   * Si la pestana que ya esta activa vive en esa mitad, NO se toca: lo unico
   * que cambia es donde se abrira lo siguiente. Esto importaba mucho mas de lo
   * que parece. Antes se reactivaba siempre "la ultima pestana usada en esta
   * mitad", y como el editor llama aqui al recibir el foco, bastaba con hacer
   * clic dentro para que saltara a otro archivo: la pulsacion se iba con el
   * editor viejo y lo que escribias no llegaba a ninguna parte. Pasaba sobre
   * todo al recuperar una sesion, donde la pestana activa y la ultima abierta
   * casi nunca coinciden.
   */
  setTerminalSesion: (id) => set({ terminalSesionId: id }),

  setSymbolSeleccionado: (id) => set({ symbolSeleccionado: id }),

  verDocumentacion: (symbolId) =>
    set({ symbolSeleccionado: symbolId, rightTab: 'documentacion', rightOpen: true }),

  setPanelActivo: (panel) =>
    set((s) => {
      const actual = s.tabs.find((t) => t.id === s.activeTabId);
      if (actual && panelDe(actual) === panel) {
        return { panelActivo: panel, ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: actual.id } };
      }
      const suya = s.tabs.find((t) => t.id === s.ultimoPorPanel[panel] && panelDe(t) === panel)
        ?? s.tabs.filter((t) => panelDe(t) === panel).at(-1);
      return {
        panelActivo: panel,
        activeTabId: suya?.id ?? s.activeTabId,
        ultimoPorPanel: { ...s.ultimoPorPanel, [panel]: suya?.id ?? s.ultimoPorPanel[panel] },
      };
    }),

  editFile(path, content) {
    set((s) => ({ files: { ...s.files, [path]: { ...s.files[path], content } } }));
    if (isAnalyzable(path)) {
      // El análisis corre en local, en segundo plano: no se envía código a la IA.
      set((s) => ({ sources: { ...s.sources, [path]: content } }));
      void analizarArchivo(path, content).then((analisis) => {
        // Puede haber seguido escribiendo mientras se cargaba la gramática:
        // solo se guarda si este análisis es el del texto que hay ahora.
        if (get().files[path]?.content !== content) return;
        set((s) => ({ analysis: { ...s.analysis, [path]: analisis } }));
      });
    }

    // Autoguardado: se reinicia la cuenta con cada pulsacion, asi que solo
    // escribe cuando el usuario hace una pausa.
    const { autoSave, autoSaveDelay } = get().settings.editor;
    const previo = autoSaveTimers.get(path);
    if (previo) window.clearTimeout(previo);
    if (!autoSave) return;
    autoSaveTimers.set(
      path,
      window.setTimeout(() => {
        autoSaveTimers.delete(path);
        const actual = get().files[path];
        if (actual && actual.content !== actual.saved) void get().saveFile(path);
      }, Math.max(400, autoSaveDelay)),
    );
  },

  async saveFile(path, opciones = {}) {
    const project = get().project;
    const active = get().tabs.find((t) => t.id === get().activeTabId);
    const target = path ?? (active?.kind === 'file' ? active.path : null);
    if (!project || !target) return;
    const file = get().files[target];
    if (!file) return;

    set({ saving: true });
    try {
      let contenido = file.content;
      if (esBorrador(target)) {
        await api.guardarBorrador(project.id, contenido);
        set((s) => ({ files: { ...s.files, [target]: { ...s.files[target], saved: contenido } } }));
        return;
      }
      if (opciones.formatear && get().settings.editor.formatearAlGuardar && sePuedeFormatear(target)) {
        const r = await formatear(project.id, target, contenido);
        if (r.error) get().log('errores', 'warn', `${target}: no se pudo formatear (${r.error}). Se guarda tal cual.`);
        contenido = r.texto;
      }
      await api.writeFile(project.id, target, contenido);
      set((s) => ({ files: { ...s.files, [target]: { ...s.files[target], content: contenido, saved: contenido } } }));
      get().log('sistema', 'info', `Guardado: ${target}`);
    } catch (err) {
      set({ error: (err as Error).message });
      get().log('errores', 'error', `No se pudo guardar ${target}: ${(err as Error).message}`);
    } finally {
      set({ saving: false });
    }
  },

  async saveAll(opciones = {}) {
    const files = get().files;
    for (const [path, file] of Object.entries(files)) {
      if (file.content !== file.saved) await get().saveFile(path, opciones);
    }
    await get().refreshTree();
  },

  async createEntry(path, kind) {
    const project = get().project;
    if (!project) return;
    try {
      await api.createEntry(project.id, path, kind);
      await get().refreshTree();
      if (kind === 'file') await get().openFile(path);
      get().log('sistema', 'info', `Creado: ${path}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async renameEntry(from, to) {
    const project = get().project;
    if (!project) return;
    try {
      await api.rename(project.id, from, to);
      // Si es una carpeta, todo lo que hay dentro cambia de ruta también.
      const nueva = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? `${to}${p.slice(from.length)}` : p);
      forgetFile(from);
      set((s) => {
        const files: typeof s.files = {};
        for (const [ruta, f] of Object.entries(s.files)) {
          if (nueva(ruta) !== ruta) forgetFile(ruta);
          files[nueva(ruta)] = f;
        }
        const tabs = s.tabs.map((t) => (t.kind === 'file' && nueva(t.path) !== t.path
          ? { ...t, path: nueva(t.path), id: fileTabId(nueva(t.path)) }
          : t));
        const activa = s.tabs.find((t) => t.id === s.activeTabId);
        return {
          files,
          tabs,
          activeTabId: activa?.kind === 'file' && nueva(activa.path) !== activa.path ? fileTabId(nueva(activa.path)) : s.activeTabId,
        };
      });
      await get().refreshTree();
      await get().scanProject();
      get().log('sistema', 'info', `Renombrado: ${from} -> ${to}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async copyEntry(from, to) {
    const project = get().project;
    if (!project) return;
    try {
      await api.copyEntry(project.id, from, to);
      await get().refreshTree();
      await get().scanProject();
      get().log('sistema', 'info', `Copiado: ${from} -> ${to}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async deleteEntry(path) {
    const project = get().project;
    if (!project) return;
    try {
      await api.deleteEntry(project.id, path);
      forgetFile(path);
      set((s) => {
        const tabs = s.tabs.filter((t) => !(t.kind === 'file' && t.path.startsWith(path)));
        const files = { ...s.files };
        const analysis = { ...s.analysis };
        for (const key of Object.keys(files)) if (key.startsWith(path)) delete files[key];
        for (const key of Object.keys(analysis)) if (key.startsWith(path)) delete analysis[key];
        return {
          tabs,
          files,
          analysis,
          activeTabId: tabs.some((t) => t.id === s.activeTabId) ? s.activeTabId : tabs[tabs.length - 1]?.id ?? null,
        };
      });
      await get().refreshTree();
      get().log('sistema', 'info', `Eliminado: ${path}`);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}) satisfies Partial<Tienda>;
