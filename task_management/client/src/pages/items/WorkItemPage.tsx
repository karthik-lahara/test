import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DotsThree, Link as LinkIcon, Trash, Tray } from "@phosphor-icons/react";

import { usePermissions } from "@/features/auth";
import { useProject, useSprints } from "@/features/projects";
import { useDeleteWorkItem, useWorkItem, WorkItemDetail } from "@/features/workItems";
import { projectPath, ROUTES } from "@/shared/constants/routes";
import { toast } from "@/shared/lib/toast";
import Button from "@/shared/ui/Button";
import { EmptyState, Skeleton } from "@/shared/ui/Display";
import IconButton from "@/shared/ui/IconButton";
import Menu from "@/shared/ui/Menu";
import Modal from "@/shared/ui/Modal";
import PageHeader from "@/shared/ui/PageHeader";
import ProjectIcon from "@/shared/ui/ProjectIcon";
import { TypeIcon } from "@/shared/ui/WorkIcons";

export default function WorkItemPage() {
  const { itemKey = "" } = useParams();
  const navigate = useNavigate();
  const { user, can } = usePermissions();
  const { data: item, isLoading, isError } = useWorkItem(itemKey);
  const { data: project } = useProject(item?.projectId ?? "");
  const { data: sprints = [] } = useSprints(item?.projectId ?? "");
  const remove = useDeleteWorkItem();
  const [confirming, setConfirming] = useState(false);

  if (isLoading || (item && !project)) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError || !item || !project || !user) {
    return (
      <EmptyState
        icon={Tray}
        title="Work item not found"
        description="It may have been deleted."
        action={<Button onClick={() => navigate(ROUTES.MY_WORK)}>Back to my work</Button>}
      />
    );
  }

  const canDelete = can("createProject") || item.reporterId === user.id;

  return (
    <>
      <PageHeader
        crumbs={[
          {
            label: project.name,
            to: projectPath(project.key),
            icon: <ProjectIcon color={project.color} size={12} />,
          },
          { label: item.key, icon: <TypeIcon type={item.type} size={13} /> },
        ]}
        actions={
          <>
            <IconButton
              icon={LinkIcon}
              label="Copy link"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                toast.success("Link copied");
              }}
            />
            {canDelete && (
              <Menu
                trigger={({ toggle }) => (
                  <IconButton icon={DotsThree} label="More" onClick={toggle} />
                )}
                items={[
                  {
                    label: "Delete work item",
                    icon: Trash,
                    danger: true,
                    onSelect: () => setConfirming(true),
                  },
                ]}
              />
            )}
          </>
        }
      />
      <WorkItemDetail
        key={item.id}
        item={item}
        project={project}
        sprints={sprints}
        currentUserId={user.id}
        canModerate={can("manageSprints")}
      />
      <Modal
        open={confirming}
        size="sm"
        onClose={() => setConfirming(false)}
        title={`Delete ${item.key}?`}
        description={
          item.childCount
            ? `Its ${item.childCount} sub-items are deleted too. This can't be undone.`
            : "This can't be undone."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(item.id, {
                  onSuccess: () => {
                    toast.success(`${item.key} deleted`);
                    navigate(projectPath(project.key, "list"), { replace: true });
                  },
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-fg-muted">“{item.title}”</p>
      </Modal>
    </>
  );
}
