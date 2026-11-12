import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email").email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(80, "Name must be 80 characters or fewer"),
  email: z.string().trim().toLowerCase().min(1, "Enter your email").email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const WORKSPACE_TYPES = ["WORK", "PERSONAL"] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

/** The step after signup: pick Work or Personal, then name and describe the workspace. */
export const organizationSchema = z
  .object({
    workspaceType: z.enum(WORKSPACE_TYPES),
    organizationName: z.string().trim(),
    /** Optional; the backend accepts up to 500 characters. */
    description: z.string().trim().max(500, "Description must be 500 characters or fewer"),
  })
  .superRefine((value, ctx) => {
    const what = value.workspaceType === "WORK" ? "organisation" : "workspace";
    if (value.organizationName.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["organizationName"],
        message: `Enter your ${what} name`,
      });
    } else if (value.organizationName.length > 80) {
      ctx.addIssue({
        code: "custom",
        path: ["organizationName"],
        message: "Name must be 80 characters or fewer",
      });
    }
  });

export type OrganizationInput = z.infer<typeof organizationSchema>;
