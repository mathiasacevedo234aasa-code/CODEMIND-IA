import { lazy, Suspense } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';

// Usa Monaco: se carga junto con él, solo cuando hay algo que comparar.
const DiffLadoALado = lazy(() =>
  import('../lib/monaco').then(() => import('./DiffLadoALado')).then((m) => ({ default: m.DiffLadoALado })));

/** El contenido actual de un archivo: lo del editor si está abierto (aunque no esté guardado), si no, el disco. */
export async function contenidoActual(ruta: string): Promise<string> {
  const st = useStore.getState();
  const abierto = st.files[ruta];
  if (abierto) return abierto.content;
  if (!st.project) throw new Error('No hay proyecto abierto.');
  const res = await api.readFile(st.project.id, ruta);
  return res.content;
}

/** Abre la comparación de dos archivos cualesquiera del proyecto. */
export function compararArchivos(a: string, b: string) {
  useStore.getState().setComparacion({
    ruta: b,
    titulo: `${a}  ↔  ${b}`,
    etiqueta: 'dos archivos',
    cargar: async () => {
      const [antes, despues] = await Promise.all([contenidoActual(a), contenidoActual(b)]);
      return { binary: antes.includes('\0') || despues.includes('\0'), antes, despues };
    },
  });
}

export function ComparacionAbierta() {
  const c = useStore((s) => s.comparacion);
  const cerrar = useStore((s) => s.setComparacion);
  if (!c) return null;
  return (
    <Suspense fallback={null}>
      <DiffLadoALado
        key={c.titulo}
        ruta={c.ruta}
        titulo={c.titulo}
        etiqueta={c.etiqueta}
        cargar={c.cargar}
        alCerrar={() => cerrar(null)}
      />
    </Suspense>
  );
}
