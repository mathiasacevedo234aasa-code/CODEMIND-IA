import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { useEjecutarArchivo, useplanDelArchivo } from './EjecutarArchivo';
import { Icon } from './Icon';

interface Comando {
  id: string;
  titulo: string;
  grupo: string;
  atajo?: string;
  icono?: string;
  detalle?: string;
  accion: () => void | Promise<void>;
}

/**
 * Paleta de comandos (Ctrl+Shift+P).
 *
 * Reúne en un solo sitio las acciones y los archivos del proyecto. Con
 * proyectos grandes, buscar un archivo escribiendo su nombre es bastante más
 * rápido que desplegar carpetas en el explorador.
 *
 * Escribiendo `>` se limita a acciones; sin prefijo se buscan archivos.
 */
export function CommandPalette() {
  const abierta = useStore((s) => s.paletteOpen);
  const setAbierta = useStore((s) => s.setPaletteOpen);
  const tree = useStore((s) => s.tree);
  const project = useStore((s) => s.project);
  const openFile = useStore((s) => s.openFile);
  const saveAll = useStore((s) => s.saveAll);
  const setLeftView = useStore((s) => s.setLeftView);
  const setBottomTab = useStore((s) => s.setBottomTab);
  const setRightTab = useStore((s) => s.setRightTab);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setFolderPickerOpen = useStore((s) => s.setFolderPickerOpen);
  const dividirEditor = useStore((s) => s.dividirEditor);
  const { plan, ruta } = useplanDelArchivo();
  const { ejecutar: ejecutarArchivo } = useEjecutarArchivo();
  const documentarArchivo = useStore((s) => s.documentarArchivo);
  const unirEditor = useStore((s) => s.unirEditor);
  const refreshPreview = useStore((s) => s.refreshPreview);
  const scanProject = useStore((s) => s.scanProject);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const closeProject = useStore((s) => s.closeProject);

  const [texto, setTexto] = useState('');
  const [indice, setIndice] = useState(0);
  const entradaRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  /** Todas las rutas de archivo del proyecto, aplanadas. */
  const archivos = useMemo(() => {
    const salida: string[] = [];
    const recorrer = (nodos: typeof tree) => {
      for (const nodo of nodos) {
        if (nodo.type === 'dir') recorrer(nodo.children);
        else salida.push(nodo.path);
      }
    };
    recorrer(tree);
    return salida;
  }, [tree]);

  const comandos = useMemo<Comando[]>(() => {
    const tema = settings.editor.theme;
    return [
      { id: 'guardar', titulo: 'Guardar todo', grupo: 'Archivo', atajo: 'Ctrl+S', icono: 'save', accion: () => void saveAll() },
      { id: 'abrir-carpeta', titulo: 'Abrir una carpeta del equipo', grupo: 'Archivo', icono: 'folderOpen', accion: () => setFolderPickerOpen(true) },
      { id: 'cerrar-proyecto', titulo: 'Cerrar el proyecto', grupo: 'Archivo', icono: 'close', accion: closeProject },

      ...(ruta && plan?.disponible
        ? [{
            id: 'ejecutar-archivo',
            titulo: `Ejecutar ${plan.nombre ?? ruta}`,
            grupo: 'Editor',
            atajo: 'F5',
            icono: 'play',
            detalle: `${plan.lenguaje}: ${plan.comando}`,
            accion: () => void ejecutarArchivo(ruta),
          }]
        : []),

      ...(ruta
        ? [{
            id: 'documentar-archivo',
            titulo: `Documentar todo ${ruta.split('/').pop()}`,
            grupo: 'Documentación',
            icono: 'brain',
            detalle: 'Una propuesta por cada elemento sin documentar; todas quedan en Revisión',
            accion: () => void documentarArchivo(ruta),
          }]
        : []),

      { id: 'buscar-simbolo', titulo: 'Ir a un símbolo del proyecto', grupo: 'Editor', atajo: 'Ctrl+T', icono: 'fn', detalle: 'Funciones, clases, reglas... de cualquier archivo', accion: () => { window.dispatchEvent(new Event('codemind:buscar-simbolo')); } },

      { id: 'dividir-editor', titulo: 'Dividir el editor en dos', grupo: 'Editor', icono: 'columns', detalle: 'Manda la pestaña actual a la otra mitad para ver dos archivos a la vez', accion: () => dividirEditor() },
      { id: 'unir-editor', titulo: 'Deshacer la división del editor', grupo: 'Editor', icono: 'close', detalle: 'Junta todas las pestañas en una sola mitad, sin cerrar ninguna', accion: () => unirEditor() },

      { id: 'ver-explorador', titulo: 'Ir al explorador', grupo: 'Paneles', icono: 'folderOpen', accion: () => setLeftView('explorador') },
      { id: 'ver-buscar', titulo: 'Buscar en todo el proyecto', grupo: 'Paneles', atajo: 'Ctrl+Shift+F', icono: 'search', accion: () => setLeftView('buscar') },
      { id: 'ver-elementos', titulo: 'Ir a los elementos del proyecto', grupo: 'Paneles', icono: 'fn', accion: () => setLeftView('funciones') },
      { id: 'ver-git', titulo: 'Ir al control de versiones', grupo: 'Paneles', icono: 'git', accion: () => setLeftView('git') },
      { id: 'ver-github', titulo: 'Ir a GitHub', grupo: 'Paneles', icono: 'link', accion: () => setLeftView('github') },
      { id: 'ver-ejecutar', titulo: 'Ir a ejecutar y previsualizar', grupo: 'Paneles', icono: 'play', accion: () => setLeftView('ejecutar') },
      { id: 'ver-asistente', titulo: 'Abrir el asistente', grupo: 'Paneles', icono: 'brain', accion: () => setRightTab('asistente') },
      { id: 'ver-revision', titulo: 'Abrir la revisión de propuestas', grupo: 'Paneles', icono: 'docs', accion: () => setRightTab('revision') },
      { id: 'ver-docs', titulo: 'Abrir el centro de documentación', grupo: 'Paneles', icono: 'docs', accion: () => setDocCenterOpen(true) },

      { id: 'preview', titulo: 'Actualizar la vista previa', grupo: 'Ejecución', icono: 'refresh', accion: () => { setBottomTab('preview'); refreshPreview(); } },
      { id: 'consola', titulo: 'Ver la consola', grupo: 'Ejecución', icono: 'terminal', accion: () => setBottomTab('consola') },
      { id: 'errores', titulo: 'Ver los errores', grupo: 'Ejecución', icono: 'warn', accion: () => setBottomTab('errores') },
      { id: 'reanalizar', titulo: 'Volver a analizar el proyecto', grupo: 'Ejecución', icono: 'refresh', accion: () => void scanProject() },

      {
        id: 'tema',
        titulo: tema === 'dark' ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro',
        grupo: 'Preferencias',
        icono: tema === 'dark' ? 'sun' : 'moon',
        accion: () => void saveSettings({ editor: { ...settings.editor, theme: tema === 'dark' ? 'light' : 'dark' } }),
      },
      {
        id: 'autoguardado',
        titulo: settings.editor.autoSave ? 'Desactivar el autoguardado' : 'Activar el autoguardado',
        grupo: 'Preferencias',
        icono: 'save',
        accion: () => void saveSettings({ editor: { ...settings.editor, autoSave: !settings.editor.autoSave } }),
      },
      { id: 'ajustes', titulo: 'Abrir la configuración', grupo: 'Preferencias', icono: 'gear', accion: () => setSettingsOpen(true) },
    ];
  }, [settings, saveAll, setFolderPickerOpen, closeProject, setLeftView, setRightTab, setDocCenterOpen,
      setBottomTab, refreshPreview, scanProject, saveSettings, setSettingsOpen]);

  const soloAcciones = texto.startsWith('>');
  const consulta = (soloAcciones ? texto.slice(1) : texto).trim().toLowerCase();

  /** Coincidencia por subsecuencia: "carjs" encuentra "js/carrito.js". */
  const encaja = (candidato: string) => {
    if (!consulta) return true;
    const texto = candidato.toLowerCase();
    if (texto.includes(consulta)) return true;
    let i = 0;
    for (const letra of consulta) {
      i = texto.indexOf(letra, i);
      if (i === -1) return false;
      i++;
    }
    return true;
  };

  const elementos = useMemo(() => {
    const acciones = comandos
      .filter((c) => encaja(`${c.grupo} ${c.titulo}`))
      .map((c) => ({ tipo: 'accion' as const, comando: c }));

    if (soloAcciones) return acciones;

    const rutas = archivos
      .filter((p) => encaja(p))
      .slice(0, 40)
      .map((p) => ({ tipo: 'archivo' as const, path: p }));

    // Sin texto se muestran primero las acciones; con texto, los archivos,
    // que es lo que se busca la mayoría de las veces.
    return consulta ? [...rutas, ...acciones] : [...acciones, ...rutas];
  }, [comandos, archivos, consulta, soloAcciones]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setIndice(0); }, [texto]);

  useEffect(() => {
    if (!abierta) return;
    setTexto('');
    setIndice(0);
    requestAnimationFrame(() => entradaRef.current?.focus());
  }, [abierta]);

  // Mantiene visible el elemento seleccionado al moverse con el teclado.
  useEffect(() => {
    listaRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  if (!abierta || !project) return null;

  const ejecutar = (posicion: number) => {
    const elegido = elementos[posicion];
    if (!elegido) return;
    setAbierta(false);
    if (elegido.tipo === 'archivo') void openFile(elegido.path);
    else void elegido.comando.accion();
  };

  const alPulsarTecla = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => Math.min(elementos.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ejecutar(indice);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAbierta(false);
    }
  };

  return (
    <div className="overlay palette-overlay" onClick={() => setAbierta(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name={soloAcciones ? 'play' : 'search'} size={15} />
          <input
            ref={entradaRef}
            type="text"
            value={texto}
            placeholder="Escribe para buscar un archivo, o > para ver las acciones"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alPulsarTecla}
            spellCheck={false}
          />
        </div>

        <div className="palette-list" ref={listaRef}>
          {elementos.length === 0 && <p className="hint" style={{ padding: 14 }}>Sin coincidencias.</p>}
          {elementos.map((el, i) => (
            <div
              key={el.tipo === 'archivo' ? `f:${el.path}` : `c:${el.comando.id}`}
              className={`palette-item ${i === indice ? 'active' : ''}`}
              onMouseEnter={() => setIndice(i)}
              onClick={() => ejecutar(i)}
            >
              <Icon name={el.tipo === 'archivo' ? 'file' : el.comando.icono ?? 'play'} size={14} />
              {el.tipo === 'archivo' ? (
                <>
                  <span className="palette-title">{el.path.split('/').pop()}</span>
                  <span className="palette-detail">{el.path}</span>
                </>
              ) : (
                <>
                  <span className="palette-title">{el.comando.titulo}</span>
                  <span className="palette-detail">{el.comando.grupo}</span>
                  {el.comando.atajo && <kbd>{el.comando.atajo}</kbd>}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> cerrar</span>
          <span style={{ flex: 1 }} />
          <span>{elementos.length} resultado(s)</span>
        </div>
      </div>
    </div>
  );
}
