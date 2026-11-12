import { Crown, UsersThree } from "@phosphor-icons/react";

import Avatar, { AvatarStack } from "@/shared/ui/Avatar";
import { EmptyState, Skeleton } from "@/shared/ui/Display";

import { useMemberMap, useTeams } from "../queries/people.queries";

export default function TeamsGrid() {
  const { data: teams, isLoading } = useTeams();
  const members = useMemberMap();

  if (isLoading) {
    return (
      <div className="grid gap-4 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!teams?.length) {
    return (
      <EmptyState
        icon={UsersThree}
        title="No teams yet"
        description="Group people into teams to assign work to a whole team."
      />
    );
  }

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 md:p-6 xl:grid-cols-3">
      {teams.map((team) => {
        const lead = team.leadId ? members.get(team.leadId) : undefined;
        const people = team.memberIds.map((id) => members.get(id)).filter((m) => m !== undefined);
        return (
          <article
            key={team.id}
            className="flex flex-col rounded-lg border border-line bg-panel p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex size-9 items-center justify-center rounded-lg text-white"
                style={{ background: team.color }}
              >
                <UsersThree size={18} weight="fill" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold text-fg">{team.name}</h3>
                <p className="text-xs text-fg-subtle">{people.length} members</p>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 min-h-9 text-xs text-fg-muted">
              {team.description || "No description."}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Crown size={13} className="text-[#d9860b]" />
                {lead ? (
                  <>
                    <Avatar person={lead} size={18} />
                    {lead.name}
                  </>
                ) : (
                  "No lead"
                )}
              </span>
              <AvatarStack people={people} max={5} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
