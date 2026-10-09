import { useEffect, useState } from 'react';
import { CheckSquare, FolderKanban, Search, X } from 'lucide-react';
import { api, type Project, type ProjectTask } from './api';
import './search.css';

export type SearchTarget = { projectId: string; taskId?: string };
type Result = { kind: 'project'; project: Project } | { kind: 'task'; project: Project; task: ProjectTask };
type Props = { projects: Project[]; onSelect: (target: SearchTarget) => void };

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN').trim();
}

export default function GlobalSearch({ projects, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = normalize(query);
    if (!open || !term) { setResults([]); setLoading(false); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const projectResults: Result[] = projects
        .filter(project => normalize(project.title).includes(term))
        .map(project => ({ kind: 'project', project }));
      if (active) { setResults(projectResults.slice(0, 8)); setLoading(true); }
      try {
        const groups = await Promise.all(projects.map(async project => ({
          project,
          tasks: await api<ProjectTask[]>(`/projects/${project.id}/tasks`),
        })));
        if (!active) return;
        const taskResults: Result[] = groups.flatMap(({ project, tasks }) => tasks
          .filter(task => normalize(task.title).includes(term))
          .map(task => ({ kind: 'task' as const, project, task })));
        setResults([...projectResults, ...taskResults].slice(0, 8));
      } catch {
        if (active) setResults(projectResults.slice(0, 8));
      } finally {
        if (active) setLoading(false);
      }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, projects, query]);

  const select = (result: Result) => {
    onSelect(result.kind === 'task'
      ? { projectId: result.project.id, taskId: result.task.id }
      : { projectId: result.project.id });
    setOpen(false);
    setQuery('');
  };

  return <div className="global-search">
    <button className="icon-button search-button" type="button" aria-label="Tìm dự án hoặc task" title="Tìm dự án hoặc task" onClick={() => setOpen(value => !value)}><Search size={18}/></button>
    {open && <div className="global-search-popover">
      <div className="global-search-input-wrap"><Search size={17}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tên dự án hoặc task…" aria-label="Tìm tên dự án hoặc task"/><button className="icon-button" type="button" onClick={() => { setOpen(false); setQuery(''); }} aria-label="Đóng tìm kiếm"><X size={17}/></button></div>
      {query.trim() && <div className="global-search-results" role="listbox" aria-label="Gợi ý tìm kiếm">
        {results.map(result => <button className="global-search-result" type="button" key={result.kind === 'task' ? `task-${result.task.id}` : `project-${result.project.id}`} onClick={() => select(result)}>
          <span className={`global-search-result-icon ${result.kind}`}>{result.kind === 'task' ? <CheckSquare size={16}/> : <FolderKanban size={16}/>}</span>
          <span className="global-search-result-copy"><strong>{result.kind === 'task' ? result.task.title : result.project.title}</strong><small>{result.kind === 'task' ? `Task · ${result.project.title}` : 'Dự án'}</small></span>
        </button>)}
        {loading && <div className="global-search-message">Đang tìm task…</div>}
        {!loading && results.length === 0 && <div className="global-search-message">Không tìm thấy dự án hoặc task phù hợp.</div>}
      </div>}
      {!query.trim() && <div className="global-search-message">Nhập tên dự án hoặc task để tìm.</div>}
    </div>}
  </div>;
}
