/** Validates LoginInput (entities/auth.entity.ts) */
export const loginSchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email", maxLength: 254 },
    password: { type: "string", minLength: 1, maxLength: 128 },
  },
} as const;
