import { z } from "zod";

import { AVAILABILITY, ROLES } from "@/shared/constants/workItem";

export const inviteMemberSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name"),
  email: z.string().trim().toLowerCase().email("Enter a valid work email"),
  role: z.enum(ROLES, "Choose a role"),
  designation: z.string().trim().max(60, "Keep it under 60 characters"),
  teamIds: z.array(z.string()),
  reportingManagerId: z.string(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(ROLES, "Choose a role"),
  designation: z.string().trim().max(60, "Keep it under 60 characters"),
  teamIds: z.array(z.string()),
  reportingManagerId: z.string(),
  availability: z.enum(AVAILABILITY),
  skills: z.string(),
});
export type UpdateMemberForm = z.infer<typeof updateMemberSchema>;
export type UpdateMemberInput = Omit<UpdateMemberForm, "skills" | "reportingManagerId"> & {
  skills: string[];
  reportingManagerId: string | null;
};

export const teamSchema = z.object({
  name: z.string().trim().min(2, "Give the team a name"),
  description: z.string().trim().max(200, "Keep it under 200 characters"),
  color: z.string(),
  leadId: z.string(),
  memberIds: z.array(z.string()),
});
export type TeamInput = z.infer<typeof teamSchema>;

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the organisation name"),
  timeZone: z.string().min(1, "Choose a time zone"),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;
