import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowCounterClockwise,
  ArrowUp,
  Check,
  CheckCircle,
  SidebarSimple,
} from "@phosphor-icons/react";
import dayjs from "dayjs";

import {
  type AssistantReply,
  type Breakdown,
  type ChatItemRef,
  useAssistantChat,
} from "@/features/ai";
import { useCurrentUser } from "@/features/auth";
import { useCreateWorkItem, useCreateWorkItemDialog } from "@/features/workItems";
import { workItemPath } from "@/shared/constants/routes";
import { TYPE_META, type WorkItemType } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { todayIso } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";
import AiAgent from "@/shared/ui/AiAgent";
import Button from "@/shared/ui/Button";
import { StatusIcon, TypeIcon } from "@/shared/ui/WorkIcons";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      reply: AssistantReply;
      /** Keys created from this turn's breakdown, so it shows as done after a reload. */
      created?: string[];
    };

const typePlural = (type: WorkItemType, n: number) => {
  const label = TYPE_META[type].label.toLowerCase();
  if (n === 1) return label;
  return type === "STORY" ? "user stories" : `${label}s`;
};

/** Proposed children of one item. Ticking and editing here is the approval step. */
function BreakdownCard({
  breakdown,
  created,
  onCreated,
}: {
  breakdown: Breakdown;
  created?: string[];
  onCreated: (keys: string[]) => void;
}) {
  const [rows, setRows] = useState(() => breakdown.items.map((title) => ({ title, on: true })));
  const [busy, setBusy] = useState(false);
  const create = useCreateWorkItem();
  const chosen = rows.filter((r) => r.on && r.title.trim());
  const { parent, childType } = breakdown;

  if (created?.length)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-line px-3 py-2.5 text-[12.5px] text-fg-muted">
        <CheckCircle size={15} weight="fill" className="text-[#4cc38a]" />
        Created {created.length} {typePlural(childType, created.length)} under {parent.key}:
        {created.map((key) => (
          <Link key={key} to={workItemPath(key)} className="font-mono text-fg hover:underline">
            {key}
          </Link>
        ))}
      </div>
    );

  async function run() {
    setBusy(true);
    const keys: string[] = [];
    try {
      for (const row of chosen) {
        const item = await create.mutateAsync({
          projectId: parent.projectId,
          parentId: parent.id,
          type: childType,
          title: row.title.trim(),
          status: "TODO",
          priority: "MEDIUM",
        });
        keys.push(item.key);
      }
      toast.success(`${keys.length} ${typePlural(childType, keys.length)} created`, {
        description: `Under ${parent.key} ${parent.title}`,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create all of them"));
    } finally {
      setBusy(false);
      if (keys.length) onCreated(keys);
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line">
      <Link
        to={workItemPath(parent.key)}
        className="flex h-10 items-center gap-2 border-b border-line bg-raised px-3 text-[12.5px] transition-colors hover:bg-hover"
      >
        <TypeIcon type={parent.type} />
        <span className="font-mono text-fg-subtle">{parent.key}</span>
        <span className="min-w-0 flex-1 truncate text-fg">{parent.title}</span>
        <span className="text-fg-subtle">{parent.projectName}</span>
      </Link>
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex h-10 items-center gap-2.5 border-b border-line/60 pr-3 pl-6 last:border-b-0"
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={row.on}
            aria-label={row.on ? "Leave out" : "Include"}
            onClick={() =>
              setRows((all) => all.map((r, i) => (i === index ? { ...r, on: !r.on } : r)))
            }
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
              row.on ? "border-fg bg-fg text-panel" : "border-line-strong",
            )}
          >
            {row.on && <Check size={11} weight="bold" />}
          </button>
          <TypeIcon type={childType} />
          <input
            value={row.title}
            onChange={(e) =>
              setRows((all) =>
                all.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)),
              )
            }
            aria-label={`Title ${index + 1}`}
            className={cn(
              "h-full min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none",
              row.on ? "text-fg/90" : "text-fg-subtle line-through",
            )}
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <button
          type="button"
          onClick={() => setRows((all) => [...all, { title: "", on: true }])}
          className="text-[12.5px] text-fg-subtle transition-colors hover:text-fg"
        >
          + Add another
        </button>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!chosen.length || busy}
          onClick={run}
        >
          Create {chosen.length} {typePlural(childType, chosen.length)}
        </Button>
      </div>
    </div>
  );
}

function greeting(name?: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

const STORAGE_KEY = "tm.assistant";

/** The conversation survives navigating away and back within the tab (best effort). */
function loadTurns(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
}

function saveTurns(turns: Turn[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
  } catch {
    // Storage blocked or full: the chat still works, it just won't be remembered.
  }
}

function ItemList({ items }: { items: ChatItemRef[] }) {
  const today = todayIso();
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line">
      {items.map((item) => {
        const late = item.status !== "DONE" && item.dueDate && item.dueDate < today;
        return (
          <Link
            key={item.key}
            to={workItemPath(item.key)}
            className="flex h-10 items-center gap-2.5 border-b border-line/60 px-3 transition-colors last:border-b-0 hover:bg-hover"
          >
            <StatusIcon status={item.status} />
            <span className="w-16 shrink-0 font-mono text-[12px] text-fg-subtle">{item.key}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg/90">{item.title}</span>
            <span className="hidden w-28 shrink-0 truncate text-[12px] text-fg-subtle sm:block">
              {item.projectName}
            </span>
            <span
              className={`w-14 shrink-0 text-right text-[12px] tabular-nums ${late ? "text-[#f06a6a]" : "text-fg-subtle"}`}
            >
              {item.dueDate ? dayjs(item.dueDate).format("D MMM") : "—"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** A new answer writes itself out word by word; its list and buttons appear once the text is done. */
function Typed({
  text,
  animate,
  onTick,
  children,
}: {
  text: string;
  animate: boolean;
  onTick: () => void;
  children?: ReactNode;
}) {
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(animate ? 0 : words.length);
  const done = shown >= words.length;
  // Paced by the clock (about 16 words a second), so it reads at the same speed everywhere.
  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const n = Math.min(words.length, Math.floor((performance.now() - start) / 60) * 2);
      setShown(n);
      onTick();
      if (n < words.length) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [animate, words.length, onTick]);
  return (
    <>
      <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-fg/90">
        {words.slice(0, shown).join("")}
      </p>
      {done && <div className={animate ? "animate-pop" : undefined}>{children}</div>}
    </>
  );
}

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [input, setInput] = useState("");
  // The answer that arrived in this visit types itself out; older ones show at once.
  const [live, setLive] = useState(-1);
  const keepAtEnd = useCallback(() => endRef.current?.scrollIntoView({ block: "end" }), []);
  const chat = useAssistantChat();
  const openCreate = useCreateWorkItemDialog();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: me } = useCurrentUser();
  const layout = useOutletContext<{ menuHidden: boolean; toggleMenu: () => void } | undefined>();

  useEffect(() => saveTurns(turns), [turns]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, chat.isPending]);

  // Grow the box with its text, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function ask(question: string) {
    const text = question.trim();
    if (!text || chat.isPending) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    chat.mutate(
      next.map(({ role, content }) => ({ role, content })),
      {
        onSuccess: (reply) => {
          setLive(next.length);
          setTurns((current) => [...current, { role: "assistant", content: reply.text, reply }]);
        },
      },
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(input);
  }

  function reset() {
    setTurns([]);
    setLive(-1);
    chat.reset();
    inputRef.current?.focus();
  }

  const lastAssistant = turns.findLastIndex((t) => t.role === "assistant");

  const composer = (
    <form
      onSubmit={onSubmit}
      className="ai-surface mx-auto flex w-full max-w-[760px] items-end gap-2 rounded-xl bg-raised p-2 pl-3.5"
    >
      <textarea
        ref={inputRef}
        autoFocus
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            ask(input);
          }
        }}
        placeholder="Ask about your work, or describe a task to create…"
        className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
      />
      <Button
        type="submit"
        variant="primary"
        size="sm"
        icon={ArrowUp}
        disabled={!input.trim() || chat.isPending}
        aria-label="Send"
      >
        Send
      </Button>
    </form>
  );

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-4">
        {layout && (
          <button
            type="button"
            onClick={layout.toggleMenu}
            aria-label={layout.menuHidden ? "Show menu" : "Hide menu"}
            className="hidden size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg lg:flex"
          >
            <SidebarSimple size={18} />
          </button>
        )}
        <AiAgent size={22} />
        <span className="text-[13.5px] font-medium text-fg">Lahara Tasks</span>
        <span className="text-[13px] text-fg-subtle">· Assistant</span>
        {turns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={ArrowCounterClockwise}
            onClick={reset}
            className="ml-auto"
          >
            New chat
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-8">
          {turns.length === 0 ? (
            <div className="flex flex-col items-center pt-[10vh] text-center">
              <AiAgent size={72} />
              <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.03em] text-fg">
                {greeting(me?.name)}. What do you want to know?
              </h1>
              <p className="mt-1.5 max-w-md text-[13.5px] text-fg-muted">
                Ask about your tasks, projects and team, or describe a task and I'll draft it.
              </p>
              <div className="mt-8 w-full">{composer}</div>
            </div>
          ) : (
            turns.map((turn, index) =>
              turn.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-active px-3.5 py-2 text-[13.5px] whitespace-pre-line text-fg">
                    {turn.content}
                  </p>
                </div>
              ) : (
                <div key={index} className="flex gap-3">
                  {/* Only the newest answer keeps a live face; older ones rest. */}
                  <AiAgent size={28} state={index === lastAssistant ? "idle" : "done"} />
                  <div className="min-w-0 flex-1 pt-1">
                    <Typed text={turn.content} animate={index === live} onTick={keepAtEnd}>
                      {turn.reply.items.length > 0 && <ItemList items={turn.reply.items} />}
                      {turn.reply.breakdown && (
                        <BreakdownCard
                          breakdown={turn.reply.breakdown}
                          created={turn.created}
                          onCreated={(keys) =>
                            setTurns((all) =>
                              all.map((t, i) => (i === index ? { ...t, created: keys } : t)),
                            )
                          }
                        />
                      )}
                      {turn.reply.createDraft && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="mt-3"
                          onClick={() =>
                            openCreate({ mode: "describe", text: turn.reply.createDraft ?? "" })
                          }
                        >
                          Open in New task
                        </Button>
                      )}
                    </Typed>
                  </div>
                </div>
              ),
            )
          )}

          {chat.isPending && (
            <div className="flex items-center gap-3">
              <AiAgent size={28} state="thinking" />
              <span className="text-[13px] text-fg-subtle">Looking through your work…</span>
            </div>
          )}
          {chat.isError && (
            <p className="text-[13px] text-[#f06a6a]">
              I couldn't answer that. {chat.error.message} Try again in a moment.
            </p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer: in the middle on a new chat, at the bottom once talking */}
      {turns.length > 0 && (
        <div className="shrink-0 px-4 pt-2 pb-5">
          {composer}
          <p className="mx-auto mt-2 max-w-[760px] text-center text-[12px] text-fg-subtle">
            The assistant only reads your work. Anything it creates goes through a screen you
            approve.
          </p>
        </div>
      )}
    </>
  );
}
