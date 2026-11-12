import dayjs from "dayjs";

import {
  canParent,
  CHILD_TYPE,
  PARENT_TYPES,
  type Priority,
  TYPE_META,
  type WorkItemType,
} from "@/shared/constants/workItem";
import type { Member, Project, WorkItem } from "@/shared/types/entities";

import type { CommandSource, ParsedCommand } from "./ai.types";

// Reads a plain-text or spoken request ("add a high priority bug under PAY-12, assign to
// Ramya by Friday") in the browser and turns it into work item fields, using the projects,
// members and work items the app has already loaded. No AI service is called: the user
// reviews the result, and nothing is saved until they create it.

export interface ParseContext {
  projects: Project[];
  members: Member[];
  workItems: WorkItem[];
  /** The signed-in user, for "assign to me". */
  userId?: string;
  /** The project the dialog was opened from. */
  projectId?: string;
  /** The item the new one goes under, when the dialog was opened from it. */
  parentId?: string;
}

type ParentHit =
  | { phrase: string; item: WorkItem; choices?: undefined; word?: undefined; name?: undefined }
  | { phrase: string; item?: undefined; choices: WorkItem[]; word: string; name: string }
  | { phrase: string; item?: undefined; choices?: undefined; word: string; name: string };

const ANCHOR = /\b(?:under|in|inside|into|for|to|below|within|part of|child of|belongs to)\s+/gi;
const TYPE_WORD = "(epic|feature|user story|story|task|bug)";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const clip = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function typeFromWord(word: string): WorkItemType {
  const w = word.toLowerCase();
  if (w.includes("stor")) return "STORY";
  if (w.startsWith("epic")) return "EPIC";
  if (w.startsWith("feature")) return "FEATURE";
  if (w.startsWith("sub")) return "SUBTASK";
  if (w.startsWith("bug")) return "BUG";
  return "TASK";
}

/**
 * Finds the parent the text points at, by key ("under PAY-12") or by name and type
 * ("in the Kanban board feature", "under epic AI task creation").
 */
function findParent(text: string, workItems: WorkItem[], projectId?: string): ParentHit | null {
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
        let date = dayjs().day(WEEKDAYS.indexOf(m[1]));
        if (!date.isAfter(dayjs(), "day")) date = date.add(1, "week");
        return date;
      },
    ],
    [
      /\b(?:by |on |due )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?\b/,
      (m) => {
        let date = dayjs().month(MONTHS.indexOf(m[1])).date(Number(m[2]));
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

/** Turns what the user typed or said into work item fields for them to review. */
export function parseCommand(
  input: string,
  source: CommandSource,
  context: ParseContext,
): ParsedCommand {
  const { projects, members, workItems, userId } = context;
  const text = input.trim();
  let rest = ` ${text} `;
  const lower = rest.toLowerCase();
  const detected: ParsedCommand["detected"] = [];
  const questions: string[] = [];
  const warnings: string[] = [];
  const strip = (phrase: string) => {
    rest = rest.replace(new RegExp(escapeRegex(phrase), "i"), " ");
  };

  // Parent first: "under PAY-12", "in the Kanban board feature". Taking it out of the text
  // stops its type word ("feature") from being read as the new item's type.
  const named = findParent(rest, workItems, context.projectId);
  const fromPage = context.parentId ? workItems.find((w) => w.id === context.parentId) : undefined;
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
      const parentName = TYPE_META[parent.type].label.toLowerCase();
      warnings.push(
        `A ${typeName} goes under a ${allowedNames}, not ${parent.type === "EPIC" ? "an" : "a"} ${parentName}. Pick a ${allowedNames} as the parent below.`,
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

  // Assignee: "assign to me", "assign to Ramya", "for Shahanas", "@Ramya". Names are matched
  // without case, since speech recognition often writes them in lower case.
  const assigneeIds: string[] = [];
  const ASSIGN = "(?:assign(?:ed)?(?: it)? to|give (?:it )?to|for|@)\\s*";
  const meMatch = /\bassign(?:ed)?(?: it)? to me\b|\bfor me\b/i.exec(rest);
  if (meMatch && userId) {
    strip(meMatch[0]);
    assigneeIds.push(userId);
    detected.push({ field: "assignee", label: "Assignee: you" });
  } else {
    const active = members.filter((m) => m.status === "ACTIVE");
    let hit: { phrase: string; said: string; matches: Member[] } | null = null;
    for (const member of active) {
      const full = member.name.trim();
      const first = full.split(/\s+/)[0];
      const m =
        new RegExp(`(?:^|\\s|\\b)${ASSIGN}(${escapeRegex(full)})\\b`, "i").exec(rest) ??
        new RegExp(`(?:^|\\s|\\b)${ASSIGN}(${escapeRegex(first)})\\b`, "i").exec(rest);
      if (!m) continue;
      const said = m[1].toLowerCase();
      const matches = active.filter(
        (u) => u.name.toLowerCase() === said || u.name.toLowerCase().split(/\s+/)[0] === said,
      );
      hit = { phrase: m[0], said: m[1], matches };
      break;
    }
    if (hit) {
      strip(hit.phrase);
      if (hit.matches.length === 1) {
        assigneeIds.push(hit.matches[0].id);
        detected.push({ field: "assignee", label: `Assignee: ${hit.matches[0].name}` });
      } else {
        questions.push(
          `Which ${hit.said} did you mean? ${hit.matches.map((m) => m.name).join(" or ")}.`,
        );
      }
    } else {
      // A clear "assign to X" with nobody by that name.
      const unknown = /\b(?:assign(?:ed)?(?: it)? to|give (?:it )?to|@)\s*([A-Za-z]+)/i.exec(rest);
      if (unknown) {
        warnings.push(`No active member called "${unknown[1]}". Left unassigned.`);
        strip(unknown[0]);
      }
    }
  }

  // Project: by key or name, else the parent's, else the page you are on
  const contextProject = context.projectId
    ? projects.find(
        (p) =>
          p.id === context.projectId || p.key.toLowerCase() === context.projectId!.toLowerCase(),
      )
    : undefined;
  let projectId = parentProjectId ?? contextProject?.id ?? null;
  for (const project of parentProjectId ? [] : projects) {
    const keyHit = new RegExp(`\\b${escapeRegex(project.key)}\\b`, "i").exec(rest);
    const nameHit = new RegExp(
      `\\b(?:in|on|under|for)?\\s*(?:the )?${escapeRegex(project.name)}(?: project)?\\b`,
      "i",
    ).exec(rest);
    const hit = keyHit ?? nameHit;
    if (hit) {
      projectId = project.id;
      strip(
        new RegExp(
          `\\b(?:in|on|under|for)?\\s*(?:the )?${escapeRegex(hit[0].trim())}(?: project)?`,
          "i",
        ).exec(rest)?.[0] ?? hit[0],
      );
      break;
    }
  }
  const project = projects.find((p) => p.id === projectId);
  if (project) detected.push({ field: "project", label: `Project: ${project.name}` });
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
  if (!title) questions.push("What should the work item be about?");
  title = (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 120);

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

  const description = `${title}.\n\nCreated from ${source === "voice" ? "voice" : "text"}: "${text}"`;

  // Similar open items in the same project, by shared words in the title
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
    source,
    input: text,
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
