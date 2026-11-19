import React, { useMemo, useState } from 'react';
import { File, Folder, Search } from 'lucide-react';

/** Convierte una lista de rutas en un árbol de carpetas y archivos ordenado (carpetas primero). */
export function buildTree(paths) {
  const root = { name: '', folders: new Map(), files: [] };
  for (const path of paths) {
    const parts = String(path).split('/').filter(Boolean);
    let node = root;
    parts.slice(0, -1).forEach((part) => {
      if (!node.folders.has(part)) node.folders.set(part, { name: part, folders: new Map(), files: [] });
      node = node.folders.get(part);
    });
    if (parts.length) node.files.push(parts[parts.length - 1]);
  }
  return root;
}

const countFiles = (node) => node.files.length + [...node.folders.values()].reduce((total, folder) => total + countFiles(folder), 0);
const countFolders = (node) => node.folders.size + [...node.folders.values()].reduce((total, folder) => total + countFolders(folder), 0);

function Branch({ node, depth, query, base }) {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...node.files].sort((a, b) => a.localeCompare(b));
  return <ul className={depth ? 'ml-4 border-l border-slate-200 pl-2' : ''}>
    {folders.map((folder) => <li key={folder.name}>
      <details open={depth < 1 || Boolean(query)}>
        <summary className="flex cursor-pointer select-none items-center gap-1.5 py-0.5 text-xs font-medium text-slate-700">
          <Folder size={13} className="shrink-0 text-violet-500" />{folder.name}
          <span className="text-[10px] font-normal text-slate-400">{countFiles(folder)}</span>
        </summary>
        <Branch node={folder} depth={depth + 1} query={query} base={`${base}${folder.name}/`} />
      </details>
    </li>)}
    {files.map((file) => <li key={file} className="flex items-center gap-1.5 py-0.5 pl-0.5 text-xs text-slate-600" data-path={`${base}${file}`}>
      <File size={12} className="shrink-0 text-slate-400" /><span className="break-all font-mono">{file}</span>
    </li>)}
  </ul>;
}

/**
 * Explorador de la estructura de archivos que se va a generar: carpetas plegables con su número de archivos y
 * un filtro por nombre. Solo lectura.
 */
export default function FolderExplorer({ tree }) {
  const [query, setQuery] = useState('');
  const paths = useMemo(() => String(tree || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [tree]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? paths.filter((path) => path.toLowerCase().includes(term)) : paths;
  }, [paths, query]);
  const root = useMemo(() => buildTree(visible), [visible]);

  if (!paths.length) return <p className="text-sm text-slate-500">Todavía no hay estructura. Usa «Generar propuesta desde el proyecto».</p>;
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-500" role="status">{paths.length} archivos en {countFolders(buildTree(paths))} carpetas{query.trim() ? ` · ${visible.length} coinciden` : ''}</p>
      <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
        <Search size={12} className="text-slate-400" />
        <input aria-label="Filtrar archivos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por nombre" className="w-40 bg-transparent outline-none" />
      </label>
    </div>
    <div className="max-h-96 overflow-auto">
      {visible.length ? <Branch node={root} depth={0} query={query.trim()} base="" /> : <p className="text-xs text-slate-500">Ningún archivo coincide.</p>}
    </div>
  </div>;
}
