import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import axios from "axios";

import type { ApiErrorResponse } from "@/shared/types/api";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

/**
 * Puts the server's field errors on the matching inputs, or a message above the form.
 * `fieldMap` translates server field paths to form field names when they differ
 * (e.g. `bank.ifsc` -> `ifsc`).
 */
export function applyServerErrors<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  error: unknown,
  fieldMap: Record<string, string> = {},
): void {
  const fieldNames = Object.keys(form.getValues());
  let shownOnField = false;

  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    for (const { field: serverField, message } of error.response?.data?.errors ?? []) {
      const field = fieldMap[serverField] ?? serverField;
      if (fieldNames.includes(field)) {
        form.setError(field as Path<TFieldValues>, { type: "server", message });
        shownOnField = true;
      }
    }
  }

  if (!shownOnField) {
    form.setError("root.server", {
      type: "server",
      message: getApiErrorMessage(error),
    });
  }
}
