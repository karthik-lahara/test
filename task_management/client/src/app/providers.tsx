import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { CURRENT_USER_QUERY_KEY } from "@/features/auth";
import { setUnauthorizedHandler } from "@/shared/lib/apiClient";
import { queryClient } from "@/shared/lib/queryClient";
import { toast } from "@/shared/lib/toast";
import Toaster from "@/shared/ui/Toaster";

setUnauthorizedHandler(() => {
  queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== CURRENT_USER_QUERY_KEY[0],
  });
  toast.warning("Your session has expired", {
    id: "session-expired",
    description: "Please sign in again.",
  });
});

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
