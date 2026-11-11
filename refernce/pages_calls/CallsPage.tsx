import { useMemo } from "react";
import { SearchX } from "lucide-react";

import { CallsTable, DATE_RANGE_OPTIONS, resolveDateRange, useCalls } from "@/features/calls";
import { useDevices } from "@/features/devices";
import { useEmployees } from "@/features/employees";
import { useListParams } from "@/shared/hooks/useListParams";
import { formatDate } from "@/shared/lib/format";
import Button from "@/shared/ui/Button";
import Card from "@/shared/ui/Card";
import EmptyState from "@/shared/ui/EmptyState";
import ErrorState from "@/shared/ui/ErrorState";
import type { ActiveFilter } from "@/shared/ui/FilterBar";
import FilterBar from "@/shared/ui/FilterBar";
import FilterSelect from "@/shared/ui/FilterSelect";
import PageHeader from "@/shared/ui/PageHeader";
import SearchInput from "@/shared/ui/SearchInput";
import TablePagination from "@/shared/ui/TablePagination";

const DIRECTION_OPTIONS = [
  { value: "incoming", label: "Incoming" },
  { value: "outgoing", label: "Outgoing" },
  { value: "missed", label: "Missed" },
];
const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "failed", label: "Failed" },
];
const FLAGGED_OPTIONS = [{ value: "true", label: "Flagged only" }];
const RECORDING_OPTIONS = [
  { value: "has", label: "Has recording" },
  { value: "missing", label: "Missing" },
];

const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

export default function CallsPage() {
  const { params, update, clearFilters } = useListParams();
  const filters = params.filters;

  // Options for the employee and device filters.
  const employees = useEmployees({ limit: 100 });
  const devices = useDevices({ limit: 100 });
  const employeeOptions = useMemo(
    () => (employees.data?.items ?? []).map((e) => ({ value: e._id, label: e.name })),
    [employees.data],
  );
  const deviceOptions = useMemo(
    () => (devices.data?.items ?? []).map((d) => ({ value: d._id, label: d.serial })),
    [devices.data],
  );

  const { from, to } = resolveDateRange(filters.range, filters.from, filters.to);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useCalls({
    page: params.page,
    limit: params.limit,
    sort: params.sort || undefined,
    dir: params.sort ? params.dir : undefined,
    search: filters.search,
    from,
    to,
    direction: filters.direction,
    employeeId: filters.employee,
    deviceId: filters.device,
    status: filters.status,
    recording: filters.recording,
    flagged: filters.flagged,
  });

  const chips: ActiveFilter[] = [];
  if (filters.range) {
    chips.push({
      key: "range",
      label: "Date",
      value:
        filters.range === "custom"
          ? `${filters.from ? formatDate(filters.from) : "Any"} – ${filters.to ? formatDate(filters.to) : "Any"}`
          : labelOf([...DATE_RANGE_OPTIONS], filters.range),
    });
  }
  if (filters.direction)
    chips.push({
      key: "direction",
      label: "Direction",
      value: labelOf(DIRECTION_OPTIONS, filters.direction),
    });
  if (filters.employee)
    chips.push({
      key: "employee",
      label: "Employee",
      value: labelOf(employeeOptions, filters.employee),
    });
  if (filters.device)
    chips.push({ key: "device", label: "Device", value: labelOf(deviceOptions, filters.device) });
  if (filters.status)
    chips.push({ key: "status", label: "Status", value: labelOf(STATUS_OPTIONS, filters.status) });
  if (filters.recording)
    chips.push({
      key: "recording",
      label: "Recording",
      value: labelOf(RECORDING_OPTIONS, filters.recording),
    });
  if (filters.flagged) chips.push({ key: "flagged", label: "Review", value: "Flagged only" });
  if (filters.search) chips.push({ key: "search", label: "Search", value: filters.search });

  function removeChip(key: string) {
    // Removing a custom range also forgets its dates.
    update(
      key === "range" ? { range: undefined, from: undefined, to: undefined } : { [key]: undefined },
    );
  }

  const hasFilters = chips.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calls" description="Review recorded calls from company phones." />

      <FilterBar chips={chips} onRemoveChip={removeChip} onClearAll={clearFilters}>
        <SearchInput
          label="Search calls"
          placeholder="Employee name or number"
          value={filters.search ?? ""}
          onChange={(value) => update({ search: value })}
          className="w-full sm:w-64"
        />
        <FilterSelect
          label="Date range"
          allLabel="Any date"
          value={filters.range ?? ""}
          options={[...DATE_RANGE_OPTIONS]}
          onChange={(value) => update({ range: value, from: undefined, to: undefined })}
        />
        {filters.range === "custom" && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="date"
              aria-label="From date"
              value={filters.from ?? ""}
              max={filters.to}
              onChange={(event) => update({ from: event.target.value })}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
            />
            to
            <input
              type="date"
              aria-label="To date"
              value={filters.to ?? ""}
              min={filters.from}
              onChange={(event) => update({ to: event.target.value })}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
            />
          </div>
        )}
        <FilterSelect
          label="Direction"
          allLabel="All directions"
          value={filters.direction ?? ""}
          options={DIRECTION_OPTIONS}
          onChange={(value) => update({ direction: value })}
        />
        <FilterSelect
          label="Employee"
          allLabel="All employees"
          value={filters.employee ?? ""}
          options={employeeOptions}
          onChange={(value) => update({ employee: value })}
        />
        <FilterSelect
          label="Device"
          allLabel="All devices"
          value={filters.device ?? ""}
          options={deviceOptions}
          onChange={(value) => update({ device: value })}
        />
        <FilterSelect
          label="Status"
          allLabel="All statuses"
          value={filters.status ?? ""}
          options={STATUS_OPTIONS}
          onChange={(value) => update({ status: value })}
        />
        <FilterSelect
          label="Flagged"
          allLabel="All calls"
          value={filters.flagged ?? ""}
          options={FLAGGED_OPTIONS}
          onChange={(value) => update({ flagged: value })}
        />
        <FilterSelect
          label="Recording"
          allLabel="Any recording"
          value={filters.recording ?? ""}
          options={RECORDING_OPTIONS}
          onChange={(value) => update({ recording: value })}
        />
      </FilterBar>

      {isError && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load calls" />
      ) : (
        <Card noPadding>
          <div
            className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}
          >
            <CallsTable
              calls={data?.items ?? []}
              isLoading={isPending}
              sort={{
                key: params.sort || "startedAt",
                direction: params.sort ? params.dir : "desc",
              }}
              onSortChange={({ key, direction }) => update({ sort: key, dir: direction })}
              emptyState={
                hasFilters ? (
                  <EmptyState
                    bare
                    icon={SearchX}
                    illustration="none-found"
                    title="No calls match these filters."
                    action={
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : undefined
              }
            />
          </div>
          <TablePagination
            page={data?.page ?? params.page}
            pageSize={params.limit}
            total={data?.total ?? 0}
            onPageChange={(page) => update({ page })}
            onPageSizeChange={(limit) => update({ limit })}
          />
        </Card>
      )}
    </div>
  );
}
