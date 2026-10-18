import { esFalloDelServicio, siguienteProveedor } from '../../lib/respaldo';
import { api } from '../../lib/api';
import type { ObtenerTienda, PonerTienda, Tienda } from '../tipos';

/** Documentación: generar propuestas, la cola de un archivo entero, aprobar, editar y retirar. */

export const crearDocumentacion = (set: PonerTienda, get: ObtenerTienda) => ({
  async generateDoc(sym, extraInstruction, opciones = {}) {
    const project = get().project;
    if (!project) return 'sin proyecto';
    set({ generating: true, error: null });
    get().log('documentacion', 'info', `Solicitando explicación de ${sym.name} (${sym.filePath})...`);
    try {
      const fileAnalysis = get().analysis[sym.filePath];
      const open = get().files[sym.filePath];
      const surrounding = open
        ? open.content.split('\n').slice(Math.max(0, sym.line - 16), sym.endLine + 10).join('\n').slice(0, 4000)
        : undefined;

      const result = await api.document({
        projectId: project.id,
        code: sym.code,
        extraInstruction,
        // "Regenerar" pide otra respuesta aunque el código no haya cambiado.
        forzar: Boolean(opciones.forzar),
        proveedor: opciones.proveedor,
        context: {
          functionId: sym.id,
          filePath: sym.filePath,
          language: sym.language,
          lineStart: sym.line,
          kind: sym.kind,
          category: sym.category,
          detail: sym.detail,
          relatedFunctions: fileAnalysis?.symbols.filter((f) => f.id !== sym.id).map((f) => f.qualifiedName) ?? [],
          imports: fileAnalysis?.imports ?? [],
          classes: fileAnalysis?.classes ?? [],
          surrounding,
        },
      });

      if (result.cacheado) {
        get().log('documentacion', 'info', `${sym.name}: mismo código y mismas opciones que la última vez; se reutilizó aquella respuesta sin llamar a la IA.`);
      }

      if (!result.ok || !result.doc) {
        const detail = result.problems?.join(' ') || 'La respuesta no tiene el formato esperado.';
        get().log('documentacion', 'error', `Respuesta inválida para ${sym.name}: ${detail}`);
        if (!opciones.enCola) {
          set({ error: `La IA devolvió una respuesta incompleta y no se guardó. ${detail} Puedes volver a solicitarla.` });
        }
        return 'invalida';
      }

      const { proposals } = await api.saveProposal(project.id, {
        functionId: sym.id,
        name: sym.name,
        filePath: sym.filePath,
        codeHash: sym.codeHash,
        code: sym.code,
        kind: sym.kind,
        doc: result.doc,
        model: result.model,
      });
      // En cola no se salta a Revisión con cada propuesta: se haría
      // imposible mirar nada mientras se generan las demás.
      set(opciones.enCola
        ? { proposals }
        : {
            proposals,
            activeProposalId: proposals.find((p) => p.functionId === sym.id)?.id ?? null,
            rightTab: 'revision',
            rightOpen: true,
          });
      get().log('documentacion', 'info', `Propuesta generada para ${sym.name}. Pendiente de tu aprobación.`);
      return 'ok';
    } catch (err) {
      const mensaje = (err as Error).message;
      if (!opciones.enCola) {
        // Si el fallo es del servicio, se ofrece otro proveedor configurado.
        const otro = esFalloDelServicio(mensaje) ? siguienteProveedor(opciones.proveedor) : null;
        set({
          error: mensaje,
          respaldoDoc: otro ? { sym, extra: extraInstruction, proveedor: otro.id, nombre: otro.nombre } : null,
        });
      }
      get().log('documentacion', 'error', mensaje);
      return mensaje;
    } finally {
      set({ generating: false });
    }
  },

  colaDoc: null,

  /**
   * Documenta todo lo pendiente de un archivo, de uno en uno.
   *
   * De uno en uno a propósito: en paralelo se tropieza enseguida con el
   * límite de peticiones del proveedor, y además así se puede cancelar a
   * medias sin dejar nada a medio guardar. Cada propuesta queda en Revisión
   * como siempre: documentar en lote no aprueba nada.
   */
  async documentarArchivo(ruta, opciones = {}) {
    if (get().colaDoc?.activa) return;
    const carpeta = Boolean(opciones.carpeta);
    // Una carpeta incluye todo lo de dentro, subcarpetas incluidas; '' es el
    // proyecto entero.
    const dentro = (p: string) => (carpeta ? !ruta || p.startsWith(`${ruta}/`) : p === ruta);
    // Con `desactualizados`, también lo aprobado cuyo código cambió después.
    const pendientes = get().symbols().filter((x) =>
      dentro(x.filePath)
      && !x.menor
      && (!get().approved[x.id] || (opciones.desactualizados && get().statusOf(x) === 'revisar'))
      && !get().proposals.some((p) => p.functionId === x.id));

    if (!pendientes.length) {
      get().log('documentacion', 'info', `En ${ruta} no queda nada sin documentar ni pendiente de revisar.`);
      return;
    }

    set({ colaDoc: { activa: true, ruta, carpeta, total: pendientes.length, hechos: 0, fallidos: [], actual: null, cancelada: false, pausada: false, motivoParada: null } });
    get().log('documentacion', 'info', `Documentando ${pendientes.length} elemento(s) de ${ruta}, uno detrás de otro.`);

    for (const sym of pendientes) {
      // En pausa no se pide nada nuevo; se espera aquí hasta reanudar o cancelar.
      while (get().colaDoc?.pausada && !get().colaDoc?.cancelada) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (get().colaDoc?.cancelada) break;
      set((s) => ({ colaDoc: s.colaDoc && { ...s.colaDoc, actual: sym.qualifiedName } }));

      let resultado = await get().generateDoc(sym, undefined, { enCola: true });
      // Un límite de uso se resuelve esperando; cualquier otro fallo no.
      if (resultado !== 'ok' && /\(429\)|limite de uso/i.test(resultado)) {
        await new Promise((r) => setTimeout(r, 8000));
        if (!get().colaDoc?.cancelada) resultado = await get().generateDoc(sym, undefined, { enCola: true });
      }

      set((s) => ({
        colaDoc: s.colaDoc && {
          ...s.colaDoc,
          hechos: s.colaDoc.hechos + 1,
          fallidos: resultado === 'ok' ? s.colaDoc.fallidos : [...s.colaDoc.fallidos, { nombre: sym.qualifiedName, motivo: resultado }],
        },
      }));

      // Hay errores que no dependen del elemento: una clave rechazada, un
      // modelo que no existe, ninguna clave configurada. Seguir con el resto
      // es fallar igual N veces y hacer esperar para nada. Se para y se dice.
      if (resultado !== 'ok' && /API key|rechazo la|no reconoce el modelo|no tiene el modelo|No hay una API key|No se pudo contactar/i.test(resultado)) {
        set((s) => ({ colaDoc: s.colaDoc && { ...s.colaDoc, motivoParada: resultado } }));
        break;
      }
    }

    const cola = get().colaDoc;
    const bien = cola ? cola.hechos - cola.fallidos.length : 0;
    get().log('documentacion', cola?.fallidos.length ? 'warn' : 'info',
      `${cola?.cancelada ? 'Cola cancelada' : 'Cola terminada'}: ${bien} propuesta(s) en Revisión` +
      (cola?.fallidos.length ? `, ${cola.fallidos.length} sin generar.` : '.'));
    set((s) => ({
      colaDoc: s.colaDoc && { ...s.colaDoc, activa: false, actual: null },
      rightTab: bien > 0 ? 'revision' : s.rightTab,
      rightOpen: true,
      activeProposalId: s.proposals[0]?.id ?? s.activeProposalId,
    }));
  },

  cancelarColaDoc: () => set((s) => ({ colaDoc: s.colaDoc && { ...s.colaDoc, cancelada: true } })),
  pausarColaDoc: (pausada: boolean) => set((s) => ({ colaDoc: s.colaDoc && { ...s.colaDoc, pausada } })),

  async approveProposal(proposalId) {
    const project = get().project;
    if (!project) return;
    try {
      const { approved, proposals } = await api.approveProposal(project.id, proposalId);
      set({ approved, proposals, activeProposalId: proposals[0]?.id ?? null });
      get().log('documentacion', 'info', 'Documentación aprobada y guardada como versión oficial.');
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  async editProposal(proposalId, doc) {
    const project = get().project;
    if (!project) return;
    const { proposals } = await api.editProposal(project.id, proposalId, doc);
    set({ proposals });
    get().log('documentacion', 'info', 'Propuesta editada manualmente (sigue pendiente de aprobación).');
  },

  async discardProposal(proposalId) {
    const project = get().project;
    if (!project) return;
    const { proposals } = await api.discardProposal(project.id, proposalId);
    set({ proposals, activeProposalId: proposals[0]?.id ?? null });
    get().log('documentacion', 'info', 'Propuesta descartada. La documentación oficial no se modificó.');
  },

  async deleteDoc(functionId) {
    const project = get().project;
    if (!project) return;
    const { approved } = await api.deleteDoc(project.id, functionId);
    set({ approved });
    get().log('documentacion', 'warn', 'Documentación aprobada retirada (se conserva en el historial).');
  },

  async applyRelink(suggestion) {
    const project = get().project;
    if (!project) return;
    const { approved } = await api.relink(project.id, suggestion);
    set((s) => ({ approved, relinks: s.relinks.filter((r) => r.fromFunctionId !== suggestion.fromFunctionId) }));
    get().log('documentacion', 'info', `Documentación reasignada a ${suggestion.name} (${suggestion.filePath}).`);
  },

  dismissRelink: (fromFunctionId) =>
    set((s) => ({ relinks: s.relinks.filter((r) => r.fromFunctionId !== fromFunctionId) })),
}) satisfies Partial<Tienda>;
