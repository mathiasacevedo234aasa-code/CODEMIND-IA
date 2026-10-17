import { useMemo } from 'react';
import { useStore } from '../state/useStore';
import { coberturaDe } from './cobertura';

/**
 * Cobertura del proyecto abierto, recalculada solo cuando cambia algo que la
 * afecta: el análisis o la documentación aprobada.
 */
export function useCobertura() {
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const statusOf = useStore((s) => s.statusOf);

  return useMemo(
    () => coberturaDe(symbolsFn(), approved, statusOf),
    // `analysis` no se usa dentro, pero es lo que hace cambiar a symbols().
    [symbolsFn, analysis, approved, statusOf], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
