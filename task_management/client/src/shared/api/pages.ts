import { request } from "@/shared/lib/request";

import type { ApiPagination } from "./contract";

/** The server's largest page (MAX_PAGE_LIMIT in server/src/utils/pagination.ts). */
export const PAGE_LIMIT = 100;

/**
 * Reads every page of a contract list (`{ <key>: T[], pagination }`) and returns the items.
 * `maxPages` caps long lists such as notifications, which only need the newest.
 */
export async function fetchAllPages<T>(
  path: string,
  key: string,
  params: Record<string, unknown> = {},
  maxPages = Infinity,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await request.get<Record<string, T[]> & { pagination: ApiPagination }>(path, {
      params: { ...params, page, limit: PAGE_LIMIT },
    });
    all.push(...result[key]);
    if (page >= result.pagination.totalPages) break;
  }
  return all;
}
