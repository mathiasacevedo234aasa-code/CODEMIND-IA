import { useStore } from '../state/useStore';

/**
 * "Exportar diagnóstico": versión, sistema, ajustes (sin claves) y los últimos
 * registros de la aplicación, en un .txt para adjuntar a un reporte de fallo.
 * Los registros también pasan por el limpiador de claves del servidor.
 */
export async function exportarDiagnostico() {
  const st = useStore.getState();
  const info = await fetch('/api/diagnostico').then((r) => r.json());
  const registros = st.logs.slice(0, 200).reverse()
    .map((l) => `${l.at}  [${l.channel}/${l.level}]  ${l.message}`)
    .join('\n');
  const { texto } = await fetch('/api/diagnostico/limpiar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: registros }),
  }).then((r) => r.json());

  const contenido = [
    'Diagnóstico de CodeMind AI',
    `Generado: ${new Date().toISOString()}`,
    `Navegador: ${navigator.userAgent}`,
    'No incluye claves ni el código de tus proyectos. Sí incluye rutas de carpetas que aparezcan en los registros.',
    '',
    '== Entorno ==',
    JSON.stringify(info, null, 2),
    '',
    '== Registros recientes (últimos 200) ==',
    texto || '(vacío)',
  ].join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }));
  a.download = `codemind-diagnostico-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  st.log('sistema', 'info', 'Diagnóstico exportado (sin claves).');
}
