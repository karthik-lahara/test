import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneOff } from "lucide-react";

import { callDetailPath } from "@/shared/constants/routes";
import { formatDateTime } from "@/shared/lib/format";
import type { SortState, TableColumn } from "@/shared/ui/DataTable";
import DataTable from "@/shared/ui/DataTable";
import Duration from "@/shared/ui/Duration";
import EmptyState from "@/shared/ui/EmptyState";
import MaskedPhone from "@/shared/ui/MaskedPhone";
import StatusBadge from "@/shared/ui/StatusBadge";

import type { Call } from "../calls.types";
import { CallDirectionLabel, CallStatusBadge, RecordingBadge } from "./CallBadges";

interface CallsTableProps {
  calls: Call[];
  isLoading?: boolean;
  /** Hide the employee column where the page is already about one employee. */
  hideEmployee?: boolean;
  /** Fewer, shorter rows for dashboard and profile summaries. */
  loadingRows?: number;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** For summaries inside other pages: no inner scrolling. */
  compact?: boolean;
  /** Column keys to leave out, e.g. ["number", "recording"]. */
  hideColumns?: string[];
  /** Replaces the default "No calls yet" message, e.g. with a "Clear filters" action. */
  emptyState?: React.ReactNode;
}

export default function CallsTable({
  calls,
  isLoading,
  hideEmployee = false,
  compact = false,
  hideColumns = [],
  loadingRows,
  sort,
  onSortChange,
  emptyState,
}: CallsTableProps) {
  const navigate = useNavigate();
  // A string, so a new array literal from the caller doesn't rebuild the columns every render.
  const hiddenKeys = hideColumns.join(",");

  const columns = useMemo<TableColumn<Call>[]>(() => {
    const all: TableColumn<Call>[] = [
      {
        key: "employee",
        header: "Employee",
        cell: (call) => (
          <div>
            <p className="font-medium text-slate-900">{call.employee?.name ?? "Unassigned"}</p>
            <p className="text-xs text-slate-500">{call.employee?.employeeId ?? "-"}</p>
          </div>
        ),
      },
      {
        key: "number",
        header: "Number",
        cell: (call) => <MaskedPhone value={call.number} />,
      },
      {
        key: "direction",
        size: "narrow",
        header: "Direction",
        cell: (call) => <CallDirectionLabel direction={call.direction} />,
      },
      {
        key: "startedAt",
        header: "Started",
        sortable: true,
        cell: (call) => <span className="tabular-nums">{formatDateTime(call.startedAt)}</span>,
      },
      {
        key: "durationSec",
        size: "narrow",
        header: "Duration",
        sortable: true,
        align: "center",
        cell: (call) => <Duration seconds={call.durationSec} />,
      },
      {
        key: "recording",
        size: "narrow",
        header: "Recording",
        cell: (call) => <RecordingBadge status={call.recordingStatus} />,
      },
      {
        key: "status",
        size: "narrow",
        header: "Status",
        cell: (call) => (
          <div className="flex items-center gap-1.5">
            <CallStatusBadge status={call.status} />
            {call.flagCount > 0 && (
              <StatusBadge status="flagged">
                Flagged{call.flagCount > 1 ? ` (${call.flagCount})` : ""}
              </StatusBadge>
            )}
          </div>
        ),
      },
    ];
    const hidden = hiddenKeys.split(",");
    return all.filter(
      (column) => !(hideEmployee && column.key === "employee") && !hidden.includes(column.key),
    );
  }, [hideEmployee, hiddenKeys]);

  return (
    <DataTable
      caption="Calls"
      columns={columns}
      rows={calls}
      getRowKey={(call) => call._id}
      onRowClick={(call) => navigate(callDetailPath(call._id))}
      isLoading={isLoading}
      stickyHeader={!compact}
      loadingRows={loadingRows}
      sort={sort}
      onSortChange={onSortChange}
      emptyState={
        emptyState ?? (
          <EmptyState
            bare
            icon={PhoneOff}
            illustration="empty"
            title="No calls yet"
            description="Calls appear here after employees make or receive them on their company phones."
          />
        )
      }
    />
  );
}
