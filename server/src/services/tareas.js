/**
 * Modelo distinto por tarea: documentar con uno potente, preguntar con uno
 * rápido, traducir con uno barato... Si una tarea no tiene nada elegido, se
 * usa el proveedor y el modelo generales de siempre.
 */
export const TAREAS = ['documentar', 'asistente', 'traducir', 'revisar'];

export function modeloDeTarea(settings, tarea) {
  const t = settings.modelosPorTarea?.[tarea];
  if (!t?.proveedor) return { proveedor: null, modelo: null };
  return { proveedor: t.proveedor, modelo: t.modelo || null };
}
