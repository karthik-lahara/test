import { useMemo, useState } from "react";
import dayjs from "dayjs";

import type { ProgressPoint } from "../projects.types";

const W = 420;
const H = 170;
const PAD = { top: 8, right: 8, bottom: 22, left: 8 };

const SERIES = [
  { key: "scope", label: "Scope", color: "var(--fg-subtle)" },
  { key: "started", label: "Started", color: "#5e9bff" },
  { key: "completed", label: "Completed", color: "var(--accent)" },
] as const;

interface ProgressChartProps {
  points: ProgressPoint[];
  endDate: string | null;
}

/**
 * Scope, started and completed over time. After today the chart projects the
 * completed line at the recent pace up to the end date, shown dashed.
 */
export default function ProgressChart({ points, endDate }: ProgressChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const first = dayjs(points[0].date);
    const last = dayjs(points[points.length - 1].date);
    const end = endDate && dayjs(endDate).isAfter(last) ? dayjs(endDate) : last.add(7, "day");
    const totalDays = Math.max(1, end.diff(first, "day"));
    const max = Math.max(1, ...points.map((p) => p.scope)) * 1.1;
    const x = (date: string) =>
      PAD.left + (dayjs(date).diff(first, "day") / totalDays) * (W - PAD.left - PAD.right);
    const y = (value: number) => PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom);
    const line = (key: "scope" | "started" | "completed") =>
      points
        .map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p[key]).toFixed(1)}`)
        .join(" ");

    const lastPoint = points[points.length - 1];
    const weekAgo = points[Math.max(0, points.length - 8)];
    const pace = Math.max(0.05, (lastPoint.completed - weekAgo.completed) / 7);
    const projected = Math.min(lastPoint.scope, lastPoint.completed + pace * end.diff(last, "day"));
    return {
      x,
      y,
      first,
      end,
      todayX: x(lastPoint.date),
      lines: {
        scope: `${line("scope")} L${x(end.format("YYYY-MM-DD"))},${y(lastPoint.scope)}`,
        started: line("started"),
        completed: line("completed"),
      },
      area: `${line("completed")} L${x(lastPoint.date)},${y(0)} L${x(points[0].date)},${y(0)} Z`,
      projection: `M${x(lastPoint.date)},${y(lastPoint.completed)} L${x(end.format("YYYY-MM-DD"))},${y(projected)}`,
      last: lastPoint,
    };
  }, [points, endDate]);

  if (!model) return <div className="h-40" />;
  const shown = hover !== null ? points[hover] : model.last;

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {SERIES.map((s) => (
          <div key={s.key}>
            <div className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span className="size-2 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </div>
            <div className="text-[14px] font-semibold text-fg tabular-nums">{shown[s.key]}</div>
          </div>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Project progress over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * W;
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(model.x(p.date) - px) < Math.abs(model.x(points[best].date) - px))
              best = i;
          });
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id="completed-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <pattern
            id="future-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="#f06a6a"
              strokeOpacity="0.35"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>
        <rect
          x={model.todayX}
          y={PAD.top}
          width={W - PAD.right - model.todayX}
          height={H - PAD.top - PAD.bottom}
          fill="url(#future-hatch)"
          opacity="0.6"
        />
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--line-strong)"
        />
        <path d={model.area} fill="url(#completed-fill)" />
        <path d={model.lines.scope} fill="none" stroke="var(--fg-subtle)" strokeWidth="1.5" />
        <path d={model.lines.started} fill="none" stroke="#5e9bff" strokeWidth="1.5" />
        <path d={model.lines.completed} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <path
          d={model.projection}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <line
          x1={model.todayX}
          x2={model.todayX}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="#f06a6a"
          strokeWidth="1"
        />
        <circle cx={model.todayX} cy={model.y(model.last.started)} r="3" fill="#5e9bff" />
        <circle cx={model.todayX} cy={model.y(model.last.completed)} r="3" fill="var(--accent)" />
        {hover !== null && (
          <line
            x1={model.x(points[hover].date)}
            x2={model.x(points[hover].date)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--fg-muted)"
            strokeDasharray="2 2"
          />
        )}
        <text x={PAD.left} y={H - 6} fontSize="10" fill="var(--fg-subtle)">
          {model.first.format("MMM D")}
        </text>
        <text x={model.todayX} y={H - 6} fontSize="10" fill="var(--fg-muted)" textAnchor="middle">
          {hover !== null ? dayjs(points[hover].date).format("MMM D") : "Today"}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill="var(--fg-subtle)" textAnchor="end">
          {model.end.format("MMM D")}
        </text>
      </svg>
    </div>
  );
}
