/** Validates SignupInput (entities/auth.entity.ts) */
export const signupSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fullName", "email", "password"],
  properties: {
    fullName: { type: "string", minLength: 2, maxLength: 100, pattern: "\\S" },
    email: { type: "string", format: "email", maxLength: 254 },
    // At least 8 characters with one letter and one number
    password: { type: "string", minLength: 8, maxLength: 128, pattern: "^(?=.*[A-Za-z])(?=.*\\d).+$" },
  },
} as const;
