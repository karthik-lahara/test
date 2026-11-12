import { useState } from "react";
import { UserPlus } from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import { InviteMemberModal, PeopleTable } from "@/features/people";
import Button from "@/shared/ui/Button";
import PageHeader from "@/shared/ui/PageHeader";

export default function PeoplePage() {
  const { user, can } = usePermissions();
  const [inviting, setInviting] = useState(false);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "People" }]}
        actions={
          can("manageUsers") && (
            <Button size="sm" variant="primary" icon={UserPlus} onClick={() => setInviting(true)}>
              Invite
            </Button>
          )
        }
      />
      <div className="flex-1 overflow-y-auto">
        <PeopleTable canManage={can("manageUsers")} currentUserId={user?.id ?? ""} />
      </div>
      <InviteMemberModal open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}
