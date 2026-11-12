import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Dark by default (set in index.html); the choice is remembered per browser. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read);

  const setTheme = useCallback((next: Theme) => {
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("tm.theme", next);
    } catch {
      /* storage blocked: the choice lasts until reload */
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
