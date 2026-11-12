import { usePermissions } from "@/features/auth";
import { OrganizationSettings } from "@/features/people";
import PageHeader from "@/shared/ui/PageHeader";

export default function SettingsPage() {
  const { can } = usePermissions();
  return (
    <>
      <PageHeader crumbs={[{ label: "Settings" }]} />
      <div className="flex-1 overflow-y-auto">
        {!can("manageOrganization") && (
          <p className="mx-auto mt-6 max-w-3xl px-6 text-xs text-fg-subtle">
            Only organisation admins can change these settings.
          </p>
        )}
        <OrganizationSettings canEdit={can("manageOrganization")} />
      </div>
    </>
  );
}
