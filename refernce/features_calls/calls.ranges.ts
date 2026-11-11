import dayjs from "dayjs";

import { APP_TIME_ZONE } from "@/shared/lib/format";

export const DATE_RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
] as const;

export type DateRangeKey = (typeof DATE_RANGE_OPTIONS)[number]["value"];

const toDay = (value: dayjs.Dayjs) => value.format("YYYY-MM-DD");

/** Turns a preset (or a custom from/to) into the `from`/`to` dates the API expects, in company time. */
export function resolveDateRange(
  range: string | undefined,
  customFrom?: string,
  customTo?: string,
): { from?: string; to?: string } {
  const today = dayjs().tz(APP_TIME_ZONE);

  switch (range) {
    case "today":
      return { from: toDay(today), to: toDay(today) };
    case "yesterday":
      return { from: toDay(today.subtract(1, "day")), to: toDay(today.subtract(1, "day")) };
    case "7d":
      return { from: toDay(today.subtract(6, "day")), to: toDay(today) };
    case "30d":
      return { from: toDay(today.subtract(29, "day")), to: toDay(today) };
    case "custom":
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return {};
  }
}
