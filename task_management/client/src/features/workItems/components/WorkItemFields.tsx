import { useState } from "react";
import { Clock, Gauge, Plus, Tag, TreeStructure, X } from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import {
  canParent,
  hasStoryPoints,
  PARENT_TYPES,
  type Priority,
  TYPE_META,
  type WorkItemStatus,
  type WorkItemType,
} from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import type { Project } from "@/shared/types/entities";
import Picker from "@/shared/ui/Picker";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import PropertyButton from "@/shared/ui/PropertyButton";
import { TypeIcon } from "@/shared/ui/WorkIcons";

import { useWorkItems } from "../queries/workItems.queries";
import { AssigneePicker, DueDateInput, PriorityPicker, StatusPicker } from "./pickers";

export interface Draft {
  projectId: string;
  type: WorkItemType;
  title: string;
  description: string;
  status: WorkItemStatus;
  priority: Priority;
  assigneeIds: string[];
  dueDate: string | null;
  estimateHours: string;
  /** Story points as text ("" when not set); only stories and bugs have them. */
  storyPoints: string;
  labels: string[];
  acceptanceCriteria: string[];
  sprintId: string | null;
  parentId: string | null;
}

interface WorkItemFieldsProps {
  draft: Draft;
  onChange: (draft: Draft) => void;
  projects: Project[];
  errors: Partial<Record<keyof Draft, string>>;
  /** Fields the AI filled in, highlighted so they are checked. */
  aiFields?: Set<string>;
}

const TYPE_ORDER: WorkItemType[] = ["EPIC", "FEATURE", "STORY", "TASK", "BUG", "SUBTASK"];

/** One line on what each level is for, so people pick the right one. */
const TYPE_HINT: Record<WorkItemType, string> = {
  EPIC: "A big goal that takes months, split into features.",
  FEATURE: "Something you can ship, in a few weeks. Sits under an epic.",
  STORY: "One need of one user that fits in a sprint. Sits under a feature.",
  TASK: "A piece of work measured in hours. Usually under a story.",
  BUG: "Something broken that needs fixing. Usually under a story.",
  SUBTASK: "A small step of a task or bug.",
};

const aiMark = (on: boolean | undefined) =>
  cn(on && "rounded-md bg-accent-soft ring-1 ring-accent/30");

export default function WorkItemFields({
  draft,
  onChange,
  projects,
  errors,
  aiFields,
}: WorkItemFieldsProps) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });
  const project = projects.find((p) => p.id === draft.projectId);
  const members = useMemberMap();
  const [labelInput, setLabelInput] = useState("");
  const { data: projectItems = [] } = useWorkItems(
    { projectId: draft.projectId, includeSubtasks: true },
    Boolean(draft.projectId),
  );
  // Only items that fit the hierarchy can be the parent: a story sits under a feature, etc.
  const parentTypes = PARENT_TYPES[draft.type];
  const parent = projectItems.find((w) => w.id === draft.parentId);
  const parentOptions = projectItems.filter(
    (w) => parentTypes.includes(w.type) && (w.status !== "DONE" || w.id === draft.parentId),
  );
  const onLeave = draft.assigneeIds.filter((id) => members.get(id)?.availability === "ON_LEAVE");

  const typeLabel = TYPE_META[draft.type].label;

  return (
    <div className="flex flex-col gap-3">
      {/* What is being created, picked up front: the rest of the form follows from it. */}
      <div
        role="radiogroup"
        aria-label="Type"
        className={cn(
          "flex flex-wrap items-center gap-1 rounded-lg",
          aiMark(aiFields?.has("type")),
        )}
      >
        {TYPE_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={draft.type === t}
            title={TYPE_HINT[t]}
            onClick={() =>
              onChange({
                ...draft,
                type: t,
                // A new type may not fit under the old parent; then the parent is cleared.
                parentId: parent && canParent(t, parent.type) ? draft.parentId : null,
              })
            }
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
              draft.type === t
                ? "border-line-strong bg-active text-fg"
                : "border-transparent text-fg-subtle hover:bg-hover hover:text-fg",
            )}
          >
            <TypeIcon type={t} size={13} />
            {TYPE_META[t].label}
          </button>
        ))}
      </div>
      <p className="-mt-1.5 text-[12px] text-fg-subtle">{TYPE_HINT[draft.type]}</p>

      <div>
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={draft.type === "STORY" ? "As a … I can …" : `${typeLabel} title`}
          aria-label="Title"
          className={cn(
            "w-full bg-transparent text-lg font-semibold text-fg placeholder:text-fg-subtle focus:outline-none",
            aiMark(aiFields?.has("title")),
          )}
        />
        {errors.title && <p className="mt-1 text-xs text-[#e5484d]">{errors.title}</p>}
      </div>
      <textarea
        value={draft.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Add a description…"
        rows={3}
        aria-label="Description"
        className="w-full resize-y bg-transparent text-[12.5px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-1 border-t border-line pt-3">
        <span className={aiMark(aiFields?.has("project"))}>
          <Picker
            value={draft.projectId ? [draft.projectId] : []}
            onChange={([v]) => onChange({ ...draft, projectId: v, sprintId: null, parentId: null })}
            options={projects.map((p) => ({
              value: p.id,
              label: p.name,
              icon: <ProjectIcon color={p.color} size={12} />,
              hint: p.key,
            }))}
            trigger={({ toggle }) => (
              <PropertyButton
                onClick={toggle}
                muted={!project}
                className={errors.projectId ? "text-[#e5484d]" : ""}
              >
                {project ? <ProjectIcon color={project.color} size={12} /> : null}
                {project?.name ?? "Choose project"}
              </PropertyButton>
            )}
          />
        </span>
        {parentTypes.length > 0 && (
          <span className={aiMark(aiFields?.has("parent"))}>
            <Picker
              value={draft.parentId ? [draft.parentId] : []}
              onChange={([v]) => set("parentId", v || null)}
              placeholder={`Find a ${parentTypes.map((t) => TYPE_META[t].label.toLowerCase()).join(" or ")}…`}
              options={[
                ...(draft.type === "SUBTASK" ? [] : [{ value: "", label: "No parent" }]),
                ...parentOptions.map((w) => ({
                  value: w.id,
                  label: `${w.key} ${w.title}`,
                  icon: <TypeIcon type={w.type} />,
                })),
              ]}
              trigger={({ toggle }) => (
                <PropertyButton
                  onClick={toggle}
                  muted={!parent}
                  title={parent ? `${parent.key} ${parent.title}` : undefined}
                  className={errors.parentId ? "text-[#e5484d]" : ""}
                >
                  {parent ? <TypeIcon type={parent.type} /> : <TreeStructure size={15} />}
                  {parent ? (
                    <span className="max-w-[180px] truncate">
                      <span className="font-mono text-fg-subtle">{parent.key}</span> {parent.title}
                    </span>
                  ) : (
                    `Add parent ${parentTypes.map((t) => TYPE_META[t].label.toLowerCase()).join(" / ")}`
                  )}
                </PropertyButton>
              )}
            />
          </span>
        )}
        <StatusPicker value={draft.status} onChange={(v) => set("status", v)} />
        <span className={aiMark(aiFields?.has("priority"))}>
          <PriorityPicker value={draft.priority} onChange={(v) => set("priority", v)} />
        </span>
        <span className={aiMark(aiFields?.has("assignee"))}>
          <AssigneePicker
            value={draft.assigneeIds}
            onChange={(v) => set("assigneeIds", v)}
            memberIds={project?.memberIds}
          />
        </span>
        <span className={aiMark(aiFields?.has("dueDate"))}>
          <DueDateInput value={draft.dueDate} onChange={(v) => set("dueDate", v)} />
        </span>
        <label
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] hover:bg-hover",
            aiMark(aiFields?.has("estimate")),
          )}
        >
          <Clock size={15} className="text-fg-muted" />
          <input
            value={draft.estimateHours}
            onChange={(e) => set("estimateHours", e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Estimate"
            aria-label="Estimated effort in hours"
            className="w-16 bg-transparent text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          {draft.estimateHours && <span className="text-fg-subtle">h</span>}
        </label>
        {hasStoryPoints(draft.type) && (
          <label
            className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] hover:bg-hover"
            title="Relative size, used for sprint planning and velocity"
          >
            <Gauge size={15} className="text-fg-muted" />
            <select
              value={draft.storyPoints}
              onChange={(e) => set("storyPoints", e.target.value)}
              aria-label="Story points"
              className={cn(
                "bg-transparent focus:outline-none",
                draft.storyPoints ? "text-fg" : "text-fg-subtle",
              )}
            >
              <option value="">Points</option>
              {[1, 2, 3, 5, 8, 13].map((n) => (
                <option key={n} value={String(n)}>
                  {n} pt{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {errors.projectId && <p className="-mt-2 text-xs text-[#e5484d]">{errors.projectId}</p>}
      {errors.parentId && <p className="-mt-2 text-xs text-[#e5484d]">{errors.parentId}</p>}
      {onLeave.length > 0 && (
        <p className="-mt-1 text-xs text-[#d9860b]">
          {onLeave.map((id) => members.get(id)?.name).join(", ")} is on leave. Consider someone
          else.
        </p>
      )}

      <div className={cn("flex flex-wrap items-center gap-1.5", aiMark(aiFields?.has("labels")))}>
        <Tag size={14} className="text-fg-subtle" />
        {draft.labels.map((label) => (
          <span
            key={label}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-line px-2 text-xs text-fg-muted"
          >
            {label}
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() =>
                set(
                  "labels",
                  draft.labels.filter((l) => l !== label),
                )
              }
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && labelInput.trim()) {
              e.preventDefault();
              const label = labelInput.trim().toLowerCase();
              if (!draft.labels.includes(label)) set("labels", [...draft.labels, label]);
              setLabelInput("");
            }
          }}
          placeholder="Add label"
          className="h-6 w-24 bg-transparent text-xs text-fg placeholder:text-fg-subtle focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">Acceptance criteria</span>
        {draft.acceptanceCriteria.map((text, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="size-3.5 shrink-0 rounded border border-line-strong" />
            <input
              value={text}
              onChange={(e) =>
                set(
                  "acceptanceCriteria",
                  draft.acceptanceCriteria.map((t, i) => (i === index ? e.target.value : t)),
                )
              }
              className="h-7 flex-1 bg-transparent text-[12.5px] text-fg focus:outline-none"
              aria-label={`Criterion ${index + 1}`}
            />
            <button
              type="button"
              aria-label="Remove criterion"
              className="text-fg-subtle hover:text-fg"
              onClick={() =>
                set(
                  "acceptanceCriteria",
                  draft.acceptanceCriteria.filter((_, i) => i !== index),
                )
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("acceptanceCriteria", [...draft.acceptanceCriteria, ""])}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
        >
          <Plus size={12} />
          Add criterion
        </button>
      </div>
    </div>
  );
}
