import dayjs from "dayjs";

import { useMemberMap } from "@/features/people";
import { formatHours } from "@/shared/lib/format";
import Avatar from "@/shared/ui/Avatar";
import { Card } from "@/shared/ui/Display";

import type { DashboardData } from "../dashboard.api";

/** Completed and created per day for the last week. */
export function WeeklyChart({ weekly }: { weekly: DashboardData["weekly"] }) {
  const max = Math.max(1, ...weekly.flatMap((d) => [d.completed, d.created]));
  return (
    <Card
      title="Last 7 days"
      action={
        <span className="flex items-center gap-3 text-[12px] text-fg-muted">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-[2px] bg-fg-subtle/70" /> Completed
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-[2px] bg-fg-subtle/35" /> Created
          </span>
        </span>
      }
    >
      <div className="flex h-44 items-end gap-2 px-4 pt-4 pb-4">
        {weekly.map((day) => (
          <div
            key={day.date}
            className="flex h-full flex-1 flex-col items-center gap-1.5"
            title={`${dayjs(day.date).format("ddd, MMM D")}: ${day.completed} completed, ${day.created} created`}
          >
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              <div
                className="w-3 rounded-t-[3px] bg-fg-subtle/70 hover:bg-fg-muted transition-all"
                style={{
                  height: `${(day.completed / max) * 100}%`,
                  minHeight: day.completed ? 3 : 0,
                }}
              />
              <div
                className="w-3 rounded-t-[3px] bg-fg-subtle/35 transition-all"
                style={{ height: `${(day.created / max) * 100}%`, minHeight: day.created ? 3 : 0 }}
              />
            </div>
            <span className="text-[12px] text-fg-subtle">{dayjs(day.date).format("dd")}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Open hours left per person, as plain numbers: who has the most on their plate. */
export function WorkloadCard({ workload }: { workload: DashboardData["org"]["workload"] }) {
  const members = useMemberMap();
  const max = Math.max(1, ...workload.map((w) => w.hours));
  return (
    <Card
      title="Team workload"
      action={<span className="text-[12px] text-fg-subtle">open hours left</span>}
    >
      <ul className="flex flex-col gap-2.5 p-4">
        {workload.slice(0, 7).map((row) => {
          const member = members.get(row.memberId);
          const heavy = row.hours > 40;
          return (
            <li key={row.memberId} className="flex items-center gap-2.5 text-[12.5px]">
              <Avatar person={member} size={20} />
              <span className="w-32 truncate text-fg">{member?.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-active">
                <div
                  className={`h-full rounded-full ${heavy ? "bg-[#f06a6a]" : "bg-fg-subtle/70"}`}
                  style={{ width: `${(row.hours / max) * 100}%` }}
                />
              </div>
              <span className="w-20 text-right text-xs text-fg-muted tabular-nums">
                {formatHours(row.hours)} · {row.open}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
