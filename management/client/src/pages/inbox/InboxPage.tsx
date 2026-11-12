import { NotificationList } from "@/features/notifications";
import PageHeader from "@/shared/ui/PageHeader";

export default function InboxPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Inbox" }]} />
      <div className="flex-1 overflow-y-auto">
        <NotificationList />
      </div>
    </>
  );
}
