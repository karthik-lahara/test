import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";

import { useProjects } from "@/features/projects";
import { useWorkItems } from "@/features/workItems";
import { projectPath, workItemPath } from "@/shared/constants/routes";
import { cn } from "@/shared/lib/cn";
import { Kbd } from "@/shared/ui/Display";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import { StatusIcon } from "@/shared/ui/WorkIcons";

/** Jump to any project or work item by name or key. */
export default function QuickSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { data: projects = [] } = useProjects();
  const { data: items = [] } = useWorkItems(
    { search: query.trim(), includeSubtasks: true },
    query.trim().length > 0,
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const p = projects
      .filter((x) => !q || x.name.toLowerCase().includes(q) || x.key.toLowerCase().includes(q))
      .slice(0, 4)
      .map((x) => ({
        id: x.id,
        to: projectPath(x.key),
        label: x.name,
        hint: x.key,
        icon: <ProjectIcon color={x.color} size={13} />,
      }));
    const w = q
      ? items.slice(0, 8).map((x) => ({
          id: x.id,
          to: workItemPath(x.key),
          label: x.title,
          hint: x.key,
          icon: <StatusIcon status={x.status} />,
        }))
      : [];
    return [...p, ...w];
  }, [projects, items, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function go(index: number) {
    const result = results[index];
    if (!result) return;
    navigate(result.to);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animate-pop w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <MagnifyingGlass size={16} className="text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter") go(active);
            }}
            placeholder="Search projects and work items…"
            className="h-12 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-fg-subtle">No results</li>
          )}
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[12.5px]",
                  i === active ? "bg-hover text-fg" : "text-fg-muted",
                )}
              >
                {r.icon}
                <span className="flex-1 truncate">{r.label}</span>
                <span className="font-mono text-[12px] text-fg-subtle">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
