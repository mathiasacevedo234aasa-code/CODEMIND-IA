import { api } from '../../lib/api';
import { panelDe } from '../../lib/types';
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
    try {
      const { content } = await api.readFile(project.id, path);
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
  dividirEditor() {
    const { activeTabId, tabs } = get();
    const actual = tabs.find((t) => t.id === activeTabId);
    if (!actual) return;
    const destino: PanelEditor = panelDe(actual) === 'a' ? 'b' : 'a';
    get().moverTabAPanel(actual.id, destino);
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
      ultimoPorPanel: { a: s.activeTabId, b: null },
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

  async saveFile(path) {
    const project = get().project;
    const active = get().tabs.find((t) => t.id === get().activeTabId);
    const target = path ?? (active?.kind === 'file' ? active.path : null);
    if (!project || !target) return;
    const file = get().files[target];
    if (!file) return;

    set({ saving: true });
    try {
      await api.writeFile(project.id, target, file.content);
      set((s) => ({ files: { ...s.files, [target]: { ...s.files[target], saved: file.content } } }));
      get().log('sistema', 'info', `Guardado: ${target}`);
    } catch (err) {
      set({ error: (err as Error).message });
      get().log('errores', 'error', `No se pudo guardar ${target}: ${(err as Error).message}`);
    } finally {
      set({ saving: false });
    }
  },

  async saveAll() {
    const files = get().files;
    for (const [path, file] of Object.entries(files)) {
      if (file.content !== file.saved) await get().saveFile(path);
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
      forgetFile(from);
      set((s) => {
        const files = { ...s.files };
        if (files[from]) {
          files[to] = files[from];
          delete files[from];
        }
        return {
          files,
          tabs: s.tabs.map((t) => (t.kind === 'file' && t.path === from ? { ...t, path: to, id: fileTabId(to) } : t)),
          activeTabId: s.activeTabId === fileTabId(from) ? fileTabId(to) : s.activeTabId,
        };
      });
      await get().refreshTree();
      await get().scanProject();
      get().log('sistema', 'info', `Renombrado: ${from} -> ${to}`);
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
