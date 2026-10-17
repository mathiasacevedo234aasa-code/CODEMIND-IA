import { api } from '../../lib/api';
import { panelDe } from '../../lib/types';
import type { LeftView, ObtenerTienda, PonerTienda, Tienda } from '../tipos';

/** Arranque, proyectos, árbol de archivos y sesión. */

let sessionTimer: number | null = null;

export const crearProyecto = (set: PonerTienda, get: ObtenerTienda) => ({
  log: (channel, level, message) =>
    set((s) => ({
      logs: [
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), channel, level, message },
        ...s.logs,
      ].slice(0, 400),
    })),

  setError: (message) => set({ error: message }),

  async boot() {
    try {
      const [{ projects }, settingsRes, health] = await Promise.all([
        api.listProjects(),
        api.settings(),
        api.health(),
      ]);
      set({
        projects,
        settings: settingsRes.settings,
        defaultModel: settingsRes.defaultModel,
        apiKeyConfigured: settingsRes.apiKey.configured,
        proveedores: settingsRes.proveedores,
        claves: settingsRes.claves,
        proveedorNombre: health.ia.nombre,
        gitAvailable: health.git?.available ?? false,
        githubConfigured: health.github?.configured ?? false,
      });
      get().log(
        'sistema',
        health.ia.configured ? 'info' : 'warn',
        health.ia.configured
          ? `Backend conectado. ${health.ia.nombre} listo (clave: ${health.ia.source}).`
          : `Backend conectado, pero ${health.ia.nombre} no está configurado. Ve a Configuración para documentar.`,
      );
      if (!health.git?.available) {
        get().log('git', 'warn', 'Git no está disponible en este equipo: el control de versiones queda desactivado.');
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async refreshConnections() {
    try {
      const health = await api.health();
      set({
        gitAvailable: health.git?.available ?? false,
        githubConfigured: health.github?.configured ?? false,
        apiKeyConfigured: health.ia.configured,
        proveedorNombre: health.ia.nombre,
      });
    } catch {
      /* el aviso de conexión perdida ya lo da cada panel */
    }
  },

  async createProject(name, objective, root = null, plantilla = null) {
    const { project, plantilla: res } = await api.createProject(name, objective, root, plantilla);
    set((s) => ({ projects: [project, ...s.projects] }));
    await get().openProject(project.id);
    if (res) {
      get().log('sistema', 'info', `Plantilla: ${res.escritos.length} archivo(s) creados${res.respetados.length ? `; ya existían y no se tocaron: ${res.respetados.join(', ')}` : ''}.`);
    }
  },

  async openProject(id) {
    set({ loadingProject: true, error: null });
    try {
      const [{ project }, treeRes, docs, { memory }, sessionRes] = await Promise.all([
        api.updateProject(id, {}),
        api.tree(id),
        api.docs(id),
        api.memory(id),
        api.session(id).catch(() => ({ session: { tabs: [], activeTabId: null, leftView: 'explorador' } })),
      ]);
      set({
        project,
        tree: treeRes.tree,
        treeTruncated: treeRes.truncated,
        approved: docs.approved,
        proposals: docs.proposals,
        memory,
        tabs: [],
        activeTabId: null,
        files: {},
        analysis: {},
        sources: {},
        relinks: [],
        activeProposalId: docs.proposals[0]?.id ?? null,
        leftView: (sessionRes.session.leftView as LeftView) || 'explorador',
      });
      get().log('sistema', 'info', `Proyecto abierto: ${project.name}${project.root ? ` (${project.root})` : ''}`);
      if (treeRes.truncated) {
        get().log('sistema', 'warn', 'La carpeta es muy grande: el explorador muestra solo una parte del árbol.');
      }
      await get().scanProject();
      await get().refreshConnections();
      await get().restoreSession(sessionRes.session);
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ loadingProject: false });
    }
  },

  /** Reabre las pestanas de la ultima vez, descartando lo que ya no exista. */
  async restoreSession(session) {
    const guardadas = session?.tabs ?? [];
    if (!guardadas.length) return;

    for (const tab of guardadas) {
      // Cada pestana vuelve a la mitad en la que estaba.
      set({ panelActivo: panelDe(tab) });
      if (tab.kind === 'file') {
        await get().openFile(tab.path);
        // Y si estaba fijada, sigue fijada.
        if (tab.fijada) {
          set((st) => ({ tabs: st.tabs.map((t) => (t.kind === 'file' && t.path === tab.path ? { ...t, fijada: true } : t)) }));
        }
      } else if (tab.kind === 'web') get().openWebTab(tab.url, tab.title);
    }
    set({ panelActivo: 'a' });
    // El id guardado puede ya no existir si ese archivo se borro fuera.
    const restaurada = get().tabs.find((t) => t.id === session.activeTabId);
    if (restaurada) {
      // Hay que dejar tambien "la ultima de cada mitad" apuntando aqui. Si no,
      // seguiria senalando al ultimo archivo abierto por el bucle de arriba, y
      // al hacer clic en el editor el foco saltaria a ese otro archivo.
      set((s) => ({
        activeTabId: restaurada.id,
        panelActivo: panelDe(restaurada),
        ultimoPorPanel: { ...s.ultimoPorPanel, [panelDe(restaurada)]: restaurada.id },
      }));
    }

    const recuperadas = get().tabs.length;
    if (recuperadas) {
      get().log('sistema', 'info', `Sesion recuperada: ${recuperadas} pestana(s) reabiertas.`);
    }
  },

  /** Guarda que pestanas hay abiertas, con retardo para no escribir en cada clic. */
  persistSession() {
    const project = get().project;
    if (!project) return;
    if (sessionTimer) window.clearTimeout(sessionTimer);
    sessionTimer = window.setTimeout(() => {
      const { tabs, activeTabId, leftView } = get();
      void api.saveSession(project.id, { tabs, activeTabId, leftView }).catch(() => {
        /* perder la sesion de la interfaz no merece molestar al usuario */
      });
    }, 800);
  },

  closeProject() {
    set({
      project: null, tree: [], tabs: [], activeTabId: null, files: {},
      analysis: {}, approved: {}, proposals: [], memory: null,
    });
  },

  async deleteProject(id) {
    await api.deleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      project: s.project?.id === id ? null : s.project,
    }));
  },

  async saveProjectMeta(patch) {
    const project = get().project;
    if (!project) return;
    const { project: updated } = await api.updateProject(project.id, patch);
    set((s) => ({ project: updated, projects: s.projects.map((p) => (p.id === updated.id ? updated : p)) }));
  },

  async refreshTree() {
    const project = get().project;
    if (!project) return;
    try {
      const res = await api.tree(project.id);
      set({ tree: res.tree, treeTruncated: res.truncated });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}) satisfies Partial<Tienda>;
