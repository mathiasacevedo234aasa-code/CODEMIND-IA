import { api } from '../../lib/api';
import type { ObtenerTienda, PonerTienda, Tienda } from '../tipos';

/** Memoria del proyecto (decisiones y avances) y ajustes, incluidas las claves de la IA. */

export const crearMemoriaAjustes = (set: PonerTienda, get: ObtenerTienda) => ({
  async saveMemory(memory) {
    const project = get().project;
    if (!project) return;
    const res = await api.saveMemory(project.id, memory);
    set({ memory: res.memory });
    get().log('documentacion', 'info', 'Memoria del proyecto actualizada.');
  },

  async addDecision(title, rationale) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.addDecision(project.id, title, rationale);
    set({ memory });
  },

  async removeDecision(id) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.removeDecision(project.id, id);
    set({ memory });
  },

  async addProgress(title, detail, state) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.addProgress(project.id, title, detail, state);
    set({ memory });
  },

  async updateProgress(id, patch) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.updateProgress(project.id, id, patch);
    set({ memory });
  },

  async removeProgress(id) {
    const project = get().project;
    if (!project) return;
    const { memory } = await api.removeProgress(project.id, id);
    set({ memory });
  },

  // ------------------------------------------------------------- ajustes

  async saveSettings(patch) {
    const anterior = get().settings.proveedor;
    const { settings } = await api.saveSettings({ ...get().settings, ...patch });
    set({ settings });
    // Al cambiar de servicio de IA cambia tambien si esta listo para usarse y
    // como se llama: sin esto, la aplicacion seguia diciendo el nombre viejo.
    if (settings.proveedor !== anterior) {
      await get().refreshConnections();
      get().log('sistema', 'info', `Servicio de IA: ${get().proveedorNombre}.`);
    }
  },

  async saveApiKey(key, proveedor) {
    await api.saveApiKey(key, proveedor);
    set((s) => ({
      claves: { ...s.claves, [proveedor]: { configured: true, source: 'guardada' } },
      apiKeyConfigured: proveedor === s.settings.proveedor ? true : s.apiKeyConfigured,
    }));
    const nombre = get().proveedores.find((p) => p.id === proveedor)?.nombre ?? proveedor;
    get().log('sistema', 'info', `Clave de ${nombre} guardada en el backend (no se muestra de nuevo).`);
  },

  async clearApiKey(proveedor) {
    const { apiKey } = await api.clearApiKey(proveedor);
    set((s) => ({
      claves: { ...s.claves, [proveedor]: apiKey },
      apiKeyConfigured: proveedor === s.settings.proveedor ? apiKey.configured : s.apiKeyConfigured,
    }));
  },
}) satisfies Partial<Tienda>;
