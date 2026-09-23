import { useState } from 'react';
import { useStore } from '../state/useStore';
import type { TreeNode } from '../lib/types';
import { extensionOf } from '../lib/analyzer';
import { Icon } from './Icon';

const EXT_COLOR: Record<string, string> = {
  html: '#e2724a', css: '#4a8fe2', scss: '#cf649a', js: '#e0b341', mjs: '#e0b341',
  jsx: '#61d0e8', ts: '#3d7fd6', tsx: '#3d7fd6', json: '#9aa3b2', md: '#8b95a6',
  vue: '#41b883', svelte: '#ff3e00', py: '#4b8bbe',
};

function Row({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const openFile = useStore((s) => s.openFile);
  const renameEntry = useStore((s) => s.renameEntry);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const createEntry = useStore((s) => s.createEntry);

  const ext = extensionOf(node.name);
  const isDir = node.type === 'dir';
  const active = tabs.some((t) => t.kind === 'file' && t.path === node.path && t.id === activeTabId);

  const onRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = window.prompt('Nueva ruta (relativa al proyecto):', node.path);
    if (next && next !== node.path) void renameEntry(node.path, next);
  };

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const what = isDir ? 'la carpeta y todo su contenido' : 'el archivo';
    if (window.confirm(`Se eliminará ${what} "${node.path}". Esta acción no se puede deshacer. ¿Continuar?`)) {
      void deleteEntry(node.path);
    }
  };

  const onAdd = (kind: 'file' | 'dir') => (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = window.prompt(kind === 'dir' ? 'Nombre de la carpeta:' : 'Nombre del archivo:');
    if (name) {
      void createEntry(`${node.path}/${name}`, kind);
      setOpen(true);
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
        <span className="row-actions">
          {isDir && (
            <>
              <button className="btn icon sm" onClick={onAdd('file')} title="Nuevo archivo aquí"><Icon name="file" size={12} /></button>
              <button className="btn icon sm" onClick={onAdd('dir')} title="Nueva carpeta aquí"><Icon name="folder" size={12} /></button>
            </>
          )}
          <button className="btn icon sm" onClick={onRename} title="Renombrar"><Icon name="edit" size={12} /></button>
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

  const add = (kind: 'file' | 'dir') => {
    const name = window.prompt(
      kind === 'dir' ? 'Nombre de la carpeta (puedes usar rutas como css/temas):' : 'Nombre del archivo (por ejemplo js/app.js):',
    );
    if (name) void createEntry(name, kind);
  };

  return (
    <>
      <div className="panel-head">
        <span className="panel-title">Explorador</span>
        <span style={{ display: 'flex', gap: 2 }}>
          <button className="btn icon sm" onClick={() => add('file')} title="Nuevo archivo"><Icon name="file" size={13} /></button>
          <button className="btn icon sm" onClick={() => add('dir')} title="Nueva carpeta"><Icon name="folder" size={13} /></button>
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
          tree.map((node) => <Row key={node.path} node={node} depth={0} />)
        )}
      </div>
    </>
  );
}
