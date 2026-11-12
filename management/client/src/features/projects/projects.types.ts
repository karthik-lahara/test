import { z } from "zod";

import { env } from "@/shared/config/env";
import { PRIORITIES, PROJECT_STATUSES } from "@/shared/constants/workItem";

export interface ProgressPoint {
  date: string;
  scope: number;
  started: number;
  completed: number;
}

export interface ProjectProgress {
  points: ProgressPoint[];
  byAssignee: Array<{ memberId: string | null; total: number; done: number }>;
  byLabel: Array<{ label: string; total: number; done: number }>;
  endDate: string | null;
}

export const projectSchema = z
  .object({
    name: z.string().trim().min(2, "Give the project a name"),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,5}$/, "2 to 6 letters or digits, starting with a letter"),
    summary: z.string().trim().max(120, "Keep it under 120 characters"),
    // The server allows 500 characters; demo mode keeps the original (no limit)
    description: env.USE_MOCKS
      ? z.string().trim()
      : z.string().trim().max(500, "Keep it under 500 characters"),
    status: z.enum(PROJECT_STATUSES),
    priority: z.enum(PRIORITIES),
    leadId: z.string(),
    teamId: z.string(),
    memberIds: z.array(z.string()),
    startDate: z.string(),
    endDate: z.string(),
    color: z.string(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  });

export type ProjectInput = z.infer<typeof projectSchema>;

export const sprintSchema = z
  .object({
    projectId: z.string(),
    name: z.string().trim().min(2, "Give the sprint a name"),
    goal: z.string().trim().max(200, "Keep it under 200 characters"),
    startDate: z.string().min(1, "Pick a start date"),
    endDate: z.string().min(1, "Pick an end date"),
  })
  .refine((v) => v.endDate > v.startDate, {
    path: ["endDate"],
    message: "End after the start date",
  });

export type SprintInput = z.infer<typeof sprintSchema>;
