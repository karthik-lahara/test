import { FileText, Flag } from "lucide-react";

import { formatDuration } from "@/shared/lib/format";
import Card from "@/shared/ui/Card";
import EmptyState from "@/shared/ui/EmptyState";

import type { CallFlag, TranscriptLine } from "../calls.types";

/** Flagged moments: what was flagged and when in the call it happened. */
export function CallFlagsCard({ flags }: { flags: CallFlag[] }) {
  return (
    <Card
      title="Flags"
      action={
        flags.length > 0 ? (
          <span className="text-xs font-medium text-danger-700">{flags.length} flagged</span>
        ) : undefined
      }
    >
      {flags.length === 0 ? (
        <EmptyState
          bare
          icon={Flag}
          illustration="all-clear"
          title="No flags."
          description="Flagged moments, with the reason and timestamp, will show here."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {flags.map((flag) => (
            <li
              key={`${flag.atSec}-${flag.reason}`}
              className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-danger-50 text-danger-600">
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900">{flag.reason}</p>
                <p className="text-xs tabular-nums text-slate-500">
                  At {formatDuration(flag.atSec)} into the call
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Speaker-labelled lines with timestamps. Flagged lines stand out. */
export function CallTranscriptCard({ lines }: { lines: TranscriptLine[] | null }) {
  return (
    <Card title="Transcript">
      {!lines ? (
        <EmptyState
          bare
          icon={FileText}
          illustration="transcript"
          title="Transcript will appear here once processing is complete."
          description="Speaker-labelled lines with timestamps will show here."
        />
      ) : (
        <ol className="flex flex-col gap-1">
          {lines.map((line) => (
            <li
              key={`${line.atSec}-${line.speaker}`}
              className={`grid grid-cols-[3rem_5rem_1fr] gap-3 rounded-md px-2 py-1.5 text-sm ${
                line.flagged ? "bg-danger-50" : ""
              }`}
            >
              <span className="tabular-nums text-slate-500">{formatDuration(line.atSec)}</span>
              <span className="font-medium text-slate-700">{line.speaker}</span>
              <span className={line.flagged ? "font-medium text-danger-700" : "text-slate-900"}>
                {line.text}
                {line.flagged && <span className="sr-only"> (flagged)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
