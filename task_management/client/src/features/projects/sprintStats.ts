import dayjs, { type Dayjs } from "dayjs";

import { isSprintPlannable } from "@/shared/constants/workItem";
import type { Sprint, WorkItem } from "@/shared/types/entities";

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

/** Working days from `from` to `to`, both included. */
export function workingDaysBetween(
  from: string | Dayjs,
  to: string | Dayjs,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
) {
  let count = 0;
  for (let d = dayjs(from).startOf("day"); !d.isAfter(dayjs(to), "day"); d = d.add(1, "day"))
    if (workingDays.includes(d.day())) count++;
  return count;
}

/**
 * The items a sprint is planned with: stories, bugs and stand-alone tasks. A story's tasks are
 * part of the story, so they are not counted again.
 */
export function plannableItems(items: WorkItem[]) {
  const byId = new Map(items.map((w) => [w.id, w]));
  return items.filter((w) =>
    isSprintPlannable(w.type, w.parentId ? byId.get(w.parentId)?.type : null),
  );
}

export const pointsOf = (items: WorkItem[]) => items.reduce((s, w) => s + (w.storyPoints ?? 0), 0);

/** Average story points finished in the last three completed sprints. */
export function velocityOf(sprints: Sprint[], items: WorkItem[]) {
  const planned = plannableItems(items);
  const recent = sprints
    // A sprint that held no work says nothing about the team's pace.
    .filter((s) => s.status === "COMPLETED" && planned.some((w) => w.sprintId === s.id))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, 3)
    .map((s) => ({
      name: s.name,
      points: pointsOf(planned.filter((w) => w.sprintId === s.id && w.status === "DONE")),
    }));
  const average = recent.length
    ? Math.round(recent.reduce((s, r) => s + r.points, 0) / recent.length)
    : null;
  return { average, recent };
}

export interface BurndownPoint {
  date: string;
  /** Where the team should be if work finished evenly over the working days. */
  ideal: number;
  /** What was left at the end of that day; null for days still to come. */
  actual: number | null;
  working: boolean;
}

/**
 * Work left per day of the sprint. Counts story points; when nothing in the sprint has points,
 * counts items instead so the chart still means something.
 */
export function burndownOf(
  sprint: Sprint,
  items: WorkItem[],
  workingDays: number[] = DEFAULT_WORKING_DAYS,
) {
  const planned = plannableItems(items).filter((w) => w.sprintId === sprint.id);
  const usePoints = planned.some((w) => w.storyPoints);
  const unit: "points" | "items" = usePoints ? "points" : "items";
  const weight = (w: WorkItem) => (usePoints ? (w.storyPoints ?? 0) : 1);
  const total = planned.reduce((s, w) => s + weight(w), 0);
  const totalWorking = Math.max(
    1,
    workingDaysBetween(sprint.startDate, sprint.endDate, workingDays),
  );
  const today = dayjs().startOf("day");

  const days: BurndownPoint[] = [];
  let workedSoFar = 0;
  for (
    let d = dayjs(sprint.startDate);
    !d.isAfter(dayjs(sprint.endDate), "day");
    d = d.add(1, "day")
  ) {
    const working = workingDays.includes(d.day());
    if (working) workedSoFar++;
    const doneBy = planned
      .filter(
        (w) => w.status === "DONE" && w.completedAt && !dayjs(w.completedAt).isAfter(d, "day"),
      )
      .reduce((s, w) => s + weight(w), 0);
    days.push({
      date: d.format("YYYY-MM-DD"),
      ideal: Math.max(0, total - (total * workedSoFar) / totalWorking),
      actual: d.isAfter(today, "day") ? null : total - doneBy,
      working,
    });
  }
  return { days, total, unit };
}
