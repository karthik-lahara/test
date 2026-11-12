import { useMemo, useState } from "react";
import {
  ArrowBendUpLeft,
  ChatCircle,
  ClockCounterClockwise,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";

import { useMemberMap } from "@/features/people";
import { fromNow } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import type { Comment, Member } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import Button from "@/shared/ui/Button";
import { Tabs } from "@/shared/ui/Tabs";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import {
  useActivity,
  useAddComment,
  useComments,
  useDeleteComment,
  useEditComment,
} from "../queries/workItems.queries";

/** Highlights @Full Name mentions of real members. */
function Body({ text, members }: { text: string; members: Member[] }) {
  const names = members.map((m) => m.name).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const pattern = new RegExp(
    `(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
    "g",
  );
  return (
    <>
      {text.split(pattern).map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={i} className="rounded bg-accent-soft px-1 font-medium text-accent">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Composer({
  onSubmit,
  members,
  placeholder = "Leave a comment… Type @ to mention someone",
  initial = "",
  onCancel,
  submitLabel = "Comment",
}: {
  onSubmit: (body: string) => Promise<unknown>;
  members: Member[];
  placeholder?: string;
  initial?: string;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const mentionQuery = /@([\w ]{0,20})$/.exec(body)?.[1];
  const matches =
    mentionQuery !== undefined
      ? members
          .filter(
            (m) =>
              m.status === "ACTIVE" && m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 5)
      : [];

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onSubmit(body.trim());
      setBody("");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-glow relative rounded-lg border border-line bg-panel">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
        }}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-3 pt-2.5 text-[12.5px] text-fg placeholder:text-fg-subtle focus:outline-none"
      />
      {matches.length > 0 && (
        <ul className="absolute bottom-full left-2 z-30 mb-1 w-56 rounded-lg border border-line bg-raised p-1 shadow-pop">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setBody(body.replace(/@([\w ]{0,20})$/, `@${m.name} `))}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-hover"
              >
                <Avatar person={m} size={16} />
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2 px-2 pb-2">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" variant="primary" loading={busy} disabled={!body.trim()} onClick={send}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  workItemId,
  currentUserId,
  canModerate,
}: {
  comment: Comment;
  replies: Comment[];
  workItemId: string;
  currentUserId: string;
  canModerate: boolean;
}) {
  const memberMap = useMemberMap();
  const members = useMemo(() => [...memberMap.values()], [memberMap]);
  const add = useAddComment(workItemId);
  const edit = useEditComment(workItemId);
  const remove = useDeleteComment(workItemId);
  const [mode, setMode] = useState<"view" | "edit" | "reply">("view");
  const author = memberMap.get(comment.authorId);
  const mine = comment.authorId === currentUserId;

  return (
    <li className="flex gap-3">
      <Avatar person={author} size={26} />
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-line bg-panel px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-fg">{author?.name ?? "Someone"}</span>
            <span className="text-fg-subtle">{fromNow(comment.createdAt)}</span>
            {comment.editedAt && <span className="text-fg-subtle">(edited)</span>}
            <span className="flex-1" />
            {!comment.parentId && (
              <button
                aria-label="Reply"
                className="text-fg-subtle hover:text-fg"
                onClick={() => setMode("reply")}
              >
                <ArrowBendUpLeft size={13} />
              </button>
            )}
            {mine && (
              <button
                aria-label="Edit comment"
                className="text-fg-subtle hover:text-fg"
                onClick={() => setMode("edit")}
              >
                <PencilSimple size={13} />
              </button>
            )}
            {(mine || canModerate) && (
              <button
                aria-label="Delete comment"
                className="text-fg-subtle hover:text-[#e5484d]"
                onClick={() =>
                  remove.mutate(comment.id, { onError: (e) => toast.error(getApiErrorMessage(e)) })
                }
              >
                <Trash size={13} />
              </button>
            )}
          </div>
          {mode === "edit" ? (
            <div className="mt-2">
              <Composer
                members={members}
                initial={comment.body}
                submitLabel="Save"
                onCancel={() => setMode("view")}
                onSubmit={async (body) => {
                  await edit.mutateAsync({ id: comment.id, body });
                  setMode("view");
                }}
              />
            </div>
          ) : (
            <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg">
              <Body text={comment.body} members={members} />
            </p>
          )}
        </div>
        {(replies.length > 0 || mode === "reply") && (
          <ul className="mt-2 flex flex-col gap-2 border-l border-line pl-4">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                replies={[]}
                workItemId={workItemId}
                currentUserId={currentUserId}
                canModerate={canModerate}
              />
            ))}
            {mode === "reply" && (
              <Composer
                members={members}
                placeholder="Write a reply…"
                submitLabel="Reply"
                onCancel={() => setMode("view")}
                onSubmit={async (body) => {
                  await add.mutateAsync({ body, parentId: comment.id });
                  setMode("view");
                }}
              />
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

interface DiscussionProps {
  workItemId: string;
  currentUserId: string;
  canModerate: boolean;
}

/** Comments and the full history of a work item. */
export default function Discussion({ workItemId, currentUserId, canModerate }: DiscussionProps) {
  const [tab, setTab] = useState("comments");
  const { data: comments = [] } = useComments(workItemId);
  const { data: activity = [] } = useActivity(workItemId);
  const memberMap = useMemberMap();
  const members = useMemo(() => [...memberMap.values()], [memberMap]);
  const add = useAddComment(workItemId);
  const top = comments.filter((c) => !c.parentId);

  return (
    <section>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "comments",
            label: "Comments",
            icon: <ChatCircle size={13} />,
            count: comments.length,
          },
          {
            value: "activity",
            label: "History",
            icon: <ClockCounterClockwise size={13} />,
            count: activity.length,
          },
        ]}
      />
      {tab === "comments" ? (
        <div className="mt-4 flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {top.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={comments.filter((c) => c.parentId === comment.id)}
                workItemId={workItemId}
                currentUserId={currentUserId}
                canModerate={canModerate}
              />
            ))}
          </ul>
          <Composer members={members} onSubmit={(body) => add.mutateAsync({ body })} />
        </div>
      ) : (
        <ol className="mt-4 flex flex-col">
          {activity.map((entry) => {
            const actor = memberMap.get(entry.actorId);
            return (
              <li
                key={entry.id}
                className="relative flex gap-3 pb-4 text-[12.5px] before:absolute before:top-5 before:bottom-0 before:left-[9px] before:w-px before:bg-line last:before:hidden"
              >
                <Avatar person={actor} size={19} />
                <p className="text-fg-muted">
                  <span className="font-medium text-fg">{actor?.name ?? "Someone"}</span>{" "}
                  {entry.text}
                  <span className="ml-2 text-xs text-fg-subtle">{fromNow(entry.createdAt)}</span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
