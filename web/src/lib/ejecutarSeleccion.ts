import { useStore } from '../state/useStore';
import { api } from './api';

/**
 * Manda el texto seleccionado al Terminal, línea a línea, como si lo
 * escribieras tú. Sirve para comandos sueltos y para un intérprete que ya
 * tengas abierto ahí (python, node...). Se ve en el Terminal y se puede parar
 * con Interrumpir; no se ejecuta nada a escondidas.
 */
export async function ejecutarSeleccion(texto: string) {
  const st = useStore.getState();
  if (!st.project || !texto.trim()) return;
  try {
    const { sesiones } = await api.terminalListar(st.project.id);
    let sesion = sesiones.find((s) => s.id === st.terminalSesionId && s.estado === 'viva') ?? sesiones.find((s) => s.estado === 'viva');
    if (!sesion) {
      sesion = (await api.terminalAbrir(st.project.id, 100, 30)).sesion;
      // Una consola recién abierta tarda un momento en estar lista.
      await new Promise((r) => setTimeout(r, 1200));
    }
    st.setTerminalSesion(sesion.id);
    st.setBottomTab('terminal');
    const ENTER = String.fromCharCode(13);
    for (const linea of texto.replace(/\r\n/g, '\n').split('\n')) {
      await api.terminalEscribir(st.project.id, sesion.id, linea + ENTER);
    }
    st.log('procesos', 'info', `Enviado al Terminal: ${texto.split('\n').length} línea(s).`);
  } catch (err) {
    st.setError((err as Error).message);
  }
}
