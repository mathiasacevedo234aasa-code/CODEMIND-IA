import { createContext, useContext, useState } from 'react';
import { useStore } from '../state/useStore';
import type { TreeNode } from '../lib/types';
import { extensionOf } from '../lib/analyzer';
import { Icon } from './Icon';
import { ask, validarRutaRelativa } from '../lib/dialogs';
import { useCobertura } from '../lib/useCobertura';

const EXT_COLOR: Record<string, string> = {
  html: '#e2724a', css: '#4a8fe2', scss: '#cf649a', js: '#e0b341', mjs: '#e0b341',
  jsx: '#61d0e8', ts: '#3d7fd6', tsx: '#3d7fd6', json: '#9aa3b2', md: '#8b95a6',
  vue: '#41b883', svelte: '#ff3e00', py: '#4b8bbe',
};

/** La cobertura de todo el proyecto, calculada una vez y no en cada fila. */
const CoberturaCtx = createContext<ReturnType<typeof useCobertura> | null>(null);

/**
 * Insignia de documentación en el explorador.
 *
 * Avisa de lo que importa sin abrir nada: un aviso naranja si algo
 * documentado se ha quedado desfasado, y el porcentaje si hay algo
 * documentado. Un archivo sin nada documentado no lleva insignia: llenar el
 * árbol de "0 %" sería ruido.
 */
function InsigniaCobertura({ ruta }: { ruta: string }) {
  const cob = useContext(CoberturaCtx)?.porArchivo[ruta];
  if (!cob || cob.total === 0) return null;
  if (cob.revisar > 0) {
    return (
      <span className="insignia-doc revisar" title={`${cob.revisar} explicación(es) desactualizada(s): el código cambió después de aprobarlas`}>
        !
      </span>
    );
  }
  if (cob.alDia === 0) return null;
  return (
    <span
      className={`insignia-doc ${cob.porcentaje === 100 ? 'completa' : ''}`}
      title={`${cob.alDia} de ${cob.total} elementos documentados`}
    >
      {cob.porcentaje}%
    </span>
  );
}

function Row({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const openFile = useStore((s) => s.openFile);
  const renameEntry = useStore((s) => s.renameEntry);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const createEntry = useStore((s) => s.createEntry);
  const documentarArchivo = useStore((s) => s.documentarArchivo);
  const colaActiva = useStore((s) => Boolean(s.colaDoc?.activa));

  const ext = extensionOf(node.name);
  const isDir = node.type === 'dir';
  const active = tabs.some((t) => t.kind === 'file' && t.path === node.path && t.id === activeTabId);

  const onRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = await ask({
      title: isDir ? 'Renombrar carpeta' : 'Renombrar archivo',
      label: 'Ruta dentro del proyecto',
      value: node.path,
      hint: 'Puedes moverlo a otra carpeta cambiando la ruta.',
      confirmText: 'Renombrar',
      validate: validarRutaRelativa,
    });
    if (next && next !== node.path) void renameEntry(node.path, next);
  };

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const what = isDir ? 'la carpeta y todo su contenido' : 'el archivo';
    if (window.confirm(`Se eliminará ${what} "${node.path}". Esta acción no se puede deshacer. ¿Continuar?`)) {
      void deleteEntry(node.path);
    }
  };

  const onAdd = (kind: 'file' | 'dir') => async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = await ask({
      title: kind === 'dir' ? 'Nueva carpeta' : 'Nuevo archivo',
      label: `Dentro de ${node.path}`,
      placeholder: kind === 'dir' ? 'componentes' : 'utilidades.js',
      confirmText: 'Crear',
      validate: validarRutaRelativa,
    });
    if (name) {
      void createEntry(`${node.path}/${name}`, kind);
      setOpen(true);
    }
  };

  const onDocumentarCarpeta = (e: React.MouseEvent) => {
    e.stopPropagation();
    const st = useStore.getState();
    const n = st.symbols().filter((x) => x.filePath.startsWith(`${node.path}/`) && !x.menor
      && !st.approved[x.id] && !st.proposals.some((p) => p.functionId === x.id)).length;
    if (!n) {
      window.alert(`En ${node.path}/ no queda nada sin documentar ni pendiente de revisar.`);
      return;
    }
    if (window.confirm(`Se pedirá a la IA la documentación de ${n} elemento(s) de ${node.path}/, uno detrás de otro. Todo llega a Revisión y nada es oficial hasta que lo apruebes. ¿Empezar?`)) {
      void documentarArchivo(node.path, { carpeta: true });
    }
  };

  return (
    <>
      <div
        className={`tree-row ${active ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (isDir ? setOpen((v) => !v) : void openFile(node.path))}
        title={node.path}
      >
        {isDir ? (
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
        ) : (
          <span className="ext" style={{ color: EXT_COLOR[ext] ?? 'var(--text-faint)' }}>
            {ext.slice(0, 3).toUpperCase() || '•'}
          </span>
        )}
        <span className="name">{node.name}</span>
        {!isDir && <InsigniaCobertura ruta={node.path} />}
        <span className="row-actions">
          {isDir && (
            <>
              <button className="btn icon sm" onClick={(e) => void onAdd('file')(e)} title="Nuevo archivo aquí"><Icon name="file" size={12} /></button>
              <button className="btn icon sm" onClick={(e) => void onAdd('dir')(e)} title="Nueva carpeta aquí"><Icon name="folder" size={12} /></button>
              <button className="btn icon sm" disabled={colaActiva} onClick={onDocumentarCarpeta} title="Documentar lo que falta en esta carpeta"><Icon name="docs" size={12} /></button>
            </>
          )}
          <button className="btn icon sm" onClick={(e) => void onRename(e)} title="Renombrar"><Icon name="edit" size={12} /></button>
          <button className="btn icon sm danger" onClick={onDelete} title="Eliminar"><Icon name="trash" size={12} /></button>
        </span>
      </div>
      {isDir && open && node.children.map((child) => <Row key={child.path} node={child} depth={depth + 1} />)}
    </>
  );
}

export function FileExplorer() {
  const tree = useStore((s) => s.tree);
  const truncated = useStore((s) => s.treeTruncated);
  const project = useStore((s) => s.project);
  const createEntry = useStore((s) => s.createEntry);
  const refreshTree = useStore((s) => s.refreshTree);
  const scanProject = useStore((s) => s.scanProject);
  const scanning = useStore((s) => s.scanning);
  const setFolderPickerOpen = useStore((s) => s.setFolderPickerOpen);
  const cobertura = useCobertura();

  const add = async (kind: 'file' | 'dir') => {
    const name = await ask({
      title: kind === 'dir' ? 'Nueva carpeta' : 'Nuevo archivo',
      label: 'Ruta dentro del proyecto',
      placeholder: kind === 'dir' ? 'css/temas' : 'js/app.js',
      hint: 'Puedes escribir una ruta con carpetas: se crearán las que falten.',
      confirmText: 'Crear',
      validate: validarRutaRelativa,
    });
    if (name) void createEntry(name, kind);
  };

  return (
    <>
      <div className="panel-head">
        <span className="panel-title">Explorador</span>
        {cobertura.proyecto.total > 0 && (
          <span
            className={`tag ${cobertura.proyecto.revisar ? 'warn' : cobertura.proyecto.porcentaje ? 'ok' : 'muted'}`}
            title={`${cobertura.proyecto.alDia + cobertura.proyecto.revisar} de ${cobertura.proyecto.total} elementos documentados${cobertura.proyecto.revisar ? `, ${cobertura.proyecto.revisar} por revisar` : ''}`}
          >
            {cobertura.proyecto.porcentaje}% documentado
          </span>
        )}
        <span style={{ display: 'flex', gap: 2 }}>
          <button className="btn icon sm" onClick={() => void add('file')} title="Nuevo archivo"><Icon name="file" size={13} /></button>
          <button className="btn icon sm" onClick={() => void add('dir')} title="Nueva carpeta"><Icon name="folder" size={13} /></button>
          <button className="btn icon sm" onClick={() => setFolderPickerOpen(true)} title="Abrir otra carpeta del equipo">
            <Icon name="folderOpen" size={13} />
          </button>
          <button
            className="btn icon sm"
            onClick={() => { void refreshTree().then(() => scanProject()); }}
            title="Releer archivos y volver a analizar"
          >
            {scanning ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
          </button>
        </span>
      </div>
      <div className="panel-body" style={{ paddingTop: 4 }}>
        {project?.mode === 'carpeta' && (
          <p className="hint" style={{ padding: '4px 10px', wordBreak: 'break-all' }}>{project.root}</p>
        )}
        {truncated && (
          <p className="hint" style={{ padding: '4px 10px', color: 'var(--warn)' }}>
            Carpeta muy grande: se muestra solo una parte del árbol.
          </p>
        )}
        {tree.length === 0 ? (
          <p className="hint" style={{ padding: '12px 14px' }}>
            El proyecto está vacío. Crea tu primer archivo, por ejemplo <code>index.html</code> o <code>js/app.js</code>.
          </p>
        ) : (
          <CoberturaCtx.Provider value={cobertura}>
            {tree.map((node) => <Row key={node.path} node={node} depth={0} />)}
          </CoberturaCtx.Provider>
        )}
      </div>
    </>
  );
}
