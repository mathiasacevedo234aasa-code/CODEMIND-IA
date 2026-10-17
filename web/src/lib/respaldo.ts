import { useStore } from '../state/useStore';
import type { ProveedorIA } from './types';

/**
 * Respaldo entre proveedores de IA.
 *
 * Cuando el proveedor en uso falla por algo que no depende de la pregunta
 * (límite de peticiones, el servicio caído o sin conexión), se ofrece
 * reintentar con el siguiente que esté configurado. Se OFRECE: mandar tu
 * código a otro servicio distinto del que elegiste es decisión tuya, así que
 * nunca se cambia solo.
 */

/** ¿Es un fallo del servicio, y no de la pregunta o de la clave? */
export const esFalloDelServicio = (mensaje: string) =>
  /\(429\)|l[ií]mite de uso|rate.?limit|\(5\d\d\)|No se pudo contactar|sobrecargad|overloaded|ECONNREFUSED|fetch failed/i.test(mensaje);

/** El siguiente proveedor configurado, en el orden de la lista, distinto del actual. */
export function siguienteProveedor(actual?: string | null): ProveedorIA | null {
  const { proveedores, claves, settings } = useStore.getState();
  const enUso = actual || settings.proveedor;
  const listos = proveedores.filter((p) =>
    p.id !== enUso
    && (p.local ? Boolean(settings.modelos?.[p.id]) : Boolean(claves[p.id]?.configured)));
  if (!listos.length) return null;
  // Se sigue el orden de la lista empezando después del actual, en círculo.
  const i = proveedores.findIndex((p) => p.id === enUso);
  const despues = [...proveedores.slice(i + 1), ...proveedores.slice(0, Math.max(0, i))];
  return despues.find((p) => listos.includes(p)) ?? listos[0];
}
