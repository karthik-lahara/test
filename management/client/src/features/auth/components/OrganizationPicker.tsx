import { useNavigate } from "react-router-dom";
import { Buildings, CaretRight, House, Plus, WarningCircle } from "@phosphor-icons/react";

import {
  selectedOrganizationId,
  useMyOrganizations,
  type UserOrganization,
} from "@/features/organization";
import { env } from "@/shared/config/env";
import { ROUTES } from "@/shared/constants/routes";
import { ROLE_LABELS } from "@/shared/constants/workItem";
import Button from "@/shared/ui/Button";
import { Skeleton } from "@/shared/ui/Display";

import { useSelectOrganization } from "../queries/auth.queries";

/** The signed-in user's organisations: pick one to continue, or create a new one. */
export default function OrganizationPicker({ onSelected }: { onSelected: () => void }) {
  const { data: organizations, isLoading, isError, refetch } = useMyOrganizations();
  const select = useSelectOrganization();
  const navigate = useNavigate();
  const currentId = selectedOrganizationId.get();
  // The demo data holds a single organisation, so it can't create another.
  const canCreate = !env.USE_MOCKS;

  const choose = (choice: UserOrganization) => {
    select(choice);
    onSelected();
  };

  return (
    <div className="flex flex-col gap-4">
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[60px]" />
          <Skeleton className="h-[60px]" />
        </div>
      ) : isError ? (
        <div className="flex items-start gap-3 rounded-lg border border-line p-4 text-[12.5px]">
          <WarningCircle size={18} className="mt-0.5 shrink-0 text-[#e5484d]" />
          <div>
            <p className="font-medium text-fg">Couldn't load your organisations</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-1 text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <ul
          className="flex max-h-[360px] flex-col gap-2 overflow-y-auto"
          aria-label="Your organisations"
        >
          {organizations?.map((choice) => {
            const { organization, role } = choice;
            const personal = organization.type === "PERSONAL";
            const TypeIcon = personal ? House : Buildings;
            const isCurrent = organization.id === currentId;
            return (
              <li key={organization.id}>
                <button
                  type="button"
                  onClick={() => choose(choice)}
                  className="group flex w-full items-center gap-3 rounded-lg border border-line-strong p-3 text-left transition-colors hover:border-accent hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-[14px] font-semibold text-fg">
                    {organization.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-fg">
                        {organization.name}
                      </span>
                      {isCurrent && (
                        <span className="shrink-0 rounded bg-active px-1.5 py-px text-[10.5px] font-medium text-fg-muted">
                          Last used
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-muted">
                      <TypeIcon size={12} />
                      {personal ? "Personal" : "Work"}
                      <span className="text-fg-subtle">·</span>
                      {ROLE_LABELS[role]}
                    </span>
                  </span>
                  <CaretRight
                    size={14}
                    className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {canCreate && (
        <>
          <div className="flex items-center gap-3 text-[11.5px] text-fg-subtle">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button
            type="button"
            variant="secondary"
            icon={Plus}
            className="w-full"
            onClick={() => navigate(ROUTES.SETUP_ORGANIZATION)}
          >
            Create a new organisation
          </Button>
        </>
      )}
    </div>
  );
}
