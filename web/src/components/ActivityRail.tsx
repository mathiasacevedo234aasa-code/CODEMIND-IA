import { useStore, type LeftView } from '../state/useStore';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';

interface RailItem {
  id: LeftView;
  icon: string;
  label: string;
}

const ITEMS: RailItem[] = [
  { id: 'explorador', icon: 'folderOpen', label: 'Explorador de archivos' },
  { id: 'buscar', icon: 'search', label: 'Buscar en el proyecto' },
  { id: 'funciones', icon: 'fn', label: 'Elementos del proyecto' },
  { id: 'git', icon: 'git', label: 'Control de versiones' },
  { id: 'github', icon: 'link', label: 'GitHub' },
  { id: 'ejecutar', icon: 'play', label: 'Ejecutar y previsualizar' },
];

/** Barra de actividad: una sola vista lateral activa, como en un editor real. */
export function ActivityRail() {
  const t = useT();
  const leftView = useStore((s) => s.leftView);
  const leftOpen = useStore((s) => s.leftOpen);
  const setLeftView = useStore((s) => s.setLeftView);
  const setDocCenterOpen = useStore((s) => s.setDocCenterOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const statusOf = useStore((s) => s.statusOf);
  const gitAvailable = useStore((s) => s.gitAvailable);

  // Recalcula con `analysis` para que el contador siga vivo mientras se escribe.
  void analysis;
  const pendientes = symbolsFn().filter((f) => statusOf(f) !== 'documentada').length;

  return (
    <nav className="rail" aria-label="Secciones">
      {ITEMS.map((item) => {
        const active = leftOpen && leftView === item.id;
        const disabled = item.id === 'git' && !gitAvailable;
        return (
          <button
            key={item.id}
            className={`rail-btn ${active ? 'active' : ''}`}
            title={disabled ? t('Git no está disponible en este equipo') : t(item.label)}
            aria-label={t(item.label)}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => setLeftView(item.id)}
          >
            <Icon name={item.icon} size={18} />
            {item.id === 'funciones' && pendientes > 0 && <span className="rail-badge">{pendientes}</span>}
          </button>
        );
      })}

      <span style={{ flex: 1 }} />

      <button className="rail-btn" title={t('Centro de documentación')} onClick={() => setDocCenterOpen(true)}>
        <Icon name="docs" size={18} />
      </button>
      <button className="rail-btn" title={t('Configuración')} onClick={() => setSettingsOpen(true)}>
        <Icon name="gear" size={18} />
      </button>
    </nav>
  );
}
