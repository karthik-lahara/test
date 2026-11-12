import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowsLeftRight,
  CaretUpDown,
  ChartPieSlice,
  CheckCircle,
  Cube,
  Gear,
  type Icon,
  Keyboard,
  MagnifyingGlass,
  Moon,
  NotePencil,
  Plus,
  SignOut,
  Star,
  Sun,
  Tray,
  UserCircle,
  Users,
  UsersThree,
} from "@phosphor-icons/react";

import { useLogout, usePermissions } from "@/features/auth";
import { useUnreadCount } from "@/features/notifications";
import { useOrganization } from "@/features/people";
import { useProjects } from "@/features/projects";
import { useCreateWorkItemDialog } from "@/features/workItems";
import { env } from "@/shared/config/env";
import { projectPath, ROUTES } from "@/shared/constants/routes";
import { ROLE_LABELS } from "@/shared/constants/workItem";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/lib/cn";
import AiAgent from "@/shared/ui/AiAgent";
import Avatar from "@/shared/ui/Avatar";
import { Kbd } from "@/shared/ui/Display";
import Logo from "@/shared/ui/Logo";
import Menu from "@/shared/ui/Menu";

const linkClass = (active: boolean) =>
  cn(
    "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors",
    active ? "bg-active text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
  );

function Item({
  to,
  icon: IconCmp,
  art,
  label,
  end,
  badge,
  onNavigate,
}: {
  to: string;
  icon?: Icon;
  /** Custom leading graphic, used instead of an icon. */
  art?: ReactNode;
  label: string;
  end?: boolean;
  badge?: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) => linkClass(isActive)}
      >
        {({ isActive }) => (
          <>
            {art ??
              (IconCmp && (
                <IconCmp size={16} className={isActive ? "text-fg" : "text-fg-subtle"} />
              ))}
            <span className="flex-1 truncate">{label}</span>
            {badge}
          </>
        )}
      </NavLink>
    </li>
  );
}

function Heading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-1 flex h-6 items-center justify-between px-2.5">
      <span className="section-label">{children}</span>
      {action}
    </div>
  );
}

export default function Sidebar({
  onNavigate,
  onSearch,
  onShortcuts,
}: {
  onNavigate: () => void;
  onSearch: () => void;
  onShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, can } = usePermissions();
  const logout = useLogout();
  const unread = useUnreadCount();
  const { theme, toggle } = useTheme();
  const { data: organization } = useOrganization();
  const { data: projects = [] } = useProjects();
  const openCreate = useCreateWorkItemDialog();

  // Starred projects get their own section; the Projects list shows the rest.
  // Demo mode keeps the original sidebar: no Starred section, starred projects first.
  const showStarred = !env.USE_MOCKS;
  const starred = projects.filter((p) => p.favorite);
  const visible = showStarred
    ? projects.filter((p) => !p.favorite && p.status !== "COMPLETED")
    : projects
        .filter((p) => p.status !== "COMPLETED")
        .sort((a, b) => Number(b.favorite) - Number(a.favorite));

  const projectLink = (p: (typeof projects)[number]) => {
    const active = location.pathname.startsWith(projectPath(p.key));
    const open = p.counts.total - p.counts.done;
    return (
      <li key={p.id}>
        <NavLink to={projectPath(p.key)} onClick={onNavigate} className={linkClass(active)}>
          <span className="ml-0.5 size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="flex-1 truncate">{p.name}</span>
          <span className="text-[12px] text-fg-subtle tabular-nums">{open}</span>
        </NavLink>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col border-r border-line bg-canvas">
      {/* Brand */}
      <div className="flex h-header shrink-0 items-center gap-2.5 border-b border-line px-4">
        <Logo size={22} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold text-fg">Lahara Tasks</p>
          <p className="truncate text-[11.5px] text-fg-subtle">
            {organization?.name ?? "Workspace"}
          </p>
        </div>
        <button
          onClick={onSearch}
          aria-label="Search"
          title="Search  (Ctrl K)"
          className="flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        >
          <MagnifyingGlass size={16} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-3">
        <ul className="flex flex-col gap-px">
          <li>
            <button onClick={() => openCreate({})} className={cn(linkClass(false), "group")}>
              <NotePencil size={16} className="text-fg-subtle group-hover:text-fg" />
              <span className="flex-1">Create</span>
              <Kbd>C</Kbd>
            </button>
          </li>
          <Item
            to={ROUTES.DASHBOARD}
            icon={ChartPieSlice}
            label="Dashboard"
            onNavigate={onNavigate}
          />
          <Item to={ROUTES.MY_WORK} icon={CheckCircle} label="My work" onNavigate={onNavigate} />
          <Item
            to={ROUTES.INBOX}
            icon={Tray}
            label="Inbox"
            onNavigate={onNavigate}
            badge={
              unread > 0 && (
                <span className="min-w-5 rounded-full bg-fg px-1.5 text-center text-[11px] leading-[18px] font-semibold text-panel">
                  {unread > 99 ? "99+" : unread}
                </span>
              )
            }
          />
          <Item
            to={ROUTES.ASSISTANT}
            art={<AiAgent size={16} />}
            label="Assistant"
            onNavigate={onNavigate}
          />
        </ul>

        {showStarred && (
          <>
            <Heading>Starred</Heading>
            <ul className="flex flex-col gap-px" aria-label="Starred projects">
              {starred.length > 0 ? (
                starred.map(projectLink)
              ) : (
                <li className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-fg-subtle">
                  <Star size={13} />
                  Star a project to pin it here
                </li>
              )}
            </ul>
          </>
        )}

        <Heading
          action={
            can("createProject") && (
              <button
                onClick={() => navigate(ROUTES.PROJECTS)}
                aria-label="All projects"
                title="All projects"
                className="flex size-6 items-center justify-center rounded-md text-fg-subtle hover:bg-hover hover:text-fg"
              >
                <Plus size={14} weight="bold" />
              </button>
            )
          }
        >
          Projects
        </Heading>
        <ul className="flex flex-col gap-px">
          {visible.map(projectLink)}
          <li>
            <NavLink
              to={ROUTES.PROJECTS}
              end
              onClick={onNavigate}
              className={({ isActive }) => linkClass(isActive)}
            >
              <Cube size={16} className="text-fg-subtle" />
              <span className="flex-1">All projects</span>
            </NavLink>
          </li>
        </ul>

        <Heading>Workspace</Heading>
        <ul className="flex flex-col gap-px">
          <Item to={ROUTES.TEAMS} icon={UsersThree} label="Teams" onNavigate={onNavigate} />
          <Item to={ROUTES.PEOPLE} icon={Users} label="People" onNavigate={onNavigate} />
          {can("manageOrganization") && (
            <Item to={ROUTES.SETTINGS} icon={Gear} label="Settings" onNavigate={onNavigate} />
          )}
        </ul>
      </nav>

      {/* Account */}
      <div className="border-t border-line p-2">
        <Menu
          align="left"
          placement="top"
          className="flex w-full"
          trigger={({ toggle: open }) => (
            <button
              onClick={open}
              className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-hover"
            >
              <Avatar person={user} size={26} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-medium text-fg">{user?.name}</span>
                <span className="block truncate text-[12px] text-fg-subtle">
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </span>
              <CaretUpDown size={14} className="text-fg-subtle" />
            </button>
          )}
          items={[
            { label: "My work", icon: UserCircle, onSelect: () => navigate(ROUTES.MY_WORK) },
            // Demo mode keeps the original menu, without the organisation picker
            ...(env.USE_MOCKS
              ? []
              : [
                  {
                    label: "Switch organisation",
                    icon: ArrowsLeftRight,
                    onSelect: () => navigate(ROUTES.SELECT_ORGANIZATION),
                  },
                ]),
            { label: "Keyboard shortcuts  ?", icon: Keyboard, onSelect: onShortcuts },
            {
              label: theme === "dark" ? "Light theme" : "Dark theme",
              icon: theme === "dark" ? Sun : Moon,
              onSelect: toggle,
            },
            ...(can("manageOrganization")
              ? [{ label: "Settings", icon: Gear, onSelect: () => navigate(ROUTES.SETTINGS) }]
              : []),
            {
              label: "Sign out",
              icon: SignOut,
              danger: true,
              onSelect: () =>
                logout.mutate(undefined, {
                  onSettled: () => navigate(ROUTES.LOGIN, { replace: true }),
                }),
            },
          ]}
        />
      </div>
    </div>
  );
}
