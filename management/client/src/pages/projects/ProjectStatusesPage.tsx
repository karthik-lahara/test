import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns,
  DotsThree,
  PencilSimple,
  Plus,
  Star,
  Trash,
} from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import {
  type ProjectStatus,
  STATUS_CATEGORIES,
  STATUS_CATEGORY_META,
  type StatusCategory,
  useCreateStatus,
  useDeleteStatus,
  useProjectStatuses,
  useReorderStatuses,
  useUpdateStatus,
} from "@/features/projects";
import { cn } from "@/shared/lib/cn";
import { toast } from "@/shared/lib/toast";
import Button from "@/shared/ui/Button";
import { Badge, EmptyState, ListSkeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Input from "@/shared/ui/Input";
import Menu from "@/shared/ui/Menu";
import Modal from "@/shared/ui/Modal";
import Select from "@/shared/ui/Select";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import { useProjectContext } from "./projectContext";

const COLORS = [
  "#8A8F98",
  "#5E9BFF",
  "#F06A6A",
  "#A78BFA",
  "#4CC38A",
  "#F5A524",
  "#38BDF8",
  "#F472B6",
];

/** Each project's own statuses: the board columns and the choices in the status picker. */
export default function ProjectStatusesPage() {
  const project = useProjectContext();
  const { user, can } = usePermissions();
  // The server allows organisation admins and project managers; the lead is the project manager
  const canManage = can("createProject") || project.leadId === user?.id;
  const { data: statuses, isLoading, isError, refetch } = useProjectStatuses(project.id);
  const reorder = useReorderStatuses(project.id);
  const update = useUpdateStatus(project.id);
  const [editing, setEditing] = useState<ProjectStatus | "new" | null>(null);
  const [deleting, setDeleting] = useState<ProjectStatus | null>(null);

  if (isLoading) return <ListSkeleton rows={5} />;
  if (isError || !statuses) {
    return (
      <EmptyState
        icon={Columns}
        title="Couldn't load the statuses"
        description="Check your connection and try again."
        action={<Button onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }

  function move(index: number, by: -1 | 1) {
    const ids = statuses!.map((s) => s.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    reorder.mutate(ids, {
      onError: (error) => toast.error(getApiErrorMessage(error, "Could not reorder the statuses")),
    });
  }

  function makeDefault(status: ProjectStatus) {
    update.mutate(
      { id: status.id, patch: { isDefault: true } },
      {
        onSuccess: () => toast.success(`New work items now start in ${status.name}`),
        onError: (error) => toast.error(getApiErrorMessage(error, "Could not change the default")),
      },
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Statuses</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            The columns on the board, in this order. Each status belongs to a category, which
            decides when work counts as started or done.
          </p>
        </div>
        {canManage && (
          <Button variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
            Add status
          </Button>
        )}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
        {statuses.map((status, index) => (
          <li key={status.id} className="flex items-center gap-3 px-3 py-2.5 md:px-4">
            {canManage && (
              <div className="flex shrink-0 flex-col">
                <IconButton
                  icon={ArrowUp}
                  size={12}
                  label={`Move ${status.name} up`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                  className="size-5"
                />
                <IconButton
                  icon={ArrowDown}
                  size={12}
                  label={`Move ${status.name} down`}
                  disabled={index === statuses.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                  className="size-5"
                />
              </div>
            )}
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: status.color }}
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[13px] font-medium text-fg">{status.name}</span>
              <Badge>{STATUS_CATEGORY_META[status.category].label}</Badge>
              {status.isDefault && (
                <Badge className="bg-accent-soft text-accent">Default for new items</Badge>
              )}
            </div>
            <span className="shrink-0 text-[12px] text-fg-subtle tabular-nums">
              {status.itemCount} {status.itemCount === 1 ? "item" : "items"}
            </span>
            {canManage && (
              <Menu
                trigger={({ toggle }) => (
                  <IconButton icon={DotsThree} label={`${status.name} options`} onClick={toggle} />
                )}
                items={[
                  { label: "Edit", icon: PencilSimple, onSelect: () => setEditing(status) },
                  ...(!status.isDefault && status.category !== "done"
                    ? [{ label: "Make default", icon: Star, onSelect: () => makeDefault(status) }]
                    : []),
                  {
                    label: "Delete",
                    icon: Trash,
                    danger: true,
                    disabled: status.isDefault,
                    onSelect: () => setDeleting(status),
                  },
                ]}
              />
            )}
          </li>
        ))}
      </ul>

      {!canManage && (
        <p className="text-[12px] text-fg-subtle">
          Only organisation admins and the project lead can change statuses.
        </p>
      )}

      {editing && (
        <StatusModal
          projectId={project.id}
          status={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteStatusModal
          projectId={project.id}
          status={deleting}
          others={statuses.filter((s) => s.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** Add a status, or edit one: name, category and colour. */
function StatusModal({
  projectId,
  status,
  onClose,
}: {
  projectId: string;
  status: ProjectStatus | null;
  onClose: () => void;
}) {
  const create = useCreateStatus(projectId);
  const update = useUpdateStatus(projectId);
  const [name, setName] = useState(status?.name ?? "");
  const [category, setCategory] = useState<StatusCategory>(status?.category ?? "in_progress");
  const [color, setColor] = useState((status?.color ?? COLORS[5]).toUpperCase());
  const [error, setError] = useState("");
  const saving = create.isPending || update.isPending;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the status a name");
      return;
    }
    try {
      if (status) {
        // Send only what changed
        const patch = {
          ...(trimmed !== status.name && { name: trimmed }),
          ...(category !== status.category && { category }),
          ...(color !== status.color.toUpperCase() && { color }),
        };
        if (Object.keys(patch).length) await update.mutateAsync({ id: status.id, patch });
        toast.success(`${trimmed} saved`);
      } else {
        await create.mutateAsync({ name: trimmed, category, color });
        toast.success(`${trimmed} added`);
      }
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the status"));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={status ? `Edit ${status.name}` : "Add status"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {status ? "Save" : "Add status"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          label="Name"
          value={name}
          maxLength={30}
          autoFocus
          placeholder="Code review"
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
        <Select
          label="Category"
          hint={STATUS_CATEGORY_META[category].hint}
          value={category}
          disabled={status?.isDefault}
          onChange={(e) => {
            setCategory(e.target.value as StatusCategory);
            setError("");
          }}
          options={STATUS_CATEGORIES.map((c) => ({
            value: c,
            label: STATUS_CATEGORY_META[c].label,
          }))}
        />
        {status?.isDefault && (
          <p className="-mt-2 text-[12px] text-fg-subtle">
            The default status can't change category. Make another status the default first.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-fg-muted">Colour</span>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn(
                "size-5 rounded-full ring-offset-2 ring-offset-panel",
                color === c && "ring-2 ring-fg",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="text-xs text-[#e5484d]">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Delete a status; its work items move to another status first. */
function DeleteStatusModal({
  projectId,
  status,
  others,
  onClose,
}: {
  projectId: string;
  status: ProjectStatus;
  others: ProjectStatus[];
  onClose: () => void;
}) {
  const remove = useDeleteStatus(projectId);
  // Suggest a status in the same category, so the items keep their meaning
  const [target, setTarget] = useState(
    (others.find((s) => s.category === status.category) ?? others[0])?.id ?? "",
  );
  const [error, setError] = useState("");
  const hasItems = status.itemCount > 0;

  async function confirm() {
    try {
      await remove.mutateAsync({ id: status.id, moveToStatusId: hasItems ? target : undefined });
      toast.success(`${status.name} deleted`);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the status"));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Delete ${status.name}?`}
      description={
        hasItems
          ? `${status.itemCount} work ${status.itemCount === 1 ? "item is" : "items are"} in this status. Choose where they go.`
          : "No work items are in this status."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={Trash}
            loading={remove.isPending}
            onClick={() => void confirm()}
          >
            Delete status
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {hasItems && (
          <Select
            label="Move work items to"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setError("");
            }}
            options={others.map((s) => ({
              value: s.id,
              label: `${s.name} (${STATUS_CATEGORY_META[s.category].label})`,
            }))}
          />
        )}
        {error && (
          <p role="alert" className="text-xs text-[#e5484d]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
