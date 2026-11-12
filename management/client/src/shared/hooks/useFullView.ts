import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface FullViewState {
  /** True while a page has the app sidebar hidden to use the whole window. */
  fullView: boolean;
  setFullView: (on: boolean) => void;
}

/** Provided by the app layout, which hides the sidebar while `fullView` is on. */
export const FullViewContext = createContext<FullViewState>({
  fullView: false,
  setFullView: () => {},
});

const readStored = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const store = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts until the page is left */
  }
};

/**
 * Full view for one page: hides the sidebar while on, remembers the choice per browser
 * under `storageKey`, exits on Esc, and always gives the sidebar back when the page is left.
 * Pass `enabled: false` to turn the feature off (the page then never hides the sidebar).
 */
export function useFullViewPage(storageKey: string, enabled = true) {
  const { fullView, setFullView } = useContext(FullViewContext);
  const [on, setOn] = useState(() => enabled && readStored(storageKey));

  useEffect(() => {
    setFullView(on);
  }, [on, setFullView]);

  // Leaving the page shows the sidebar again (the stored choice is kept for next time)
  useEffect(() => () => setFullView(false), [setFullView]);

  const change = useCallback(
    (next: boolean) => {
      setOn(next);
      store(storageKey, next);
    },
    [storageKey],
  );

  // Esc leaves full view, unless a dialog or menu is handling it
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[role=dialog]")) return;
      if (
        (e.target as HTMLElement).closest("[role=dialog], [role=menu], input, textarea, select")
      ) {
        return;
      }
      change(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on, change]);

  return { fullView: enabled && fullView, toggle: () => change(!on) };
}
