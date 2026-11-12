import dayjs from "dayjs";

import { toApiStatus, toApiType } from "@/shared/api/contract";
import { CHILD_TYPE, TYPE_META, type WorkItemType } from "@/shared/constants/workItem";
import type { WorkItem } from "@/shared/types/entities";

import { findUser, organization, projects, users, workItems } from "../db";
import { countsFor } from "../logic";
import { MockHttpError, route } from "../router";
import { findParent, parse } from "./ai";

// Stands in for the AI assistant. The real flow: Node checks the user and credits, sends the
// conversation plus the work the user may see to the model, and returns its answer. The
// assistant is read-only: it explains and points at work, and anything it would change goes
// through a screen the user confirms (for now, the New task dialog).

interface ItemRef {
  key: string;
  title: string;
  type: WorkItem["type"];
  status: WorkItem["status"];
  dueDate: string | null;
  projectName: string;
}

interface Breakdown {
  parent: ItemRef & { id: string; projectId: string };
  childType: WorkItemType;
  items: string[];
  existing: number;
}

interface Reply {
  text: string;
  items: ItemRef[];
  suggestions: string[];
  createDraft: string | null;
  breakdown: Breakdown | null;
}

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 } as const;

const ref = (item: WorkItem): ItemRef => ({
  key: item.key,
  title: item.title,
  type: item.type,
  status: item.status,
  dueDate: item.dueDate,
  projectName: projects.find((p) => p.id === item.projectId)?.name ?? "",
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const reply = (text: string, extra: Partial<Reply> = {}): Reply => ({
  text,
  items: [],
  suggestions: [],
  createDraft: null,
  breakdown: null,
  ...extra,
});

const typeName = (type: WorkItemType) => TYPE_META[type].label.toLowerCase();
const many = (type: WorkItemType) => (type === "STORY" ? "user stories" : `${typeName(type)}s`);
// "a user story", but "an epic".
const article = (word: string) => (/^[aeio]/.test(word) ? "an" : "a");

/** Finds the item a "break down …" request points at: by key, or by name and type. */
function breakdownTarget(question: string): WorkItem | null {
  const key = /\b([A-Za-z]{2,6}-\d+)\b/.exec(question);
  if (key) {
    const item = workItems.find((w) => w.key.toLowerCase() === key[1].toLowerCase());
    if (item) return item;
  }
  const rest = question.replace(
    /^.*?\b(?:break\s*down|split(?: up)?|decompose|plan out)\b\s*/i,
    "",
  );
  return findParent(`under ${rest}`)?.item ?? null;
}

/**
 * Proposes children one level down. A real model writes these from the item's description;
 * the demo uses patterns that read like a first draft a lead would then edit.
 */
function proposeChildren(item: WorkItem): string[] {
  const topic = item.title.replace(/^as an? [a-z]+ i (?:can|want to|need to)\s+/i, "");
  const short = topic.length > 48 ? `${topic.slice(0, 47)}…` : topic;
  switch (item.type) {
    case "EPIC":
      return ["core flow", "roles and permissions", "notifications", "reporting"].map(
        (part) => `${item.title}: ${part}`,
      );
    case "FEATURE":
      return [
        `As a member I can use ${short.toLowerCase()}`,
        `As a manager I can configure ${short.toLowerCase()}`,
        `As an admin I can see how ${short.toLowerCase()} is used`,
      ];
    case "STORY":
      return [
        "API and data model",
        "Screen with empty, loading and error states",
        "Permission checks",
        "Tests for the main flow",
      ].map((part) => `${part}: ${short}`);
    default:
      return ["Find the cause and outline the fix", "Make the change", "Review and test"].map(
        (part) => `${part}: ${short}`,
      );
  }
}

/** Overdue first, then in progress, then by due date and priority. */
function byUrgency(today: string) {
  return (a: WorkItem, b: WorkItem) => {
    const late = (w: WorkItem) => (w.dueDate && w.dueDate < today ? 0 : 1);
    const active = (w: WorkItem) => (w.status === "IN_PROGRESS" ? 0 : 1);
    return (
      late(a) - late(b) ||
      active(a) - active(b) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    );
  };
}

function answer(question: string, userId: string): Reply {
  const q = question.toLowerCase();
  const today = dayjs().format("YYYY-MM-DD");
  const open = workItems.filter((w) => w.status !== "DONE" && w.type !== "EPIC");
  const mine = open.filter((w) => w.assigneeIds.includes(userId));
  const project = projects.find(
    (p) => q.includes(p.name.toLowerCase()) || new RegExp(`\\b${p.key.toLowerCase()}\\b`).test(q),
  );

  // Break down: propose the children one level down; the user ticks which to create.
  if (/\b(break\s*down|split( up)?|decompose|plan out)\b/.test(q)) {
    const target = breakdownTarget(question);
    if (!target)
      return reply(
        'Which item should I break down? Give me its key, like TASK-1, or its name and type, like "the AI task creation epic".',
        { suggestions: ["Break down the AI task creation epic"] },
      );
    const childType = CHILD_TYPE[target.type];
    if (!childType)
      return reply(
        `${target.key} is a subtask, the smallest level, so there is nothing to split it into.`,
      );
    const existing = workItems.filter((w) => w.parentId === target.id);
    const taken = new Set(existing.map((w) => w.title.toLowerCase()));
    const items = proposeChildren(target).filter((t) => !taken.has(t.toLowerCase()));
    return reply(
      `Here's a first split of ${target.key} (${typeName(target.type)}) into ${many(childType)}.${existing.length ? ` It already has ${plural(existing.length, "child item")}; these would sit next to them.` : ""} Untick what you don't need and edit the titles. Each one is created under ${target.key}.`,
      {
        breakdown: {
          parent: { ...ref(target), id: target.id, projectId: target.projectId },
          childType,
          items,
          existing: existing.length,
        },
      },
    );
  }

  // Create: work out the type and parent here, then hand over to the New task dialog,
  // where AI fills the remaining fields and the user approves.
  if (
    /\b(create|add|make|log|raise|open|new|write)\b.*\b(tasks?|bugs?|stor(y|ies)|tickets?|features?|epics?|sub-?tasks?|items?|issues?)\b/.test(
      q,
    ) ||
    /^\s*as an? .+ i (can|want|need)\b/.test(q)
  ) {
    const preview = parse(question);
    const f = preview.fields;
    const parent = f.parentId ? workItems.find((w) => w.id === f.parentId) : undefined;
    const where = projects.find((p) => p.id === f.projectId);
    const notes = [...preview.questions, ...preview.warnings];
    const kind = typeName(f.type);
    return reply(
      `I'll set this up as ${article(kind)} ${kind}${parent ? ` under ${parent.key} (${typeName(parent.type)})` : ""}${where ? ` in ${where.name}` : ""}.${notes.length ? `\n${notes.map((n) => `• ${n}`).join("\n")}` : ""}\nOpen it in the New task dialog to check the fields. You can change the parent there, and nothing is saved until you approve.`,
      {
        createDraft: question.trim(),
        items: parent ? [ref(parent)] : [],
        suggestions: parent ? [`Break down ${parent.key}`] : ["What should I work on today?"],
      },
    );
  }

  if (/\b(overdue|late|behind|missed)\b/.test(q)) {
    const late = mine.filter((w) => w.dueDate && w.dueDate < today).sort(byUrgency(today));
    const teamLate = open.filter((w) => w.dueDate && w.dueDate < today).length;
    if (!late.length)
      return reply(
        `Nothing of yours is overdue. Across the workspace, ${plural(teamLate, "item")} ${teamLate === 1 ? "is" : "are"} past due.`,
        { suggestions: ["How are my projects doing?", "What's blocked right now?"] },
      );
    return reply(
      `You have ${plural(late.length, "overdue item")}. The oldest is ${late[0]!.key}, due ${dayjs(late[0]!.dueDate).format("D MMM")}. ${late.length === 1 ? "I'd finish it first or move its date." : "I'd clear these first or move their dates."}`,
      { items: late.slice(0, 6).map(ref), suggestions: ["What should I work on today?"] },
    );
  }

  if (/\bblock(ed|er|ers|ing)?\b|\bstuck\b/.test(q)) {
    const blocked = open.filter(
      (w) => w.status === "BLOCKED" && (!project || w.projectId === project.id),
    );
    if (!blocked.length)
      return reply(`Nothing is blocked${project ? ` in ${project.name}` : ""} right now.`, {
        suggestions: ["How are my projects doing?"],
      });
    return reply(
      `${plural(blocked.length, "item")} ${blocked.length === 1 ? "is" : "are"} blocked${project ? ` in ${project.name}` : ""}. Each one usually needs a decision or an answer from someone; open it to see the discussion.`,
      { items: blocked.slice(0, 8).map(ref), suggestions: ["Who has the most work?"] },
    );
  }

  if (/\b(risk|health|delayed|on track)\b/.test(q) && !project) {
    const lines = projects
      .filter((p) => p.status === "ACTIVE" || p.status === "PLANNING")
      .map((p) => {
        const counts = countsFor(p.id);
        return `• ${p.name}: ${counts.done}/${counts.total} done, ${plural(counts.overdue, "overdue item")}, ${counts.blocked} blocked`;
      });
    return reply(`Here's where each active project stands:\n${lines.join("\n")}`, {
      suggestions: projects.slice(0, 2).map((p) => `Summarise ${p.name}`),
    });
  }

  if (project) {
    const counts = countsFor(project.id);
    const active = open
      .filter((w) => w.projectId === project.id)
      .sort(byUrgency(today))
      .slice(0, 6);
    const share = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
    return reply(
      `${project.name}: ${counts.done} of ${counts.total} items are done (${share}%), ${counts.inProgress} in progress, ${counts.blocked} blocked and ${plural(counts.overdue, "overdue item")}.${active.length ? " These need attention first:" : ""}`,
      {
        items: active.map(ref),
        suggestions: [`What's blocked in ${project.name}?`, "Who has the most work?"],
      },
    );
  }

  if (/\b(workload|busy|capacity|bandwidth|most work|free|available)\b/.test(q)) {
    const load = users
      .map((u) => {
        const theirs = open.filter((w) => w.assigneeIds.includes(u.id));
        const hours = theirs.reduce(
          (sum, w) => sum + Math.max(0, (w.estimateHours ?? 0) - w.loggedHours),
          0,
        );
        return { name: u.name, items: theirs.length, hours };
      })
      .filter((row) => row.items > 0)
      .sort((a, b) => b.hours - a.hours);
    const lines = load
      .slice(0, 6)
      .map((r) => `• ${r.name}: ${r.hours}h left on ${plural(r.items, "item")}`);
    const idle = users.length - load.length;
    return reply(
      `Open hours left per person, most first:\n${lines.join("\n")}${idle > 0 ? `\n${plural(idle, "person")} ${idle === 1 ? "has" : "have"} nothing open.` : ""}`,
      { suggestions: ["What's blocked right now?"] },
    );
  }

  if (/\b(done|finished|completed|shipped)\b/.test(q)) {
    const weekAgo = dayjs().subtract(7, "day");
    const done = workItems.filter(
      (w) =>
        w.status === "DONE" &&
        w.assigneeIds.includes(userId) &&
        w.completedAt &&
        dayjs(w.completedAt).isAfter(weekAgo),
    );
    return reply(
      done.length
        ? `You finished ${plural(done.length, "item")} in the last 7 days. Nice work.`
        : "Nothing of yours was marked done in the last 7 days.",
      { items: done.slice(0, 6).map(ref), suggestions: ["What should I work on today?"] },
    );
  }

  if (/\b(today|focus|work on|my (tasks|work)|next|priorit|should i)\b/.test(q)) {
    const ordered = [...mine].sort(byUrgency(today));
    if (!ordered.length)
      return reply(
        "You have nothing open. Pick something up from a backlog, or ask me to create a task.",
        {
          suggestions: ["How are my projects doing?"],
        },
      );
    const first = ordered[0]!;
    const why =
      first.dueDate && first.dueDate < today
        ? "it's overdue"
        : first.status === "IN_PROGRESS"
          ? "you've already started it"
          : first.dueDate
            ? `it's due ${dayjs(first.dueDate).format("D MMM")}`
            : `it's ${first.priority.toLowerCase()} priority`;
    return reply(
      `You have ${plural(ordered.length, "open item")}. Start with ${first.key} because ${why}. Here's the order I'd take them in:`,
      {
        items: ordered.slice(0, 6).map(ref),
        suggestions: ["Anything overdue?", "What did I finish this week?"],
      },
    );
  }

  const me = findUser(userId);
  return reply(
    `Hi ${me?.name.split(" ")[0] ?? "there"}. I can answer questions about the work in ${organization.name}. For example, I can:\n• tell you what to work on next, and why\n• list overdue or blocked work\n• summarise a project's progress\n• show who has the most on their plate\n• draft a new epic, feature, story or task from a sentence, under the right parent\n• break an epic, feature or story down into the next level`,
    {
      suggestions: [
        "What should I work on today?",
        "How are my projects doing?",
        "Who has the most work?",
        "Add a story under the Kanban board feature: filter cards by label",
        "Break down the AI task creation epic",
      ],
    },
  );
}

/** Item references as the contract sends them: lowercase type and status. */
const wireRef = <T extends ItemRef>(ref: T) => ({
  ...ref,
  type: toApiType(ref.type),
  status: toApiStatus(ref.status),
});

route("POST", "/ai/chat/:organizationId", ({ body, userId }) => {
  if (!organization.aiEnabled)
    throw new MockHttpError(403, "AI is turned off for this organisation.");
  const messages = Array.isArray(body.messages)
    ? (body.messages as Array<{ role: string; content: string }>)
    : [];
  const last = [...messages].reverse().find((m) => m.role === "user");
  const question = String(last?.content ?? "").trim();
  if (!question) throw new MockHttpError(400, "Ask a question first.");
  const reply = answer(question, userId);
  return {
    ...reply,
    items: reply.items.map(wireRef),
    breakdown: reply.breakdown && {
      ...reply.breakdown,
      parent: wireRef(reply.breakdown.parent),
      childType: toApiType(reply.breakdown.childType),
    },
  };
});
