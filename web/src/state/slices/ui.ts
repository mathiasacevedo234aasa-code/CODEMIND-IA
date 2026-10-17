
import type { ObtenerTienda, PonerTienda, Tienda } from '../tipos';

/** Qué paneles se ven y pequeñas órdenes de la interfaz. */

export const crearUi = (set: PonerTienda, get: ObtenerTienda) => ({
  setLeftView: (view) => { set((s) => ({ leftView: view, leftOpen: s.leftView === view ? !s.leftOpen : true })); get().persistSession(); },
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  setRightTab: (tab) => set({ rightTab: tab, rightOpen: true }),
  setRightOpen: (open) => set({ rightOpen: open }),
  setBottomTab: (tab) => set({ bottomTab: tab, bottomOpen: true }),
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
  setDocCenterOpen: (open) => set({ docCenterOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setFolderPickerOpen: (open) => set({ folderPickerOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  /** Lleva el cursor a una linea concreta de un archivo ya abierto. */
  jumpToLine: (path, line) => set({ jumpTo: { path, line } }),
  refreshPreview: () => set((s) => ({ previewKey: s.previewKey + 1 })),
  setActiveProposal: (id) => set({ activeProposalId: id }),

  /** Envia una pregunta al asistente y abre su panel. */
  askAssistant: (question, contextText) =>
    set({ pendingAsk: { question, contextText }, rightTab: 'asistente', rightOpen: true }),
  clearPendingAsk: () => set({ pendingAsk: null }),
  setCursor: (c: Tienda['cursor']) => set({ cursor: c }),
  setRespaldoDoc: (r: Tienda['respaldoDoc']) => set({ respaldoDoc: r }),
}) satisfies Partial<Tienda>;
