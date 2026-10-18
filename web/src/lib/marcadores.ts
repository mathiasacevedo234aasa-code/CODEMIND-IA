import { create } from 'zustand';
import { api } from './api';

/**
 * Marcadores en líneas, con nota opcional. Se guardan por proyecto en su
 * carpeta de datos (nunca en el código). Mientras editas, el editor los mueve
 * con su línea y se vuelve a guardar la posición nueva.
 */
export interface Marcador { ruta: string; linea: number; nota: string; en?: string }

interface EstadoMarcadores {
  projectId: string | null;
  lista: Marcador[];
  cargar: (projectId: string) => Promise<void>;
  alternar: (ruta: string, linea: number, nota?: string) => void;
  quitar: (ruta: string, linea: number) => void;
  /** Lo llama el editor cuando las líneas se desplazan al escribir. */
  recolocar: (ruta: string, lineas: { antes: number; ahora: number }[]) => void;
}

let espera: number | undefined;
const guardar = (projectId: string | null, lista: Marcador[]) => {
  if (!projectId) return;
  window.clearTimeout(espera);
  espera = window.setTimeout(() => { void api.guardarMarcadores(projectId, lista).catch(() => {}); }, 400);
};

export const useMarcadores = create<EstadoMarcadores>((set, get) => ({
  projectId: null,
  lista: [],
  async cargar(projectId) {
    set({ projectId, lista: [] });
    const { marcadores } = await api.marcadores(projectId).catch(() => ({ marcadores: [] as Marcador[] }));
    if (get().projectId === projectId) set({ lista: marcadores });
  },
  alternar(ruta, linea, nota) {
    const { lista, projectId } = get();
    const existe = lista.find((m) => m.ruta === ruta && m.linea === linea);
    const nueva = existe && nota === undefined
      ? lista.filter((m) => m !== existe)
      : [...lista.filter((m) => m !== existe), { ruta, linea, nota: nota ?? existe?.nota ?? '', en: new Date().toISOString() }];
    set({ lista: nueva });
    guardar(projectId, nueva);
  },
  quitar(ruta, linea) {
    const nueva = get().lista.filter((m) => !(m.ruta === ruta && m.linea === linea));
    set({ lista: nueva });
    guardar(get().projectId, nueva);
  },
  recolocar(ruta, lineas) {
    const mapa = new Map(lineas.map((l) => [l.antes, l.ahora]));
    let cambio = false;
    const nueva = get().lista.map((m) => {
      if (m.ruta !== ruta || !mapa.has(m.linea) || mapa.get(m.linea) === m.linea) return m;
      cambio = true;
      return { ...m, linea: mapa.get(m.linea)! };
    });
    if (!cambio) return;
    set({ lista: nueva });
    guardar(get().projectId, nueva);
  },
}));
