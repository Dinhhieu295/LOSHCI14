import { useEffect, useRef, useState } from 'react';
import { Award, BookOpen, CheckSquare, ClipboardList, FileText, FolderKanban, Search, X } from 'lucide-react';
import { api, type Assignment, type Course, type Exam, type Project, type ProjectTask, type StudyNote } from './api';
import './search.css';

export type SearchTarget = {
  kind?: 'project' | 'task' | 'course' | 'assignment' | 'exam' | 'note';
  projectId?: string;
  taskId?: string;
  courseId?: string;
  assignmentId?: string;
  examId?: string;
  noteId?: string;
};

type Result =
  | { kind: 'project'; project: Project }
  | { kind: 'task'; project: Project; task: ProjectTask }
  | { kind: 'course'; course: Course }
  | { kind: 'assignment'; assignment: Assignment; courseName?: string }
  | { kind: 'exam'; exam: Exam; courseName?: string }
  | { kind: 'note'; note: StudyNote; courseName?: string };

type Props = {
  projects: Project[];
  courses?: Course[];
  assignments?: Assignment[];
  exams?: Exam[];
  notes?: StudyNote[];
  onSelect: (target: SearchTarget) => void;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd')
    .trim();
}

function balancedMerge(groups: Result[][], perCategoryQuota = 3, maxTotal = 18): Result[] {
  const picked: Result[] = [];
  const leftovers: Result[] = [];
  for (const group of groups) {
    picked.push(...group.slice(0, perCategoryQuota));
    leftovers.push(...group.slice(perCategoryQuota));
  }
  if (picked.length < maxTotal && leftovers.length > 0) {
    picked.push(...leftovers.slice(0, maxTotal - picked.length));
  }
  return picked.slice(0, maxTotal);
}

export default function GlobalSearch({
  projects,
  courses = [],
  assignments = [],
  exams = [],
  notes = [],
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [partialError, setPartialError] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchGenRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  useEffect(() => {
    const term = normalize(query);
    const currentGen = ++searchGenRef.current;

    if (!open || !term) {
      setResults([]);
      setLoading(false);
      setPartialError(false);
      setActiveIndex(-1);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      if (!active || currentGen !== searchGenRef.current) return;
      const courseMap = new Map(courses.map((c) => [c.id, c.name]));

      const projectResults: Result[] = projects
        .filter((project) =>
          normalize(`${project.title} ${project.tag} ${project.description}`).includes(term),
        )
        .map((project) => ({ kind: 'project', project }));

      const courseResults: Result[] = courses
        .filter((course) =>
          normalize(`${course.name} ${course.code} ${course.instructor} ${course.semester}`).includes(term),
        )
        .map((course) => ({ kind: 'course', course }));

      const assignmentResults: Result[] = assignments
        .filter((item) => normalize(item.title).includes(term))
        .map((assignment) => ({
          kind: 'assignment',
          assignment,
          courseName: assignment.courseId ? courseMap.get(assignment.courseId) : undefined,
        }));

      const examResults: Result[] = exams
        .filter((item) => normalize(`${item.title} ${item.type}`).includes(term))
        .map((exam) => ({
          kind: 'exam',
          exam,
          courseName: exam.courseId ? courseMap.get(exam.courseId) : undefined,
        }));

      const noteResults: Result[] = notes
        .filter((item) =>
          normalize(`${item.title} ${item.content} ${(item.tags ?? []).join(' ')}`).includes(term),
        )
        .map((note) => ({
          kind: 'note',
          note,
          courseName: note.courseId ? courseMap.get(note.courseId) : undefined,
        }));

      const immediate = balancedMerge([
        projectResults,
        courseResults,
        assignmentResults,
        examResults,
        noteResults,
      ]);

      if (active && currentGen === searchGenRef.current) {
        setResults(immediate);
        setActiveIndex(immediate.length > 0 ? 0 : -1);
        setLoading(projects.length > 0);
        setPartialError(false);
      }

      if (!projects.length) {
        if (active && currentGen === searchGenRef.current) setLoading(false);
        return;
      }

      const settled = await Promise.allSettled(
        projects.map(async (project) => ({
          project,
          tasks: await api<ProjectTask[]>(`/projects/${project.id}/tasks`),
        })),
      );

      if (!active || currentGen !== searchGenRef.current) return;

      let hadError = false;
      const taskResults: Result[] = [];
      for (const item of settled) {
        if (item.status === 'fulfilled') {
          const { project, tasks } = item.value;
          for (const task of tasks) {
            if (normalize(`${task.title} ${task.assignee ?? ''}`).includes(term)) {
              taskResults.push({ kind: 'task', project, task });
            }
          }
        } else {
          hadError = true;
        }
      }

      const merged = balancedMerge([
        projectResults,
        taskResults,
        courseResults,
        assignmentResults,
        examResults,
        noteResults,
      ]);
      setResults(merged);
      setActiveIndex((prev) => (merged.length === 0 ? -1 : prev >= 0 && prev < merged.length ? prev : 0));
      setPartialError(hadError);
      setLoading(false);
    }, 160);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, projects, courses, assignments, exams, notes, query]);

  const select = (result: Result) => {
    if (result.kind === 'task') {
      onSelect({ kind: 'task', projectId: result.project.id, taskId: result.task.id });
    } else if (result.kind === 'project') {
      onSelect({ kind: 'project', projectId: result.project.id });
    } else if (result.kind === 'course') {
      onSelect({ kind: 'course', courseId: result.course.id });
    } else if (result.kind === 'assignment') {
      onSelect({ kind: 'assignment', assignmentId: result.assignment.id });
    } else if (result.kind === 'exam') {
      onSelect({ kind: 'exam', examId: result.exam.id });
    } else if (result.kind === 'note') {
      onSelect({ kind: 'note', noteId: result.note.id });
    }
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  };

  const closeSearch = (restoreFocus = true) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch(true);
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[activeIndex >= 0 ? activeIndex : 0];
      if (target) select(target);
    }
  };

  const renderIcon = (result: Result) => {
    switch (result.kind) {
      case 'project':
        return <FolderKanban size={16} />;
      case 'task':
        return <CheckSquare size={16} />;
      case 'course':
        return <BookOpen size={16} />;
      case 'assignment':
        return <ClipboardList size={16} />;
      case 'exam':
        return <Award size={16} />;
      case 'note':
        return <FileText size={16} />;
    }
  };

  const renderTitle = (result: Result) => {
    switch (result.kind) {
      case 'project':
        return result.project.title;
      case 'task':
        return result.task.title;
      case 'course':
        return result.course.name;
      case 'assignment':
        return result.assignment.title;
      case 'exam':
        return result.exam.title;
      case 'note':
        return result.note.title;
    }
  };

  const renderMeta = (result: Result) => {
    switch (result.kind) {
      case 'project':
        return `Dự án${result.project.tag ? ` · ${result.project.tag}` : ''}`;
      case 'task':
        return `Task · ${result.project.title}`;
      case 'course':
        return `Môn học${result.course.code ? ` · ${result.course.code}` : ''}`;
      case 'assignment':
        return `Bài tập${result.courseName ? ` · ${result.courseName}` : ''}`;
      case 'exam':
        return `Kỳ thi (${result.exam.type})${result.courseName ? ` · ${result.courseName}` : ''}`;
      case 'note':
        return `Ghi chú${result.courseName ? ` · ${result.courseName}` : ''}`;
    }
  };

  const resultKey = (result: Result) => {
    switch (result.kind) {
      case 'project':
        return `project-${result.project.id}`;
      case 'task':
        return `task-${result.task.id}`;
      case 'course':
        return `course-${result.course.id}`;
      case 'assignment':
        return `assignment-${result.assignment.id}`;
      case 'exam':
        return `exam-${result.exam.id}`;
      case 'note':
        return `note-${result.note.id}`;
    }
  };

  const activeOptionId =
    open && activeIndex >= 0 && activeIndex < results.length
      ? `global-search-opt-${resultKey(results[activeIndex])}`
      : undefined;

  return (
    <div className="global-search">
      <button
        ref={buttonRef}
        className="icon-button search-button"
        type="button"
        aria-label="Tìm dự án hoặc task"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Tìm dự án, task, môn học, bài tập, kỳ thi, ghi chú"
        onClick={() => setOpen((value) => !value)}
      >
        <Search size={18} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="global-search-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Tìm kiếm dự án, task, môn học, bài tập, kỳ thi và ghi chú"
        >
          <div className="global-search-input-wrap">
            <Search size={17} />
            <input
              ref={inputRef}
              autoFocus
              role="combobox"
              aria-expanded={query.trim().length > 0}
              aria-autocomplete="list"
              aria-controls="global-search-listbox"
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Tìm dự án, task, môn học, bài tập, kỳ thi, ghi chú…"
              aria-label="Tìm tên dự án hoặc task"
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => closeSearch(true)}
              aria-label="Đóng tìm kiếm"
            >
              <X size={17} />
            </button>
          </div>
          {query.trim() ? (
            <div
              id="global-search-listbox"
              className="global-search-results"
              role="listbox"
              aria-label="Gợi ý tìm kiếm"
            >
              {results.map((result, idx) => {
                const key = resultKey(result);
                const isSelected = idx === activeIndex;
                return (
                  <button
                    id={`global-search-opt-${key}`}
                    className={`global-search-result ${isSelected ? 'active-option' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    key={key}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(result)}
                  >
                    <span className={`global-search-result-icon ${result.kind}`}>{renderIcon(result)}</span>
                    <span className="global-search-result-copy">
                      <strong>{renderTitle(result)}</strong>
                      <small>{renderMeta(result)}</small>
                    </span>
                  </button>
                );
              })}
              {loading && <div className="global-search-message">Đang tìm dữ liệu…</div>}
              {partialError && !loading && (
                <div className="global-search-message" role="status">
                  Một số nhóm task chưa tải được; đang hiển thị các kết quả sẵn có.
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="global-search-message">
                  Không tìm thấy dự án, task hoặc học liệu phù hợp.
                </div>
              )}
            </div>
          ) : (
            <div className="global-search-message">
              Nhập từ khóa để tìm dự án, task, môn học, bài tập, kỳ thi hoặc ghi chú. Dùng phím ↑↓ và Enter để chọn.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
