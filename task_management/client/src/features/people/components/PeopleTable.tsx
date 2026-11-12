import { useMemo, useState } from "react";
import {
  DotsThree,
  MagnifyingGlass,
  PencilSimple,
  Prohibit,
  UserCheck,
  UserMinus,
  Users,
} from "@phosphor-icons/react";

import {
  AVAILABILITY_META,
  ROLE_LABELS,
  USER_STATUS_META,
  USER_STATUSES,
  type UserStatus,
} from "@/shared/constants/workItem";
import { formatDateLong } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import type { Member } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import { Badge, EmptyState, ListSkeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Input from "@/shared/ui/Input";
import Menu from "@/shared/ui/Menu";
import { Tabs } from "@/shared/ui/Tabs";
import { Dot } from "@/shared/ui/WorkIcons";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import { useMembers, useSetMemberStatus, useTeams } from "../queries/people.queries";
import EditMemberModal from "./EditMemberModal";

interface PeopleTableProps {
  canManage: boolean;
  currentUserId: string;
}

export default function PeopleTable({ canManage, currentUserId }: PeopleTableProps) {
  const { data: members, isLoading } = useMembers();
  const { data: teams = [] } = useTeams();
  const setStatus = useSetMemberStatus();
  const [tab, setTab] = useState<"ALL" | UserStatus>("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const managerName = useMemo(() => new Map((members ?? []).map((m) => [m.id, m.name])), [members]);

  const filtered = (members ?? []).filter(
    (m) =>
      (tab === "ALL" || m.status === tab) &&
      (!search ||
        `${m.name} ${m.email} ${m.designation}`.toLowerCase().includes(search.toLowerCase())),
  );

  async function changeStatus(member: Member, status: UserStatus) {
    try {
      await setStatus.mutateAsync({ id: member.id, status });
      toast.success(`${member.name} is now ${USER_STATUS_META[status].label.toLowerCase()}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          items={[
            { value: "ALL", label: "All", count: members?.length },
            ...USER_STATUSES.map((s) => ({
              value: s,
              label: USER_STATUS_META[s].label,
              count: members?.filter((m) => m.status === s).length,
            })),
          ]}
        />
        <div className="w-full sm:w-64">
          <Input
            icon={MagnifyingGlass}
            placeholder="Search people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one matches"
          description="Try another filter or search."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead>
              <tr className="border-y border-line text-[12px] tracking-wide text-fg-subtle uppercase">
                <th className="px-4 py-2 font-medium md:pl-6">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Teams</th>
                <th className="px-3 py-2 font-medium">Reports to</th>
                <th className="px-3 py-2 font-medium">Availability</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr key={member.id} className="group border-b border-line hover:bg-hover/60">
                  <td className="px-4 py-2.5 md:pl-6">
                    <div className="flex items-center gap-2.5">
                      <Avatar person={member} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-fg">
                          {member.name}
                          {member.id === currentUserId && (
                            <span className="ml-1.5 text-xs text-fg-subtle">(you)</span>
                          )}
                        </div>
                        <div className="truncate text-xs text-fg-subtle">
                          {member.designation || member.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted">{ROLE_LABELS[member.role]}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {member.teamIds.length === 0 && <span className="text-fg-subtle">–</span>}
                      {member.teamIds.map((id) => (
                        <Badge key={id}>{teamName.get(id)}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted">
                    {member.reportingManagerId ? managerName.get(member.reportingManagerId) : "–"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-fg-muted">
                      <Dot color={AVAILABILITY_META[member.availability].color} />
                      {AVAILABILITY_META[member.availability].label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge color={USER_STATUS_META[member.status].color}>
                      {USER_STATUS_META[member.status].label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-fg-muted">{formatDateLong(member.joinedAt)}</td>
                  <td className="px-2 py-2.5">
                    {(canManage || member.id === currentUserId) && (
                      <Menu
                        trigger={({ toggle }) => (
                          <IconButton icon={DotsThree} label="Actions" onClick={toggle} />
                        )}
                        items={[
                          {
                            label: "Edit details",
                            icon: PencilSimple,
                            onSelect: () => setEditing(member),
                          },
                          ...(canManage && member.id !== currentUserId
                            ? [
                                member.status === "ACTIVE"
                                  ? {
                                      label: "Deactivate",
                                      icon: UserMinus,
                                      onSelect: () => changeStatus(member, "INACTIVE"),
                                    }
                                  : {
                                      label: "Activate",
                                      icon: UserCheck,
                                      onSelect: () => changeStatus(member, "ACTIVE"),
                                    },
                                ...(member.status !== "SUSPENDED"
                                  ? [
                                      {
                                        label: "Suspend",
                                        icon: Prohibit,
                                        danger: true,
                                        onSelect: () => changeStatus(member, "SUSPENDED"),
                                      },
                                    ]
                                  : []),
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditMemberModal member={editing} canManage={canManage} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
