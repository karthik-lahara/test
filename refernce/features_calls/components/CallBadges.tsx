import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";

import StatusBadge from "@/shared/ui/StatusBadge";

import type { CallDirection, CallStatus, RecordingStatus } from "../calls.types";

const DIRECTIONS = {
  incoming: { label: "Incoming", icon: PhoneIncoming, className: "text-slate-700" },
  outgoing: { label: "Outgoing", icon: PhoneOutgoing, className: "text-slate-700" },
  missed: { label: "Missed", icon: PhoneMissed, className: "text-danger-700" },
} as const;

export function CallDirectionLabel({ direction }: { direction: CallDirection }) {
  const { label, icon: Icon, className } = DIRECTIONS[direction];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

export function RecordingBadge({ status }: { status: RecordingStatus }) {
  // Missed calls have nothing to record, so there is nothing to flag.
  if (status === "none") return <span className="text-slate-400">—</span>;
  return <StatusBadge status={status} />;
}

export function CallStatusBadge({ status }: { status: CallStatus }) {
  return <StatusBadge status={status} />;
}
