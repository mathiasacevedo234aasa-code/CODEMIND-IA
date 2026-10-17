import { api } from '../../lib/api';
import { isAnalyzable, necesitaGramatica, suggestRelinks } from '../../lib/analyzer';
import { analizarEnSegundoPlano } from '../../lib/analyzer/enSegundoPlano';
import { detectarHuerfanos } from '../../lib/orphans';
import type { TreeNode } from '../../lib/types';
import type { ObtenerTienda, PonerTienda, Tienda } from '../tipos';

/** Análisis del proyecto: símbolos, huérfanos, estado de la documentación y saltos. */

/**
 * Tope de archivos del análisis del proyecto. Antes era 250 porque todo se
 * analizaba en el hilo de la interfaz; ahora va en segundo plano y solo se
 * vuelve a leer lo que ha cambiado, así que el tope puede ser mucho mayor.
 */
const MAX_SCAN_FILES = 2000;
/** Fecha de modificación con la que se analizó cada archivo (proyecto → ruta → mtime). */
const analizadoCon = new Map<string, Map<string, number>>();

export const crearAnalisis = (set: PonerTienda, get: ObtenerTienda) => ({
  async scanProject() {
    const project = get().project;
    if (!project) return;
    set({ scanning: true });
    try {
      const paths: string[] = [];
      const mtimes = new Map<string, number>();
      const walk = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.type === 'dir') walk(node.children);
          else if (isAnalyzable(node.path)) {
            paths.push(node.path);
            mtimes.set(node.path, node.mtime);
          }
        }
      };
      walk(get().tree);

      const limited = paths.slice(0, MAX_SCAN_FILES);
      if (paths.length > limited.length) {
        get().log('sistema', 'warn', `El proyecto tiene ${paths.length} archivos analizables; se analizaron los primeros ${MAX_SCAN_FILES}.`);
      }

      const previo = get().analysis;
      const sourcesPrevias = get().sources;
      const analysis: typeof previo = {};
      const sources: Record<string, string> = {};
      let vistos = analizadoCon.get(project.id);
      if (!vistos) analizadoCon.set(project.id, (vistos = new Map()));
      // Los lenguajes que no son del navegador cargan su gramática la primera
      // vez que aparecen. Conviene decirlo: la primera pasada tarda más.
      const gramaticas = new Set(limited.map(necesitaGramatica).filter(Boolean) as string[]);
      if (gramaticas.size) {
        get().log('sistema', 'info', `Cargando el analizador de ${[...gramaticas].sort().join(', ')} para este proyecto.`);
      }
      // Incremental: lo que no ha cambiado en el disco desde el último análisis
      // (y no está abierto con cambios) se reutiliza sin leerlo siquiera.
      // Lo demás se lee de 8 en 8 y se analiza en segundo plano.
      let reanalizados = 0;
      const uno = async (path: string) => {
        const open = get().files[path];
        const mtime = mtimes.get(path) ?? 0;
        if (!open && previo[path] && sourcesPrevias[path] !== undefined && vistos!.get(path) === mtime) {
          analysis[path] = previo[path];
          sources[path] = sourcesPrevias[path];
          return;
        }
        const content = open ? open.content : (await api.readFile(project.id, path).catch(() => null))?.content;
        if (typeof content !== 'string') return;
        analysis[path] = sourcesPrevias[path] === content && previo[path]
          ? previo[path]
          : await analizarEnSegundoPlano(path, content);
        sources[path] = content;
        if (!open) vistos!.set(path, mtime);
        reanalizados++;
      };
      const cola = [...limited];
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (cola.length) await uno(cola.shift()!);
      }));
      // Si mientras tanto se cambió de proyecto, este resultado ya no vale.
      if (get().project?.id !== project.id) return;
      set({ analysis, sources });
      if (reanalizados && limited.length > 50) {
        get().log('sistema', 'info', `Análisis: ${reanalizados} de ${limited.length} archivos leídos de nuevo; el resto no había cambiado.`);
      }

      const current = Object.values(analysis).flatMap((a) => a.symbols);
      const approvedList = Object.values(get().approved).map((a) => ({
        functionId: a.functionId,
        codeHash: a.codeHash,
        name: a.name,
      }));
      set({ relinks: suggestRelinks(approvedList, current) });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ scanning: false });
    }
  },

  symbols() {
    const analysis = get().analysis;
    return Object.keys(analysis)
      .sort()
      .flatMap((path) => analysis[path].symbols)
      .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  },

  /** Elementos de los que no se encuentra ningun uso. Es una sospecha, no un veredicto. */
  orphans() {
    const { sources, files } = get();
    // El contenido del editor manda sobre el del disco: si acabas de usar algo,
    // debe contar aunque no hayas guardado.
    const actual = { ...sources };
    for (const [ruta, archivo] of Object.entries(files)) actual[ruta] = archivo.content;
    return detectarHuerfanos(get().symbols(), actual);
  },

  statusOf(sym) {
    const approved = get().approved[sym.id];
    if (!approved) return 'sin-documentar';
    return approved.codeHash === sym.codeHash ? 'documentada' : 'revisar';
  },

  async goToSymbol(sym) {
    await get().openFile(sym.filePath);
    set({ jumpTo: { path: sym.filePath, line: sym.line } });
  },

  clearJump: () => set({ jumpTo: null }),
}) satisfies Partial<Tienda>;
