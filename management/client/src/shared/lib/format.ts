import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const formatDate = (value?: string | null, pattern = "MMM D") =>
  value ? dayjs(value).format(pattern) : "";

export const formatDateLong = (value?: string | null) => formatDate(value, "MMM D, YYYY");

export const fromNow = (value: string) => dayjs(value).fromNow();

export const formatHours = (hours?: number | null) => {
  if (hours == null) return "–";
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Days until the date; negative when it is past. */
export const daysUntil = (value: string) =>
  dayjs(value).startOf("day").diff(dayjs().startOf("day"), "day");

export const isOverdue = (dueDate?: string | null, done = false) =>
  Boolean(dueDate) && !done && daysUntil(dueDate!) < 0;

export const todayIso = () => dayjs().format("YYYY-MM-DD");
