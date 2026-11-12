import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/shared/hooks/useTheme";

export default function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--raised)",
          border: "1px solid var(--line)",
          color: "var(--fg)",
          fontSize: 13,
        },
      }}
    />
  );
}
