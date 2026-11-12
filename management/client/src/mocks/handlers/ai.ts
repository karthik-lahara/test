import dayjs from "dayjs";

import { fromApiWorkItemBody, toApiStatus, toApiWorkItemBody } from "@/shared/api/contract";
import {
  canParent,
  CHILD_TYPE,
  PARENT_TYPES,
  type Priority,
  TYPE_META,
  type WorkItemType,
} from "@/shared/constants/workItem";
import type { WorkItem } from "@/shared/types/entities";

import { newId, organization, projects, users, workItems } from "../db";
import { findProject } from "../logic";
import { MockHttpError, route } from "../router";
import { createWorkItem, wire } from "./workItems";

// Stands in for the Python AI service. The real flow: Node checks the user and credits,
// sends only the text to the AI service, gets structured fields back, resolves names to
// ids from the database, saves a pending suggestion and returns a preview. Nothing is
// created until the user approves.

interface Suggestion {
  id: string;
  userId: string;
  source: "text" | "voice";
  fields: Record<string, unknown>;
  status: "PENDING" | "APPROVED" | "REJECTED";
  expiresAt: string;
  /** The item created on approve. */
  workItemId?: string;
}

const suggestions: Suggestion[] = [];

const clip = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function typeFromWord(word: string): WorkItemType {
  const w = word.toLowerCase();
  if (w.includes("stor")) return "STORY";
  if (w.startsWith("epic")) return "EPIC";
  if (w.startsWith("feature")) return "FEATURE";
  if (w.startsWith("sub")) return "SUBTASK";
  if (w.startsWith("bug")) return "BUG";
  return "TASK";
}

type ParentHit =
  | { phrase: string; item: WorkItem; choices?: undefined; word?: undefined; name?: undefined }
  | { phrase: string; item?: undefined; choices: WorkItem[]; word: string; name: string }
  | { phrase: string; item?: undefined; choices?: undefined; word: string; name: string };

const ANCHOR = /\b(?:under|in|inside|into|for|to|below|within|part of|child of|belongs to)\s+/gi;
const TYPE_WORD = "(epic|feature|user story|story|task|bug)";

/**
 * Finds the parent the text points at, by key ("under PAY-12") or by name and type
 * ("in the Kanban board feature", "under epic AI task creation").
 */
export function findParent(text: string, projectId?: string): ParentHit | null {
  const byKey =
    /\b(?:under|in|inside|into|for|to|below|within|part of|child of|belongs to|parent(?: is)?)\s+(?:the\s+)?([A-Za-z]{2,6}-\d+)\b/i.exec(
      text,
    ) ?? /\b([A-Z]{2,6}-\d+)\b/.exec(text);
  if (byKey) {
    const item = workItems.find((w) => w.key.toLowerCase() === byKey[1].toLowerCase());
    if (item) return { phrase: byKey[0], item };
  }

  const pool = workItems.filter((w) => !projectId || w.projectId === projectId);
  let missing: ParentHit | null = null;
  for (const anchor of text.matchAll(ANCHOR)) {
    const after = text.slice(anchor.index + anchor[0].length);
    const tries: Array<{
      word: string;
      name: string;
      length: number;
      open: boolean;
      last?: boolean;
    }> = [];
    // "the Kanban board feature". A title can hold a type word itself ("AI task creation
    // epic"), so every type word in the clause is tried as the end of the name.
    const clause = /^[^.,;:]*/.exec(after)![0];
    const lead = /^(?:the\s+)?["“']?/i.exec(clause)![0].length;
    for (const m of clause.matchAll(new RegExp(`\\s${TYPE_WORD}\\b`, "gi"))) {
      if (m.index <= lead) continue;
      tries.push({
        word: m[1],
        name: clause.slice(lead, m.index).replace(/["”']$/, ""),
        length: m.index + m[0].length,
        open: false,
      });
    }
    if (tries.length) tries[tries.length - 1].last = true;
    // "epic AI task creation" / "the epic called X"
    const prefix = new RegExp(
      `^(?:the\\s+)?${TYPE_WORD}\\s+(?:called\\s+|named\\s+)?["“']?([^"”'.,;:]+)`,
      "i",
    ).exec(after);
    if (prefix)
      tries.push({ word: prefix[1], name: prefix[2], length: prefix[0].length, open: true });

    for (const t of tries) {
      const type = typeFromWord(t.word);
      const name = t.name.trim().toLowerCase();
      if (name.length < 3 || /^(a|an|this|that|my|our|same|new)$/.test(name)) continue;
      const ofType = pool.filter((w) => w.type === type);
      let matches = ofType.filter((w) => {
        const title = w.title.toLowerCase();
        return title.includes(name) || (t.open && name.startsWith(title));
      });
      if (!matches.length) {
        const words = name.split(/\W+/).filter((x) => x.length > 2);
        matches = ofType.filter((w) => {
          const title = w.title.toLowerCase();
          const hits = words.filter((x) => title.includes(x)).length;
          return words.length > 0 && hits / words.length >= 0.6;
        });
      }
      // For the open-ended "epic X …" form, only take as much text as the title matched.
      const matchedLength = (item: WorkItem) =>
        t.open
          ? after.toLowerCase().indexOf(item.title.toLowerCase()) + item.title.length
          : t.length;
      const phrase = (item?: WorkItem) =>
        anchor[0] +
        after.slice(0, item && t.open ? Math.max(matchedLength(item), t.word.length) : t.length);
      if (matches.length === 1) return { phrase: phrase(matches[0]), item: matches[0] };
      const open = matches.filter((w) => w.status !== "DONE");
      if (open.length === 1) return { phrase: phrase(open[0]), item: open[0] };
      if (matches.length > 1)
        return {
          phrase: phrase(),
          choices: (open.length ? open : matches).slice(0, 3),
          word: TYPE_META[type].label.toLowerCase(),
          name: t.name.trim(),
        };
      // Nothing by that name. Only worth mentioning after a clear "under …"; words like
      // "for" or "to" are too common to be sure the text meant a parent.
      if (t.last && !missing && /under|inside|part of|child of|belongs to|within/i.test(anchor[0]))
        missing = {
          phrase: phrase(),
          word: TYPE_META[type].label.toLowerCase(),
          name: t.name.trim(),
        };
    }
  }
  return missing;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseDue(text: string): { date: string; phrase: string } | null {
  const lower = text.toLowerCase();
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => dayjs.Dayjs]> = [
    [/\b(?:by |on |due )?today\b/, () => dayjs()],
    [/\b(?:by |on |due )?tomorrow\b/, () => dayjs().add(1, "day")],
    [/\b(?:with)?in (\d+) days?\b/, (m) => dayjs().add(Number(m[1]), "day")],
    [
      /\b(?:by |before )?(?:the )?end of (?:the )?week\b/,
      () =>
        dayjs().day(5).isBefore(dayjs(), "day") ? dayjs().add(1, "week").day(5) : dayjs().day(5),
    ],
    [/\b(?:by |on )?next week\b/, () => dayjs().add(1, "week").day(1)],
    [
      /\b(?:by |on |due |before )?(?:next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
      (m) => {
        const target = WEEKDAYS.indexOf(m[1]);
        let date = dayjs().day(target);
        if (!date.isAfter(dayjs(), "day")) date = date.add(1, "week");
        return date;
      },
    ],
    [
      /\b(?:by |on |due )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})\b/,
      (m) => {
        let date = dayjs(`${m[1]} ${m[2]} ${dayjs().year()}`, "MMM D YYYY");
        if (!date.isValid()) date = dayjs();
        if (date.isBefore(dayjs(), "day")) date = date.add(1, "year");
        return date;
      },
    ],
  ];
  for (const [pattern, toDate] of patterns) {
    const match = lower.match(pattern);
    if (match) return { date: toDate(match).format("YYYY-MM-DD"), phrase: match[0] };
  }
  return null;
}

export function parse(text: string, contextProjectId?: string, contextParentId?: string) {
  let rest = ` ${text.trim()} `;
  const lower = rest.toLowerCase();
  const detected: Array<{ field: string; label: string }> = [];
  const questions: string[] = [];
  const warnings: string[] = [];
  const strip = (phrase: string) => {
    rest = rest.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ");
  };

  // Parent first: "under PAY-12", "in the Kanban board feature". Taking it out of the text
  // stops its type word ("feature") from being read as the new item's type.
  const named = findParent(rest, contextProjectId);
  const fromPage = contextParentId ? workItems.find((w) => w.id === contextParentId) : undefined;
  const parentHit: ParentHit | null = named ?? (fromPage ? { phrase: "", item: fromPage } : null);
  if (parentHit?.phrase) strip(parentHit.phrase);

  // Type: the word right after the command wins ("add a feature under the X epic" is a
  // feature). Then story wording, then bug wording, then the parent's natural child.
  const afterParent = rest.toLowerCase();
  const head = afterParent.match(
    /\b(?:create|add|make|new|log|raise|open|write)\s+(?:a|an|the|one|another)?\s*(?:new\s+)?(user stor(?:y|ies)|stor(?:y|ies)|epics?|features?|sub-?tasks?|tasks?|bugs?)\b/,
  );
  const loose = afterParent.match(/\b(user story|story|epic|feature|sub-?task|bug)\b/);
  let type: WorkItemType = "TASK";
  let typeSaid = true;
  if (head) type = typeFromWord(head[1]);
  else if (/\bas an? .+ i (can|want|need)/.test(afterParent)) type = "STORY";
  else if (/\bbug\b|\bfix\b|broken|crash|error\b/.test(afterParent)) type = "BUG";
  else if (loose) type = typeFromWord(loose[1]);
  else if (parentHit?.item) type = CHILD_TYPE[parentHit.item.type] ?? "TASK";
  else typeSaid = /\btask\b/.test(afterParent);

  // Parent: check it fits the hierarchy.
  let parentId: string | null = null;
  const typeName = TYPE_META[type].label.toLowerCase();
  const allowed = PARENT_TYPES[type];
  const allowedNames = allowed.map((t) => TYPE_META[t].label.toLowerCase()).join(" or ");
  let parentProjectId: string | null = null;
  let parentLabel = "";
  if (parentHit?.item) {
    const parent = parentHit.item;
    parentProjectId = parent.projectId;
    if (canParent(type, parent.type)) {
      parentId = parent.id;
      parentLabel = `Parent: ${parent.key} ${clip(parent.title)}`;
    } else if (!allowed.length) {
      warnings.push(`An epic is top level, so it can't go under ${parent.key}.`);
    } else {
      const options = workItems.filter(
        (w) => w.parentId === parent.id && allowed.includes(w.type) && w.status !== "DONE",
      );
      warnings.push(
        `A ${typeName} goes under a ${allowedNames}, not ${parent.type === "EPIC" ? "an" : "a"} ${TYPE_META[parent.type].label.toLowerCase()}.` +
          (options.length
            ? ` Pick one of ${parent.key}'s ${allowedNames === "feature" ? "features" : `${allowedNames} items`} as the parent below.`
            : ` Pick a ${allowedNames} as the parent below.`),
      );
    }
  } else if (parentHit?.choices) {
    questions.push(
      `Which ${parentHit.word} did you mean? ${parentHit.choices.map((c) => `${c.key} ${clip(c.title)}`).join(" or ")}.`,
    );
  } else if (parentHit) {
    warnings.push(`No ${parentHit.word} called "${parentHit.name}". Pick a parent below.`);
  }
  if (!parentId && !parentHit && allowed.length && type !== "TASK" && type !== "BUG")
    questions.push(`Which ${allowedNames} should this ${typeName} go under?`);
  if (typeSaid || parentId) detected.push({ field: "type", label: `Type: ${typeName}` });
  if (parentLabel) detected.push({ field: "parent", label: parentLabel });

  // Priority
  let priority: Priority | null = null;
  const priorityMatch = lower.match(
    /\b(urgent|asap|critical|high|important|medium|normal|low)(?: priority)?\b/,
  );
  if (priorityMatch) {
    const word = priorityMatch[1];
    priority = ["urgent", "asap", "critical"].includes(word)
      ? "URGENT"
      : ["high", "important"].includes(word)
        ? "HIGH"
        : word === "low"
          ? "LOW"
          : "MEDIUM";
    strip(priorityMatch[0]);
    detected.push({ field: "priority", label: `Priority: ${priority.toLowerCase()}` });
  }

  // Assignee: "assign to Ramya", "for Shahanas", "@Ramya"
  const assigneeIds: string[] = [];
  const assignMatch = rest.match(
    /\b(?:assign(?:ed)?(?: it)? to|give (?:it )?to|for|@)\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)/,
  );
  if (assignMatch) {
    const name = assignMatch[1].toLowerCase();
    const matches = users.filter(
      (u) =>
        u.status === "ACTIVE" &&
        (u.name.toLowerCase() === name ||
          u.name.toLowerCase().split(" ")[0] === name.split(" ")[0]),
    );
    if (matches.length === 1) {
      assigneeIds.push(matches[0].id);
      detected.push({ field: "assignee", label: `Assignee: ${matches[0].name}` });
      strip(assignMatch[0]);
    } else if (matches.length > 1) {
      questions.push(
        `Which ${assignMatch[1]} did you mean? ${matches.map((m) => m.name).join(" or ")}.`,
      );
      strip(assignMatch[0]);
    } else if (/assign|give|@/.test(assignMatch[0].toLowerCase())) {
      warnings.push(`No active member called "${assignMatch[1]}". Left unassigned.`);
      strip(assignMatch[0]);
    }
  }
  if (/\bassign(?: it)? to me\b|\bfor me\b/i.test(rest)) {
    rest = rest.replace(/\bassign(?: it)? to me\b|\bfor me\b/i, " ");
    detected.push({ field: "assignee", label: "Assignee: you" });
    assigneeIds.push("__me__");
  }

  // Project: by key or name, else the page you are on
  let projectId = parentProjectId ?? (contextProjectId ? findProject(contextProjectId).id : null);
  for (const project of parentProjectId ? [] : projects) {
    const keyHit = new RegExp(`\\b${project.key}\\b`, "i").exec(rest);
    const nameHit = new RegExp(
      `\\b(?:in|on|under|for)?\\s*(?:the )?${project.name}(?: project)?\\b`,
      "i",
    ).exec(rest);
    const hit = keyHit ?? nameHit;
    if (hit) {
      projectId = project.id;
      strip(
        new RegExp(`\\b(?:in|on|under|for)?\\s*(?:the )?${hit[0].trim()}(?: project)?`, "i").exec(
          rest,
        )?.[0] ?? hit[0],
      );
      break;
    }
  }
  if (projectId)
    detected.push({
      field: "project",
      label: `Project: ${projects.find((p) => p.id === projectId)!.name}`,
    });
  else questions.push("Which project should this go in?");

  // Module / area becomes a label: "in the user module"
  const labels: string[] = [];
  const moduleMatch = rest.match(/\b(?:in|on) (?:the )?([a-z]+) (module|page|screen|api)\b/i);
  if (moduleMatch) {
    labels.push(`${moduleMatch[1].toLowerCase()}-${moduleMatch[2].toLowerCase()}`);
    detected.push({ field: "labels", label: `Label: ${labels[0]}` });
  }

  // Due date
  const due = parseDue(rest);
  if (due) {
    strip(due.phrase);
    detected.push({ field: "dueDate", label: `ETA: ${dayjs(due.date).format("ddd, MMM D")}` });
  }

  // Estimate
  let estimateHours: number | null = null;
  const estimateMatch = rest.match(
    /\b(?:about |around |takes? |estimate[ds]? (?:at )?)?(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|d|days?)\b/i,
  );
  if (estimateMatch) {
    estimateHours =
      Number(estimateMatch[1]) * (estimateMatch[2].toLowerCase().startsWith("d") ? 8 : 1);
    strip(estimateMatch[0]);
    detected.push({ field: "estimate", label: `Estimate: ${estimateHours}h` });
  }

  // Title: what is left once command words are gone
  let title = rest
    .replace(
      /^\s*(please\s+)?(can you\s+)?(create|add|make|open|log|raise|new)\s+(a|an|the)?\s*(new\s+)?(task|bug|story|user story|epic|feature|sub-?task|issue|ticket|work item)?\s*(to|for|about|called|named|:)?\s*/i,
      "",
    )
    .replace(/\bpriority\b/gi, " ")
    .replace(/\s+(and|with|,)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "")
    .trim();
  if (!title) {
    title = "";
    questions.push("What should the task be about?");
  }
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const acceptanceCriteria =
    type === "STORY" || type === "FEATURE"
      ? [
          "The main flow works for every role that can see it",
          "Errors are shown clearly",
          "Covered by a test",
        ]
      : type === "BUG"
        ? ["The steps that caused the bug no longer reproduce it", "A test covers the case"]
        : [];

  const description = `${title}.\n\nCreated from: "${text.trim()}"`;

  const words = new Set(
    title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  const duplicates = workItems
    .filter((w) => (!projectId || w.projectId === projectId) && w.status !== "DONE")
    .map((w) => {
      const theirs = w.title
        .toLowerCase()
        .split(/\W+/)
        .filter((x) => x.length > 3);
      const overlap = theirs.filter((x) => words.has(x)).length;
      return { item: w, score: words.size ? overlap / Math.max(words.size, theirs.length) : 0 };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => ({ key: item.key, title: item.title, status: item.status }));
  if (duplicates.length)
    warnings.push("Similar open work items already exist. Check before creating.");

  const confidence = Math.max(
    0.35,
    Math.min(0.98, 0.55 + detected.length * 0.07 - questions.length * 0.15),
  );

  return {
    fields: {
      type,
      title,
      description,
      priority: priority ?? "MEDIUM",
      assigneeIds,
      projectId,
      labels,
      dueDate: due?.date ?? null,
      estimateHours,
      acceptanceCriteria,
      parentId,
    },
    detected,
    questions,
    warnings,
    duplicates,
    confidence: Math.round(confidence * 100) / 100,
  };
}

route("POST", "/ai/commands/:organizationId", ({ body, userId }) => {
  if (!organization.aiEnabled)
    throw new MockHttpError(403, "AI is turned off for this organisation.");
  if (organization.aiCreditsLeft <= 0)
    throw new MockHttpError(402, "No AI credits left this month.");
  const text = String(body.text ?? "").trim();
  if (text.length < 3)
    throw new MockHttpError(400, "Describe the task in a few words.", [
      { field: "text", message: "Describe the task in a few words" },
    ]);

  const result = parse(
    text,
    (body.projectId as string) || undefined,
    (body.parentId as string) || undefined,
  );
  const fields = result.fields;
  fields.assigneeIds = (fields.assigneeIds as string[]).map((id) =>
    id === "__me__" ? userId : id,
  );
  organization.aiCreditsLeft -= 1;
  const suggestion: Suggestion = {
    id: newId("sug"),
    userId,
    source: body.source === "voice" ? "voice" : "text",
    fields,
    status: "PENDING",
    expiresAt: dayjs().add(30, "minute").toISOString(),
  };
  suggestions.push(suggestion);
  return {
    suggestionId: suggestion.id,
    source: suggestion.source,
    input: text,
    ...result,
    fields: toApiWorkItemBody(fields),
    duplicates: result.duplicates.map((d) => ({ ...d, status: toApiStatus(d.status) })),
    expiresAt: suggestion.expiresAt,
    creditsLeft: organization.aiCreditsLeft,
  };
});

route("POST", "/ai/suggestions/approve/:id", ({ params, body, userId }) => {
  const suggestion = suggestions.find((s) => s.id === params.id && s.userId === userId);
  if (!suggestion) throw new MockHttpError(404, "This suggestion has expired. Try again.");
  // Approve runs once: a second approve (double click, retry) returns the same item.
  if (suggestion.status === "APPROVED" && suggestion.workItemId) {
    const item = workItems.find((w) => w.id === suggestion.workItemId);
    if (item) return wire(item);
  }
  if (suggestion.status !== "PENDING")
    throw new MockHttpError(404, "This suggestion has expired. Try again.");
  if (dayjs().isAfter(suggestion.expiresAt))
    throw new MockHttpError(410, "This suggestion has expired. Try again.");
  suggestion.status = "APPROVED";
  const edits = fromApiWorkItemBody((body.edits as Record<string, unknown>) ?? {});
  const merged = { ...suggestion.fields, ...edits };
  const item = createWorkItem(
    merged,
    userId,
    suggestion.source === "voice" ? "AI_VOICE" : "AI_TEXT",
  );
  suggestion.workItemId = item.id;
  return wire(item);
});

route("POST", "/ai/suggestions/reject/:id", ({ params, userId }) => {
  const suggestion = suggestions.find((s) => s.id === params.id && s.userId === userId);
  if (suggestion) suggestion.status = "REJECTED";
  return null;
});
