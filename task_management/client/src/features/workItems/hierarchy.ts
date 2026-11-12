import type { WorkItem } from "@/shared/types/entities";

/** Levels from the top of the plan down to the smallest piece of work. */
export const HIERARCHY_LEVELS = ["EPIC", "FEATURE", "STORY", "TASK", "SUBTASK"] as const;

export function childrenMap(items: WorkItem[]) {
  const map = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const list = map.get(item.parentId) ?? [];
    list.push(item);
    map.set(item.parentId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.order - b.order);
  return map;
}

/** Parents of an item, top first (Epic, Feature, Story…). */
export function ancestorsOf(item: WorkItem, byId: Map<string, WorkItem>) {
  const chain: WorkItem[] = [];
  let current = item.parentId ? byId.get(item.parentId) : undefined;
  while (current && chain.length < 8) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Done and total counts across every item below this one. */
export function rollup(id: string, children: Map<string, WorkItem[]>) {
  let done = 0;
  let total = 0;
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    total += 1;
    if (next.status === "DONE") done += 1;
    stack.push(...(children.get(next.id) ?? []));
  }
  return { done, total, share: total ? done / total : 0 };
}
