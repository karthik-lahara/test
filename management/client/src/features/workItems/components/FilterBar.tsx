import type { ReactNode } from "react";
import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import { PRIORITIES, PRIORITY_META, TYPE_META, WORK_ITEM_TYPES } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import Avatar from "@/shared/ui/Avatar";
import Picker, { type PickerOption } from "@/shared/ui/Picker";
import { PriorityIcon, TypeIcon } from "@/shared/ui/WorkIcons";

import { EMPTY_FILTERS, type FilterValues } from "../filters";

function FilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const active = value.length > 0;
  const summary = active
    ? value.length === 1
      ? options.find((o) => o.value === value[0])?.label
      : `${value.length} selected`
    : null;
  return (
    <Picker
      multiple
      options={options}
      value={value}
      onChange={onChange}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors",
            active
              ? "border-accent/50 bg-accent-soft text-fg"
              : "border-dashed border-line-strong text-fg-muted hover:bg-hover hover:text-fg",
          )}
        >
          {label}
          {summary && <span className="font-medium">: {summary}</span>}
          <CaretDown size={10} />
        </button>
      )}
    />
  );
}

interface FilterBarProps {
  value: FilterValues;
  onChange: (value: FilterValues) => void;
  memberIds?: string[];
  hideAssignee?: boolean;
  right?: ReactNode;
}

export default function FilterBar({
  value,
  onChange,
  memberIds,
  hideAssignee,
  right,
}: FilterBarProps) {
  const members = useMemberMap();
  const set = (patch: Partial<FilterValues>) => onChange({ ...value, ...patch });
  const dirty = value.search || value.assignee.length || value.priority.length || value.type.length;

  const assigneeOptions: PickerOption[] = [
    { value: "none", label: "Unassigned", icon: <Avatar person={null} size={16} /> },
    ...[...members.values()]
      .filter((m) => m.status === "ACTIVE" && (!memberIds || memberIds.includes(m.id)))
      .map((m) => ({ value: m.id, label: m.name, icon: <Avatar person={m} size={16} /> })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2 md:px-6">
      <label className="relative flex h-8 w-full items-center sm:w-60">
        <MagnifyingGlass
          size={14}
          className="pointer-events-none absolute left-2.5 text-fg-subtle"
        />
        <input
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search by title or key"
          className="h-8 w-full rounded-md border border-line bg-raised/60 pr-3 pl-8 text-[12.5px] text-fg placeholder:text-fg-subtle field-glow focus:bg-panel focus:outline-none"
        />
      </label>
      {!hideAssignee && (
        <FilterChip
          label="Assignee"
          options={assigneeOptions}
          value={value.assignee}
          onChange={(assignee) => set({ assignee })}
        />
      )}
      <FilterChip
        label="Priority"
        options={PRIORITIES.map((p) => ({
          value: p,
          label: PRIORITY_META[p].label,
          icon: <PriorityIcon priority={p} />,
        }))}
        value={value.priority}
        onChange={(priority) => set({ priority })}
      />
      <FilterChip
        label="Type"
        options={WORK_ITEM_TYPES.map((t) => ({
          value: t,
          label: TYPE_META[t].label,
          icon: <TypeIcon type={t} />,
        }))}
        value={value.type}
        onChange={(type) => set({ type })}
      />
      {dirty ? (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex h-8 items-center gap-1 px-2 text-[12.5px] font-medium text-fg-muted hover:text-fg"
        >
          <X size={12} />
          Clear
        </button>
      ) : null}
      <span className="flex-1" />
      {right}
    </div>
  );
}
