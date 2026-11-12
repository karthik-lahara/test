import { Suspense, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { List } from "@phosphor-icons/react";

import { CreateWorkItemProvider } from "@/features/workItems";
import { ROUTES } from "@/shared/constants/routes";
import { FullViewContext } from "@/shared/hooks/useFullView";
import { cn } from "@/shared/lib/cn";
import { Skeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Logo from "@/shared/ui/Logo";

import QuickSearch from "./QuickSearch";
import ShortcutsDialog from "./ShortcutsDialog";
import Sidebar from "./Sidebar";

const GO_TO: Record<string, string> = {
  d: ROUTES.DASHBOARD,
  m: ROUTES.MY_WORK,
  i: ROUTES.INBOX,
  a: ROUTES.ASSISTANT,
  p: ROUTES.PROJECTS,
  t: ROUTES.TEAMS,
};

export default function AppLayout() {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  // A page in full view (e.g. Projects) hides the sidebar to use the whole window
  const [fullView, setFullView] = useState(false);
  const fullViewState = useMemo(() => ({ fullView, setFullView }), [fullView]);
  const { pathname } = useLocation();
  // The assistant is a full-page chat, so the menu starts hidden there; the choice holds per page.
  const onAssistant = pathname.startsWith(ROUTES.ASSISTANT);
  const [menuChoice, setMenuChoice] = useState<{ path: string; hidden: boolean } | null>(null);
  const menuHidden = onAssistant && (menuChoice?.path === pathname ? menuChoice.hidden : true);
  const toggleMenu = () => {
    if (window.matchMedia("(min-width: 1024px)").matches)
      setMenuChoice({ path: pathname, hidden: !menuHidden });
    else setNavOpen((v) => !v);
  };

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      const target = e.target as HTMLElement;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")
      )
        return;
      const key = e.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const to = GO_TO[key];
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      if (key === "g") pendingG = Date.now();
      else if (key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <FullViewContext.Provider value={fullViewState}>
      <CreateWorkItemProvider>
        <div className="flex h-screen overflow-hidden bg-canvas">
          {navOpen && (
            <div
              className="fixed inset-0 z-30 bg-overlay lg:hidden"
              onClick={() => setNavOpen(false)}
            />
          )}
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 w-[240px] shrink-0 transition-transform lg:static lg:translate-x-0",
              fullView && "hidden",
              menuHidden && "lg:hidden",
              navOpen ? "translate-x-0 shadow-pop" : "-translate-x-full",
            )}
          >
            <Sidebar
              onNavigate={() => setNavOpen(false)}
              onSearch={() => setSearchOpen(true)}
              onShortcuts={() => setShortcutsOpen(true)}
            />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className={cn(
                "flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 lg:hidden",
                fullView && "hidden",
              )}
            >
              <IconButton icon={List} label="Open navigation" onClick={() => setNavOpen(true)} />
              <Logo size={20} />
              <span className="text-[13px] font-semibold">Lahara Tasks</span>
            </div>
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
              <Suspense
                fallback={
                  // The chat page loads quietly; a page-shaped placeholder looks odd there.
                  onAssistant ? null : (
                    <div className="flex flex-col gap-3 p-8">
                      <Skeleton className="h-7 w-56" />
                      <Skeleton className="h-64" />
                    </div>
                  )
                }
              >
                <Outlet context={{ menuHidden, toggleMenu }} />
              </Suspense>
            </main>
          </div>
        </div>
        {searchOpen && <QuickSearch onClose={() => setSearchOpen(false)} />}
        {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      </CreateWorkItemProvider>
    </FullViewContext.Provider>
  );
}
