import { cleanParams } from "@/shared/lib/params";
import { request } from "@/shared/lib/request";
import type { PageParams, PageResult } from "@/shared/types/pagination";

import type { Call, CallDetail, CallFilters } from "../calls.types";

export const listCalls = (params: PageParams & CallFilters) =>
  request.get<PageResult<Call>>("/calls", { params: cleanParams(params) });

export const getCall = (id: string) => request.get<CallDetail>(`/calls/${id}`);
