import { Link, useParams } from "react-router-dom";
import { Loader2, MicOff } from "lucide-react";

import type { CallDetail } from "@/features/calls";
import {
  CallDirectionLabel,
  CallFlagsCard,
  CallStatusBadge,
  CallTranscriptCard,
  RecordingBadge,
  useCall,
} from "@/features/calls";
import { AudioPlayer } from "@/features/recordings";
import { deviceDetailPath, employeeDetailPath } from "@/shared/constants/routes";
import { formatDuration, formatFullDateTime, formatPhone } from "@/shared/lib/format";
import Banner from "@/shared/ui/Banner";
import Card from "@/shared/ui/Card";
import DescriptionList from "@/shared/ui/DescriptionList";
import EmptyState from "@/shared/ui/EmptyState";
import ErrorState from "@/shared/ui/ErrorState";
import PageHeader from "@/shared/ui/PageHeader";
import Skeleton from "@/shared/ui/Skeleton";

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: call, isPending, isError, error, refetch } = useCall(id);

  if (isPending) return <CallDetailSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Call" />
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this call" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Call with ${call.employee?.name}`}
        description={formatFullDateTime(call.startedAt)}
      />

      {call.flags.length > 0 && (
        <Banner
          variant="danger"
          title={`This call was flagged (${call.flags.length} ${call.flags.length === 1 ? "moment" : "moments"})`}
        >
          {call.flags.map((flag) => flag.reason).join(" · ")}
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title="Recording" action={<RecordingBadge status={call.recordingStatus} />}>
            <RecordingSection call={call} />
          </Card>

          <CallTranscriptCard lines={call.transcript} />

          <CallFlagsCard flags={call.flags} />
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Call info">
            <DescriptionList
              items={[
                { label: "Direction", value: <CallDirectionLabel direction={call.direction} /> },
                {
                  label: "Number",
                  value: <span className="tabular-nums">{formatPhone(call.number)}</span>,
                },
                { label: "Started", value: formatFullDateTime(call.startedAt) },
                {
                  label: "Ended",
                  value: call.endedAt ? formatFullDateTime(call.endedAt) : "In progress",
                },
                {
                  label: "Duration",
                  value: <span className="tabular-nums">{formatDuration(call.durationSec)}</span>,
                },
                { label: "Status", value: <CallStatusBadge status={call.status} /> },
              ]}
            />
          </Card>

          <Card title="Employee" subtitle="Employee at time of call">
            {call.employee ? (
              <div className="text-sm">
                <Link
                  to={employeeDetailPath(call.employee._id)}
                  className="font-medium text-primary-700 hover:underline"
                >
                  {call.employee.name}
                </Link>
                <p className="mt-0.5 text-slate-500">{call.employee.employeeId}</p>
              </div>
            ) : (
              <p className="text-slate-500">Unknown (shared or unassigned phone)</p>
            )}
          </Card>

          <Card title="Device">
            <div className="text-sm">
              <Link
                to={deviceDetailPath(call.device._id)}
                className="font-medium text-primary-700 hover:underline"
              >
                {call.device.model}
              </Link>
              <p className="mt-0.5 text-slate-500">Serial {call.device.serial}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RecordingSection({ call }: { call: CallDetail }) {
  if (call.recordingStatus === "uploaded" && call.audioUrl) {
    return (
      <AudioPlayer
        src={call.audioUrl}
        downloadName={`call-${call.employee?.employeeId ?? "unknown"}-${call.startedAt.slice(0, 10)}.${call.recordingExt ?? "m4a"}`}
      />
    );
  }

  if (call.recordingStatus === "uploading") {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-warning-50 px-4 py-4 text-sm text-warning-700">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
        <div>
          <p className="font-medium">
            {call.status === "in_progress" ? "Call in progress" : "Recording is uploading"}
          </p>
          <p className="mt-0.5">
            The recording is available once the phone has finished uploading it. This page updates
            by itself.
          </p>
        </div>
      </div>
    );
  }

  if (call.recordingStatus === "missing") {
    return (
      <Banner variant="danger" title="No recording available">
        The phone did not upload a recording for this call.
      </Banner>
    );
  }

  return (
    <EmptyState
      bare
      icon={MicOff}
      title="Missed calls have no recording."
      description="Nothing was said, so there is nothing to play."
    />
  );
}

function CallDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading call">
      <div>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
