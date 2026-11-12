import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import { CreateTeamModal, TeamsGrid } from "@/features/people";
import Button from "@/shared/ui/Button";
import PageHeader from "@/shared/ui/PageHeader";

export default function TeamsPage() {
  const { can } = usePermissions();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Teams" }]}
        actions={
          can("manageTeams") && (
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New team
            </Button>
          )
        }
      />
      <div className="flex-1 overflow-y-auto">
        <TeamsGrid />
      </div>
      <CreateTeamModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
