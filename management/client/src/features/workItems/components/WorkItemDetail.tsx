import { Fragment, type ReactNode, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CaretRight,
  CheckSquare,
  Clock,
  File,
  FileImage,
  Microphone,
  Paperclip,
  Plus,
  Sparkle,
  Square,
  Timer,
} from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import { workItemPath } from "@/shared/constants/routes";
import { CHILD_TYPE, followsParentSprint, hasStoryPoints } from "@/shared/constants/workItem";
import { formatBytes, formatDateLong, formatHours, fromNow } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import type { Project, Sprint, WorkItem } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import Button from "@/shared/ui/Button";
import { Badge, ProgressBar } from "@/shared/ui/Display";
import Input from "@/shared/ui/Input";
import Modal from "@/shared/ui/Modal";
import Picker from "@/shared/ui/Picker";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import PropertyButton from "@/shared/ui/PropertyButton";
import { StatusIcon, TypeBadge } from "@/shared/ui/WorkIcons";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import { useCreateWorkItemDialog } from "../createContext";
import { ancestorsOf } from "../hierarchy";
import {
  useAddAttachment,
  useAttachments,
  useLogTime,
  useUpdateWorkItem,
  useWorkItems,
} from "../queries/workItems.queries";
import Discussion from "./Discussion";
import { AssigneePicker, DueDateInput, PriorityPicker, StatusPicker, TypePicker } from "./pickers";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12.5px] font-medium text-fg-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-fg-subtle">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function LogTimeModal({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const log = useLogTime();
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const value = Number(hours);
  const valid = value > 0 && value <= 24;

  async function save() {
    try {
      await log.mutateAsync({ id: item.id, hours: value, note: note.trim() || undefined });
      toast.success(`Logged ${value}h on ${item.key}`);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Log time"
      description={`${item.key} · ${formatHours(item.loggedHours)} logged of ${formatHours(item.estimateHours)} estimated`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={log.isPending} onClick={save}>
            Log time
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Hours spent"
          type="number"
          min={0.25}
          max={24}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          error={hours && !valid ? "Between 0.25 and 24" : undefined}
        />
        <Input
          label="What did you work on? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

interface WorkItemDetailProps {
  item: WorkItem;
  project: Project;
  sprints: Sprint[];
  currentUserId: string;
  canModerate: boolean;
}

export default function WorkItemDetail({
  item,
  project,
  sprints,
  currentUserId,
  canModerate,
}: WorkItemDetailProps) {
  const navigate = useNavigate();
  const members = useMemberMap();
  const update = useUpdateWorkItem();
  const openCreate = useCreateWorkItemDialog();
  const { data: children = [] } = useWorkItems({ parentId: item.id, sort: "order" });
  const { data: parent } = useWorkItems({ projectId: project.id }, Boolean(item.parentId));
  const { data: attachments = [] } = useAttachments(item.id);
  const addAttachment = useAddAttachment(item.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [logging, setLogging] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [newCriterion, setNewCriterion] = useState("");

  const patch = (value: Partial<WorkItem>) => update.mutate({ id: item.id, patch: value });
  const reporter = members.get(item.reporterId);
  const chain = parent ? ancestorsOf(item, new Map(parent.map((p) => [p.id, p]))) : [];
  const sprint = sprints.find((s) => s.id === item.sprintId);
  const parentItem = item.parentId ? parent?.find((p) => p.id === item.parentId) : undefined;
  const timeShare = item.estimateHours ? item.loggedHours / item.estimateHours : 0;
  const childDone = children.filter((c) => c.status === "DONE").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {chain.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <Link
                  to={workItemPath(ancestor.key)}
                  title={ancestor.title}
                  className="flex max-w-[220px] items-center gap-1.5 rounded-md border border-line bg-raised/60 py-0.5 pr-2 pl-1 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <TypeBadge type={ancestor.type} />
                  <span className="truncate">{ancestor.title}</span>
                </Link>
                <CaretRight size={10} weight="bold" className="text-fg-subtle" />
              </Fragment>
            ))}
            <TypeBadge type={item.type} />
            <span className="font-mono text-[12px] text-fg-subtle">{item.key}</span>
          </div>
          <textarea
            key={`title-${item.id}`}
            defaultValue={item.title}
            rows={1}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== item.title) patch({ title });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            aria-label="Title"
            className="field-sizing-content w-full resize-none bg-transparent text-[24px] leading-tight font-semibold tracking-[-0.02em] text-fg focus:outline-none"
          />
          {item.createdVia !== "MANUAL" && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent">
              {item.createdVia === "AI_VOICE" ? <Microphone size={11} /> : <Sparkle size={11} />}
              Created with AI from {item.createdVia === "AI_VOICE" ? "voice" : "text"}, reviewed by{" "}
              {reporter?.name ?? "a person"}
            </p>
          )}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== item.description && patch({ description })}
            placeholder="Add a description…"
            rows={Math.max(4, description.split("\n").length + 1)}
            aria-label="Description"
            className="mt-4 w-full resize-none rounded-lg border border-transparent bg-transparent p-2 -ml-2 text-[13px] leading-relaxed text-fg placeholder:text-fg-subtle hover:border-line focus:outline-none field-glow"
          />

          <Section
            title={`Acceptance criteria${item.acceptanceCriteria.length ? ` · ${item.acceptanceCriteria.filter((c) => c.done).length}/${item.acceptanceCriteria.length}` : ""}`}
          >
            <ul className="flex flex-col gap-1">
              {item.acceptanceCriteria.map((criterion) => (
                <li key={criterion.id}>
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        acceptanceCriteria: item.acceptanceCriteria.map((c) =>
                          c.id === criterion.id ? { ...c, done: !c.done } : c,
                        ),
                      })
                    }
                    className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-[12.5px] hover:bg-hover"
                  >
                    {criterion.done ? (
                      <CheckSquare size={16} weight="fill" className="mt-px shrink-0 text-accent" />
                    ) : (
                      <Square size={16} className="mt-px shrink-0 text-fg-subtle" />
                    )}
                    <span className={criterion.done ? "text-fg-muted line-through" : "text-fg"}>
                      {criterion.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-1 flex items-center gap-2 px-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCriterion.trim()) return;
                patch({
                  acceptanceCriteria: [
                    ...item.acceptanceCriteria,
                    { id: `ac_${Date.now()}`, text: newCriterion.trim(), done: false },
                  ],
                });
                setNewCriterion("");
              }}
            >
              <Plus size={14} className="text-fg-subtle" />
              <input
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                placeholder="Add a criterion and press Enter"
                className="h-7 flex-1 bg-transparent text-[12.5px] text-fg placeholder:text-fg-subtle focus:outline-none"
              />
            </form>
          </Section>

          {item.type !== "SUBTASK" && (
            <Section
              title={`Sub-items${children.length ? ` · ${childDone}/${children.length}` : ""}`}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() =>
                    openCreate({
                      mode: "manual",
                      projectId: project.id,
                      parentId: item.id,
                      type: CHILD_TYPE[item.type] ?? "TASK",
                      sprintId: item.sprintId,
                    })
                  }
                >
                  Add
                </Button>
              }
            >
              {children.length > 0 && (
                <div className="mb-2">
                  <ProgressBar value={childDone / children.length} />
                </div>
              )}
              <ul className="overflow-hidden rounded-lg border border-line empty:hidden">
                {children.map((child) => (
                  <li
                    key={child.id}
                    className="flex h-9 cursor-pointer items-center gap-2 border-b border-line px-2 text-[12.5px] last:border-b-0 hover:bg-hover"
                    onClick={() => navigate(workItemPath(child.key))}
                  >
                    <StatusPicker
                      compact
                      value={child.status}
                      onChange={(status) => update.mutate({ id: child.id, patch: { status } })}
                    />
                    <span className="font-mono text-xs text-fg-subtle">{child.key}</span>
                    <span
                      className={
                        child.status === "DONE"
                          ? "flex-1 truncate text-fg-muted line-through"
                          : "flex-1 truncate text-fg"
                      }
                    >
                      {child.title}
                    </span>
                    <AssigneePicker
                      compact
                      value={child.assigneeIds}
                      onChange={(assigneeIds) =>
                        update.mutate({ id: child.id, patch: { assigneeIds } })
                      }
                      memberIds={project.memberIds}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={`Attachments${attachments.length ? ` · ${attachments.length}` : ""}`}
            action={
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    for (const file of Array.from(e.target.files ?? [])) {
                      addAttachment.mutate(file, {
                        onSuccess: () => toast.success(`${file.name} attached`),
                      });
                    }
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Paperclip}
                  onClick={() => fileInput.current?.click()}
                >
                  Attach
                </Button>
              </>
            }
          >
            {attachments.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-5 text-xs text-fg-subtle hover:border-line-strong hover:text-fg-muted"
              >
                <Paperclip size={14} />
                Requirement files, screenshots or test evidence
              </button>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {attachments.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2.5"
                  >
                    <span className="flex size-9 items-center justify-center rounded-md bg-raised text-fg-muted">
                      {file.kind === "image" ? <FileImage size={18} /> : <File size={18} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-fg">{file.name}</p>
                      <p className="text-[12px] text-fg-subtle">
                        {formatBytes(file.size)} · {members.get(file.uploadedBy)?.name} ·{" "}
                        {fromNow(file.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="mt-10 border-t border-line pt-6">
            <Discussion
              workItemId={item.id}
              currentUserId={currentUserId}
              canModerate={canModerate}
            />
          </div>
        </div>
      </div>

      <aside className="shrink-0 border-t border-line bg-panel/40 p-4 lg:w-80 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <div className="flex flex-col gap-0.5">
          <Prop label="Status">
            <StatusPicker value={item.status} onChange={(status) => patch({ status })} />
          </Prop>
          <Prop label="Priority">
            <PriorityPicker value={item.priority} onChange={(priority) => patch({ priority })} />
          </Prop>
          <Prop label="Assignees">
            <AssigneePicker
              value={item.assigneeIds}
              onChange={(assigneeIds) => patch({ assigneeIds })}
              memberIds={project.memberIds}
            />
          </Prop>
          <Prop label="Type">
            <TypePicker value={item.type} onChange={(type) => patch({ type })} />
          </Prop>
        </div>

        <div className="my-3 border-t border-line" />
        <div className="flex flex-col gap-0.5">
          <Prop label="Project">
            <Link
              to={`/projects/${project.key}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-fg hover:bg-hover"
            >
              <ProjectIcon color={project.color} size={12} />
              {project.name}
            </Link>
          </Prop>
          <Prop label="Sprint">
            {item.type === "EPIC" || item.type === "FEATURE" ? (
              <span className="px-1.5 text-[12.5px] text-fg-subtle">Spans sprints</span>
            ) : followsParentSprint(parentItem?.type) ? (
              // A story's tasks go wherever the story goes.
              <span
                className="flex items-center gap-1.5 px-1.5 text-[12.5px] text-fg"
                title={`Moves with ${parentItem!.key}`}
              >
                <Timer size={15} className="text-fg-muted" />
                {sprint?.name ?? "Backlog"}
                <span className="text-fg-subtle">· with {parentItem!.key}</span>
              </span>
            ) : (
              <Picker
                searchable={false}
                value={[item.sprintId ?? "backlog"]}
                onChange={([v]) => patch({ sprintId: v === "backlog" ? null : v })}
                options={[
                  { value: "backlog", label: "Backlog" },
                  ...sprints
                    .filter((s) => s.status !== "COMPLETED" || s.id === item.sprintId)
                    .map((s) => ({
                      value: s.id,
                      label: s.name,
                      hint: s.status === "ACTIVE" ? "Active" : undefined,
                    })),
                ]}
                trigger={({ toggle }) => (
                  <PropertyButton onClick={toggle} muted={!sprint}>
                    <Timer size={15} className="text-fg-muted" />
                    {sprint?.name ?? "Backlog"}
                  </PropertyButton>
                )}
              />
            )}
          </Prop>
          <Prop label="Start date">
            <DueDateInputLabel
              value={item.startDate}
              onChange={(startDate) => patch({ startDate })}
              empty="Set start"
            />
          </Prop>
          <Prop label="ETA">
            <DueDateInput value={item.dueDate} onChange={(dueDate) => patch({ dueDate })} />
          </Prop>
          {hasStoryPoints(item.type) && (
            <Prop label="Story points">
              <input
                type="number"
                min={0}
                defaultValue={item.storyPoints ?? ""}
                onBlur={(e) =>
                  patch({ storyPoints: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="–"
                className="h-7 w-20 rounded-md bg-transparent px-1.5 text-[12.5px] text-fg hover:bg-hover focus:bg-hover focus:outline-none"
              />
            </Prop>
          )}
        </div>

        <div className="my-3 border-t border-line" />
        <div className="rounded-lg border border-line bg-panel p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-fg">
              <Clock size={14} /> Effort
            </span>
            <Button size="sm" variant="secondary" onClick={() => setLogging(true)}>
              Log time
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-0.5">
              <span className="text-fg-subtle">Estimated</span>
              <input
                type="number"
                min={0}
                step={0.5}
                defaultValue={item.estimateHours ?? ""}
                key={`est-${item.estimateHours}`}
                onBlur={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  if (next !== item.estimateHours) patch({ estimateHours: next });
                }}
                placeholder="–"
                className="h-7 rounded-md bg-raised px-2 text-[12.5px] text-fg focus:outline-none"
              />
            </label>
            <div className="flex flex-col gap-0.5">
              <span className="text-fg-subtle">Actual</span>
              <span
                className={`flex h-7 items-center px-2 text-[12.5px] ${timeShare > 1 ? "text-[#e5484d]" : "text-fg"}`}
              >
                {formatHours(item.loggedHours)}
              </span>
            </div>
          </div>
          {item.estimateHours ? (
            <div className="mt-3">
              <ProgressBar value={timeShare} color={timeShare > 1 ? "#f06a6a" : undefined} />
              <p className="mt-1.5 text-[12px] text-fg-subtle">
                {timeShare > 1
                  ? `${formatHours(item.loggedHours - item.estimateHours)} over the estimate`
                  : `${formatHours(item.estimateHours - item.loggedHours)} left`}
                {item.completedAt &&
                  item.dueDate &&
                  item.completedAt.slice(0, 10) > item.dueDate &&
                  " · finished after the ETA"}
              </p>
            </div>
          ) : null}
        </div>

        {item.labels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {item.labels.map((label) => (
              <Badge key={label}>{label}</Badge>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-1.5 text-xs text-fg-subtle">
          <span className="flex items-center gap-1.5">
            Reported by <Avatar person={reporter} size={14} /> {reporter?.name}
          </span>
          <span>Created {formatDateLong(item.createdAt)}</span>
          <span>Updated {fromNow(item.updatedAt)}</span>
          {item.completedAt && (
            <span className="flex items-center gap-1">
              <StatusIcon status="DONE" size={12} /> Completed {formatDateLong(item.completedAt)}
            </span>
          )}
        </div>
      </aside>

      {logging && <LogTimeModal item={item} onClose={() => setLogging(false)} />}
    </div>
  );
}

function DueDateInputLabel({
  value,
  onChange,
  empty,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  empty: string;
}) {
  return (
    <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12.5px] hover:bg-hover">
      <span className={value ? "text-fg" : "text-fg-subtle"}>
        {value ? formatDateLong(value) : empty}
      </span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={empty}
      />
    </label>
  );
}
