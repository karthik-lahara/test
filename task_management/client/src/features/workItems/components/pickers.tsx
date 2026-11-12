import type { MouseEvent } from "react";
import { CalendarBlank, UserCircle } from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import {
  PRIORITIES,
  type Priority,
  PRIORITY_META,
  STATUS_META,
  TYPE_META,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  type WorkItemStatus,
  type WorkItemType,
} from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { daysUntil, formatDate } from "@/shared/lib/format";
import Avatar, { AvatarStack } from "@/shared/ui/Avatar";
import Picker from "@/shared/ui/Picker";
import PropertyButton from "@/shared/ui/PropertyButton";
import { PriorityIcon, StatusIcon, TypeIcon } from "@/shared/ui/WorkIcons";

const stop = (event: MouseEvent) => event.stopPropagation();

interface PickerProps<T> {
  value: T;
  onChange: (value: T) => void;
  /** Icon only, for dense rows and cards. */
  compact?: boolean;
  disabled?: boolean;
}

export function StatusPicker({
  value,
  onChange,
  compact,
  disabled,
  pill,
}: PickerProps<WorkItemStatus> & { pill?: boolean }) {
  return (
    <span onClick={stop}>
      <Picker
        searchable={false}
        value={[value]}
        onChange={([v]) => onChange(v as WorkItemStatus)}
        options={WORK_ITEM_STATUSES.map((s) => ({
          value: s,
          label: STATUS_META[s].label,
          icon: <StatusIcon status={s} />,
        }))}
        trigger={({ toggle }) =>
          pill ? (
            <button
              type="button"
              onClick={toggle}
              disabled={disabled}
              aria-label={`Status: ${STATUS_META[value].label}`}
              className="inline-flex h-6 w-[108px] items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold whitespace-nowrap transition-opacity hover:opacity-80"
              style={{
                background: `${STATUS_META[value].color}1a`,
                color: STATUS_META[value].color,
              }}
            >
              <StatusIcon status={value} size={13} />
              {STATUS_META[value].label}
            </button>
          ) : (
            <PropertyButton
              onClick={toggle}
              compact={compact}
              disabled={disabled}
              aria-label={`Status: ${STATUS_META[value].label}`}
            >
              <StatusIcon status={value} />
              {!compact && STATUS_META[value].label}
            </PropertyButton>
          )
        }
      />
    </span>
  );
}

export function PriorityPicker({ value, onChange, compact, disabled }: PickerProps<Priority>) {
  return (
    <span onClick={stop}>
      <Picker
        searchable={false}
        value={[value]}
        onChange={([v]) => onChange(v as Priority)}
        options={PRIORITIES.map((p) => ({
          value: p,
          label: PRIORITY_META[p].label,
          icon: <PriorityIcon priority={p} />,
        }))}
        trigger={({ toggle }) => (
          <PropertyButton
            onClick={toggle}
            compact={compact}
            disabled={disabled}
            muted={value === "NONE"}
            aria-label={`Priority: ${PRIORITY_META[value].label}`}
          >
            <span className="text-fg-muted">
              <PriorityIcon priority={value} />
            </span>
            {!compact && PRIORITY_META[value].label}
          </PropertyButton>
        )}
      />
    </span>
  );
}

export function TypePicker({ value, onChange, compact, disabled }: PickerProps<WorkItemType>) {
  return (
    <span onClick={stop}>
      <Picker
        searchable={false}
        value={[value]}
        onChange={([v]) => onChange(v as WorkItemType)}
        options={WORK_ITEM_TYPES.map((t) => ({
          value: t,
          label: TYPE_META[t].label,
          icon: <TypeIcon type={t} />,
        }))}
        trigger={({ toggle }) => (
          <PropertyButton onClick={toggle} compact={compact} disabled={disabled}>
            <TypeIcon type={value} />
            {!compact && TYPE_META[value].label}
          </PropertyButton>
        )}
      />
    </span>
  );
}

interface AssigneePickerProps extends PickerProps<string[]> {
  /** Limit choices to these members (the project's members). */
  memberIds?: string[];
  multiple?: boolean;
}

export function AssigneePicker({
  value,
  onChange,
  compact,
  disabled,
  memberIds,
  multiple = true,
}: AssigneePickerProps) {
  const members = useMemberMap();
  const people = value.flatMap((id) => members.get(id) ?? []);
  const options = [...members.values()]
    .filter(
      (m) =>
        m.status === "ACTIVE" && (!memberIds || memberIds.includes(m.id) || value.includes(m.id)),
    )
    .map((m) => ({
      value: m.id,
      label: m.name,
      icon: <Avatar person={m} size={16} />,
      hint: m.availability === "ON_LEAVE" ? "On leave" : undefined,
    }));

  return (
    <span onClick={stop}>
      <Picker
        multiple={multiple}
        value={value}
        onChange={onChange}
        placeholder="Assign to…"
        options={options}
        trigger={({ toggle }) => (
          <PropertyButton
            onClick={toggle}
            compact={compact}
            disabled={disabled}
            muted={people.length === 0}
            aria-label="Assignees"
          >
            {people.length === 0 ? (
              compact ? (
                <Avatar person={null} size={18} />
              ) : (
                <>
                  <UserCircle size={16} />
                  Unassigned
                </>
              )
            ) : people.length === 1 ? (
              <>
                <Avatar person={people[0]} size={18} />
                {!compact && people[0].name}
              </>
            ) : (
              <>
                <AvatarStack people={people} size={18} />
                {!compact && `${people.length} people`}
              </>
            )}
          </PropertyButton>
        )}
      />
    </span>
  );
}

export function DueDateLabel({ dueDate, done }: { dueDate: string | null; done?: boolean }) {
  if (!dueDate) return null;
  const days = daysUntil(dueDate);
  const tone = done
    ? "text-fg-subtle"
    : days < 0
      ? "text-[#e5484d]"
      : days <= 1
        ? "text-[#d9860b]"
        : "text-fg-muted";
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", tone)}
      title={`ETA ${formatDate(dueDate, "MMM D, YYYY")}`}
    >
      <CalendarBlank size={12} />
      {days === 0 ? "Today" : days === 1 ? "Tomorrow" : formatDate(dueDate)}
    </span>
  );
}

export function DueDateInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12.5px] hover:bg-hover">
      <CalendarBlank size={15} className="text-fg-muted" />
      <span className={value ? "text-fg" : "text-fg-subtle"}>
        {value ? formatDate(value, "MMM D, YYYY") : "Set ETA"}
      </span>
      <input
        type="date"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="ETA"
      />
    </label>
  );
}
