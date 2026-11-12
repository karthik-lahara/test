import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, CheckCircle, House, type Icon } from "@phosphor-icons/react";

import { setupOrganizationDetailsPath } from "@/shared/constants/routes";
import { cn } from "@/shared/lib/cn";
import Button from "@/shared/ui/Button";

import type { WorkspaceType } from "../auth.validation";

const OPTIONS: Array<{ type: WorkspaceType; title: string; description: string; icon: Icon }> = [
  {
    type: "WORK",
    title: "Work",
    description: "Plan with your team. Invite colleagues and manage projects together.",
    icon: Briefcase,
  },
  {
    type: "PERSONAL",
    title: "Personal",
    description: "Track your own tasks and side projects in a private workspace.",
    icon: House,
  },
];

/** Setup step 1: choose Work or Personal. The name and description come on the next step. */
export default function WorkspaceTypeForm({ initial = "WORK" }: { initial?: WorkspaceType }) {
  const navigate = useNavigate();
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(initial);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(setupOrganizationDetailsPath(workspaceType));
      }}
    >
      <div role="radiogroup" aria-label="Workspace type" className="grid grid-cols-2 gap-3">
        {OPTIONS.map(({ type, title, description, icon: IconCmp }) => {
          const selected = workspaceType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setWorkspaceType(type)}
              className={cn(
                "relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
                selected
                  ? "border-accent bg-hover"
                  : "border-line-strong hover:border-fg-subtle hover:bg-hover",
              )}
            >
              <CheckCircle
                size={16}
                weight="fill"
                className={cn("absolute top-3 right-3 text-accent", !selected && "invisible")}
              />
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-md border",
                  selected ? "border-accent text-accent" : "border-line text-fg-muted",
                )}
              >
                <IconCmp size={18} weight={selected ? "fill" : "regular"} />
              </span>
              <span className="text-[14px] font-semibold text-fg">{title}</span>
              <span className="text-[12px] leading-snug text-fg-muted">{description}</span>
            </button>
          );
        })}
      </div>

      <Button type="submit" variant="primary" className="mt-1 w-full">
        Continue
      </Button>
    </form>
  );
}
