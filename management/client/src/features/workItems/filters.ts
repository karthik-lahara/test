// Filter state for work item lists and boards, applied to items already loaded.

export interface FilterValues {
  search: string;
  assignee: string[];
  priority: string[];
  type: string[];
}

export const EMPTY_FILTERS: FilterValues = { search: "", assignee: [], priority: [], type: [] };

/** Applies the bar's filters to items already loaded. */
export function applyFilters<
  T extends { title: string; key: string; assigneeIds: string[]; priority: string; type: string },
>(items: T[] | undefined, filters: FilterValues): T[] | undefined {
  if (!items) return items;
  const search = filters.search.toLowerCase();
  return items.filter(
    (item) =>
      (!search ||
        item.title.toLowerCase().includes(search) ||
        item.key.toLowerCase().includes(search)) &&
      (!filters.assignee.length ||
        filters.assignee.some((a) =>
          a === "none" ? item.assigneeIds.length === 0 : item.assigneeIds.includes(a),
        )) &&
      (!filters.priority.length || filters.priority.includes(item.priority)) &&
      (!filters.type.length || filters.type.includes(item.type)),
  );
}
