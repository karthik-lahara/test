import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  At,
  Bell,
  ChatCircle,
  CheckCircle,
  Checks,
  Flag,
  type Icon,
  Play,
  UserCirclePlus,
  Warning,
} from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import { projectPath, workItemPath } from "@/shared/constants/routes";
import { cn } from "@/shared/lib/cn";
import { fromNow } from "@/shared/lib/format";
import type { Notification, NotificationKind } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import Button from "@/shared/ui/Button";
import { EmptyState, ListSkeleton } from "@/shared/ui/Display";
import { Tabs } from "@/shared/ui/Tabs";

import { useMarkAllRead, useMarkRead, useNotifications } from "../notifications.api";

const KIND: Record<NotificationKind, { icon: Icon; color: string }> = {
  ASSIGNED: { icon: UserCirclePlus, color: "#7c6cff" },
  REASSIGNED: { icon: UserCirclePlus, color: "#7c6cff" },
  STATUS_CHANGED: { icon: CheckCircle, color: "#5e9bff" },
  DUE_SOON: { icon: Flag, color: "#f5a524" },
  OVERDUE: { icon: Warning, color: "#f06a6a" },
  COMMENT: { icon: ChatCircle, color: "#38bdf8" },
  MENTION: { icon: At, color: "#f472b6" },
  MOVED_TO_QA: { icon: CheckCircle, color: "#4cc38a" },
  SPRINT_STARTED: { icon: Play, color: "#4cc38a" },
  SPRINT_COMPLETED: { icon: Checks, color: "#7c6cff" },
  PROJECT_DEADLINE: { icon: Flag, color: "#f06a6a" },
};

export default function NotificationList() {
  const navigate = useNavigate();
  const members = useMemberMap();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const [tab, setTab] = useState("all");

  const items = (data ?? []).filter((n) =>
    tab === "unread" ? !n.read : tab === "mentions" ? n.kind === "MENTION" : true,
  );
  const unread = data?.filter((n) => !n.read).length ?? 0;

  function open(n: Notification) {
    if (!n.read) markRead.mutate(n.id);
    if (n.workItemKey) navigate(workItemPath(n.workItemKey));
    else if (n.projectKey) navigate(projectPath(n.projectKey));
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 md:px-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All", count: data?.length },
            { value: "unread", label: "Unread", count: unread },
            { value: "mentions", label: "Mentions" },
          ]}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={Checks}
          disabled={!unread}
          onClick={() => markAll.mutate()}
        >
          Mark all as read
        </Button>
      </div>
      {isLoading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={tab === "unread" ? "You're all caught up" : "Nothing here yet"}
          description="Assignments, mentions, status changes and deadlines show up here."
        />
      ) : (
        <ul>
          {items.map((n) => {
            const kind = KIND[n.kind];
            const actor = n.actorId ? members.get(n.actorId) : null;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left hover:bg-hover/60 md:px-6",
                    !n.read && "bg-accent-soft/40",
                  )}
                >
                  <span className="relative mt-0.5">
                    {actor ? (
                      <Avatar person={actor} size={28} />
                    ) : (
                      <span className="flex size-7 items-center justify-center rounded-full bg-raised">
                        <kind.icon size={15} style={{ color: kind.color }} />
                      </span>
                    )}
                    {actor && (
                      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-panel">
                        <kind.icon size={11} weight="fill" style={{ color: kind.color }} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[12.5px]",
                          n.read ? "text-fg-muted" : "font-medium text-fg",
                        )}
                      >
                        {n.title}
                      </span>
                      {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-fg-subtle">
                    {fromNow(n.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
