import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  Copy,
  Microphone,
  PencilSimpleLine,
  Question,
  Sparkle,
  Warning,
} from "@phosphor-icons/react";

import {
  type AiSuggestion,
  type CommandSource,
  parseCommand,
  type ParsedCommand,
  useApproveSuggestion,
  useParseCommand,
  useRejectSuggestion,
  VoiceRecorder,
} from "@/features/ai";
import { usePermissions } from "@/features/auth";
import { useMembers, useOrganization } from "@/features/people";
import { useProjects } from "@/features/projects";
import { env } from "@/shared/config/env";
import { workItemPath } from "@/shared/constants/routes";
import { hasStoryPoints, STATUS_META, TYPE_META } from "@/shared/constants/workItem";
import { cn } from "@/shared/lib/cn";
import { toast } from "@/shared/lib/toast";
import AiAgent, { type AiAgentState } from "@/shared/ui/AiAgent";
import Button from "@/shared/ui/Button";
import { Kbd } from "@/shared/ui/Display";
import Modal from "@/shared/ui/Modal";
import { Tabs } from "@/shared/ui/Tabs";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import { type CreateMode, type CreateOptions, CreateWorkItemContext } from "../createContext";
import { useCreateWorkItem, useWorkItems } from "../queries/workItems.queries";
import WorkItemFields, { type Draft } from "./WorkItemFields";

// One example per level, so it's clear the box makes more than tasks.
const EXAMPLES: Array<[string, string]> = [
  ["Epic", "Create an epic: Payments in Task Platform"],
  ["Feature", "Add a feature under the AI task creation epic: bulk import from CSV"],
  ["Story", "Add a story under the Kanban board feature: as a member I can filter cards by label"],
  ["Task", "Add a task under TASK-3: build the export API, 6 hours, assign to Ramya by Friday"],
  ["Bug", "Create a high priority bug: password reset email not sent, assign to Ramya"],
];

function emptyDraft(options: CreateOptions, fallbackProjectId: string): Draft {
  return {
    projectId: options.projectId ?? fallbackProjectId,
    type: options.type ?? "TASK",
    title: "",
    description: "",
    status: options.status ?? "TODO",
    priority: "MEDIUM",
    assigneeIds: [],
    dueDate: null,
    estimateHours: "",
    storyPoints: "",
    labels: [],
    acceptanceCriteria: [],
    sprintId: options.sprintId ?? null,
    parentId: options.parentId ?? null,
  };
}

function validate(draft: Draft) {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!draft.title.trim()) errors.title = "Give the work item a title";
  if (!draft.projectId) errors.projectId = "Choose a project";
  if (draft.type === "SUBTASK" && !draft.parentId)
    errors.parentId = "A subtask needs a parent task or bug";
  if (draft.estimateHours && !(Number(draft.estimateHours) > 0))
    errors.estimateHours = "Estimate must be more than 0";
  return errors;
}

function toPayload(draft: Draft) {
  return {
    ...draft,
    title: draft.title.trim(),
    estimateHours: draft.estimateHours ? Number(draft.estimateHours) : null,
    storyPoints: hasStoryPoints(draft.type) && draft.storyPoints ? Number(draft.storyPoints) : null,
    acceptanceCriteria: draft.acceptanceCriteria.map((t) => t.trim()).filter(Boolean),
  };
}

export default function CreateWorkItemProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<CreateOptions | null>(null);
  const open = useCallback((next: CreateOptions = {}) => setOptions(next), []);

  // "C" opens the dialog anywhere outside a text field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest("input, textarea, select, [contenteditable=true]") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        setOptions({});
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CreateWorkItemContext.Provider value={open}>
      {children}
      {options && <CreateDialog options={options} onClose={() => setOptions(null)} />}
    </CreateWorkItemContext.Provider>
  );
}

function CreateDialog({ options, onClose }: { options: CreateOptions; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const { data: organization } = useOrganization();
  // With the real API, Describe and Voice are read in the browser (parseCommand), so they
  // don't need the AI service, its on/off setting or credits. Demo mode uses /ai/commands.
  const readInBrowser = !env.USE_MOCKS;
  const aiOn = readInBrowser || (organization?.aiEnabled ?? true);
  const { user } = usePermissions();
  const { data: members = [] } = useMembers();
  const { data: workItems = [] } = useWorkItems({}, readInBrowser);
  const [mode, setMode] = useState<CreateMode>(options.mode ?? (aiOn ? "describe" : "manual"));
  const [text, setText] = useState(options.text ?? "");
  const [typing, setTyping] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [suggestion, setSuggestion] = useState<ParsedCommand | AiSuggestion | null>(null);
  /** Set when the API saved the suggestion (demo mode), so it is approved or rejected there. */
  const suggestionId = suggestion && "suggestionId" in suggestion ? suggestion.suggestionId : null;
  const fallbackProject =
    options.projectId ?? projects.find((p) => p.status === "ACTIVE")?.id ?? "";
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(options, fallbackProject));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  const parse = useParseCommand();
  const approve = useApproveSuggestion();
  const reject = useRejectSuggestion();
  const create = useCreateWorkItem();

  const aiFields = useMemo(
    () => new Set(suggestion?.detected.map((d) => d.field).concat("title") ?? []),
    [suggestion],
  );
  const reviewing = suggestion !== null;
  const busy = parse.isPending || approve.isPending || create.isPending;

  async function generate(source: CommandSource) {
    if (text.trim().length < 3) {
      toast.warning(
        source === "voice"
          ? "Record or type what the task is about first."
          : "Describe the task in a few words first.",
      );
      return;
    }
    try {
      const result: ParsedCommand | AiSuggestion = readInBrowser
        ? parseCommand(text, source, {
            projects,
            members,
            workItems,
            userId: user?.id,
            projectId: options.projectId,
            parentId: options.parentId ?? undefined,
          })
        : await parse.mutateAsync({
            text,
            source,
            projectId: options.projectId,
            parentId: options.parentId ?? undefined,
          });
      setSuggestion(result);
      setDraft({
        ...emptyDraft(options, fallbackProject),
        ...result.fields,
        projectId: result.fields.projectId ?? fallbackProject,
        parentId: result.fields.parentId,
        estimateHours: result.fields.estimateHours ? String(result.fields.estimateHours) : "",
        status: options.status ?? "TODO",
      });
      setErrors({});
    } catch (error) {
      toast.error(getApiErrorMessage(error, "AI is unavailable right now."), {
        description: "Opening the manual form with your text.",
      });
      setDraft({
        ...emptyDraft(options, fallbackProject),
        title: text.slice(0, 120),
        description: text,
      });
      setMode("manual");
    }
  }

  async function submit() {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      const item = suggestionId
        ? await approve.mutateAsync({ id: suggestionId, edits: toPayload(draft) })
        : await create.mutateAsync(toPayload(draft));
      toast.success(`${item.key} created`, { description: item.title });
      onClose();
      navigate(workItemPath(item.key));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create the work item"));
    }
  }

  function discard() {
    if (suggestionId) reject.mutate(suggestionId);
    setSuggestion(null);
  }

  const footer = reviewing ? (
    <>
      <Button variant="ghost" icon={ArrowLeft} onClick={discard} className="mr-auto">
        Back
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          discard();
          onClose();
        }}
      >
        Discard
      </Button>
      <Button
        variant="primary"
        icon={CheckCircle}
        loading={approve.isPending || create.isPending}
        onClick={submit}
      >
        Approve and create
      </Button>
    </>
  ) : mode === "manual" ? (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" loading={create.isPending} onClick={submit}>
        Create {TYPE_META[draft.type].label.toLowerCase()}
      </Button>
    </>
  ) : (
    <>
      <span className="mr-auto hidden items-center gap-1.5 text-[12px] text-fg-subtle sm:flex">
        <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
        {organization && !readInBrowser && (
          <span className="ml-1.5 tabular-nums">
            · {organization.aiCreditsLeft.toLocaleString()} credits left
          </span>
        )}
      </span>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="primary"
        icon={Sparkle}
        loading={parse.isPending}
        disabled={busy}
        onClick={() => generate(mode === "voice" ? "voice" : "text")}
      >
        {parse.isPending ? "Reading…" : "Fill in with AI"}
      </Button>
    </>
  );

  // One header for every tab: what the helper is doing, and a single line of guidance.
  const heading: { state: AiAgentState; title: string; hint: string } = reviewing
    ? {
        state: "done",
        title: "Review before creating",
        hint: "AI filled in the highlighted fields. Nothing is saved until you approve.",
      }
    : parse.isPending
      ? {
          state: "thinking",
          title: mode === "voice" ? "Working out what you said…" : "Reading your description…",
          hint: "Picking out the type, priority, due date and owner.",
        }
      : mode === "voice"
        ? {
            state: "idle",
            title: "Create with your voice",
            hint: "Say what it is and where it goes. AI turns it into an item you can review.",
          }
        : mode === "manual"
          ? {
              state: "idle",
              title: `New ${TYPE_META[draft.type].label.toLowerCase()}`,
              hint: "Pick the type, then fill in the details yourself.",
            }
          : {
              state: typing && text ? "reading" : "idle",
              title: "Create an epic, feature, story or task",
              hint: "Describe it in plain words. AI picks the type, parent, priority, due date and owner.",
            };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      footer={footer}
      header={
        <div className="flex flex-col gap-3.5">
          {/* The AI helper leads every tab; its expression follows what is happening. */}
          <div className="flex items-center gap-3 pr-8">
            <AiAgent size={40} state={heading.state} />
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-fg">{heading.title}</h2>
              <p className="mt-0.5 text-[12.5px] text-fg-subtle">{heading.hint}</p>
            </div>
          </div>
          {!reviewing && (
            <Tabs
              value={mode}
              onChange={(v) => setMode(v as CreateMode)}
              items={[
                ...(aiOn
                  ? [
                      { value: "describe", label: "Describe", icon: <Sparkle size={13} /> },
                      { value: "voice", label: "Voice", icon: <Microphone size={13} /> },
                    ]
                  : []),
                { value: "manual", label: "Manual", icon: <PencilSimpleLine size={13} /> },
              ]}
            />
          )}
        </div>
      }
    >
      {reviewing && suggestion ? (
        <div className="flex flex-col gap-4">
          <SuggestionSummary suggestion={suggestion} />
          <WorkItemFields
            draft={draft}
            onChange={setDraft}
            projects={projects}
            errors={errors}
            aiFields={aiFields}
          />
        </div>
      ) : mode === "manual" ? (
        <WorkItemFields draft={draft} onChange={setDraft} projects={projects} errors={errors} />
      ) : mode === "voice" ? (
        <VoiceRecorder value={text} onChange={setText} lang={lang} onLangChange={setLang} />
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            autoFocus
            value={text}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void generate("text");
            }}
            rows={4}
            placeholder="Say what it is and where it goes: an epic, a feature under an epic, a story under a feature… plus who, priority and due date."
            className="field-glow w-full resize-none rounded-lg border border-line bg-raised p-3 text-[13px] leading-relaxed text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[12px] text-fg-subtle">Try</span>
            {EXAMPLES.map(([label, example]) => (
              <button
                key={label}
                type="button"
                title={example}
                onClick={() => setText(example)}
                className="h-7 rounded-full border border-line px-2.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SuggestionSummary({ suggestion }: { suggestion: ParsedCommand }) {
  const pct = Math.round(suggestion.confidence * 100);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-accent/25 bg-accent-soft/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[12px] font-semibold",
            pct >= 75 ? "bg-emerald-500/15 text-[#1f9d63]" : "bg-amber-500/15 text-[#d9860b]",
          )}
        >
          {pct}% confident
        </span>
        {suggestion.detected.map((d) => (
          <span
            key={d.label}
            className="rounded-full border border-line bg-panel px-2 py-0.5 text-[12px] text-fg-muted"
          >
            {d.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-fg-muted">
        From {suggestion.source === "voice" ? "voice" : "text"}:{" "}
        <span className="text-fg">“{suggestion.input}”</span>
      </p>
      {suggestion.questions.map((q) => (
        <p key={q} className="flex items-start gap-1.5 text-xs text-[#d9860b]">
          <Question size={14} className="mt-px shrink-0" />
          {q}
        </p>
      ))}
      {suggestion.warnings.map((w) => (
        <p key={w} className="flex items-start gap-1.5 text-xs text-[#d9860b]">
          <Warning size={14} className="mt-px shrink-0" />
          {w}
        </p>
      ))}
      {suggestion.duplicates.length > 0 && (
        <ul className="flex flex-col gap-1">
          {suggestion.duplicates.map((d) => (
            <li key={d.key}>
              <Link
                to={workItemPath(d.key)}
                target="_blank"
                className="flex items-center gap-2 rounded-md bg-panel px-2 py-1.5 text-xs hover:bg-hover"
              >
                <Copy size={12} className="text-fg-subtle" />
                <span className="font-mono text-fg-subtle">{d.key}</span>
                <span className="flex-1 truncate text-fg">{d.title}</span>
                <span className="text-fg-subtle">{STATUS_META[d.status].label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
