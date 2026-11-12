import swaggerJsDoc, { Options } from "swagger-jsdoc";

/**
 * OpenAPI spec for Swagger UI (/api-docs, non-production only).
 * Endpoint docs live in each module's docs/ folder (@openapi comments).
 * Shared schemas and error responses are defined once here and reused with $ref.
 */
const options: Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Task Management API",
      version: "1.0.0",
      description:
        "API for the Task Management service.\n\n" +
        "Every response has the shape `{ success, message, data }`.\n\n" +
        "Protected endpoints need `Authorization: Bearer <accessToken>` (get it from **POST /auth/login**, " +
        "then click **Authorize**).",
    },
    servers: [{ url: "/api" }],
    tags: [
      { name: "Auth", description: "Signup, login and sessions" },
      { name: "Organization", description: "Workspaces (personal / work) and the user's organization roles" },
      { name: "Projects", description: "Projects inside an organization and project roles" },
      { name: "Work items", description: "Epics, features, stories, tasks, bugs and subtasks inside a project" },
      { name: "Work item statuses", description: "Each project's own statuses (To Do, In Progress... and custom ones)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Validation error: /name must match pattern \"\\S\"" },
            data: { type: "object", nullable: true, example: null },
          },
        },
        SuccessNoData: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
            data: { type: "object", nullable: true, example: null },
          },
        },
        ObjectId: { type: "string", pattern: "^[a-fA-F0-9]{24}$", example: "673abc123456789012345678" },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            total: { type: "integer", example: 3 },
            totalPages: { type: "integer", example: 1 },
          },
        },

        PersonInList: {
          type: "object",
          description: "One person in an organization or project members list",
          properties: {
            userId: { $ref: "#/components/schemas/ObjectId" },
            fullName: { type: "string", example: "Aiswarya Lakshmi" },
            email: { type: "string", format: "email", example: "aiswarya@lahara.dev" },
            role: {
              type: "string",
              description: "Organization list: organization_admin | member. Project list: project_manager | member.",
              example: "member",
            },
            joinedAt: { type: "string", format: "date-time" },
          },
        },
        MembersListData: {
          type: "object",
          properties: {
            members: { type: "array", items: { $ref: "#/components/schemas/PersonInList" } },
            pagination: { $ref: "#/components/schemas/Pagination" },
          },
        },

        // ---- Auth ----
        PublicUser: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/ObjectId" },
            fullName: { type: "string", example: "Amal Pradeep" },
            email: { type: "string", format: "email", example: "amal@lahara.dev" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        AuthResult: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/PublicUser" },
            accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
          },
        },

        // ---- Organization ----
        Organization: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", example: "Lahara Technologies" },
            type: { type: "string", enum: ["personal", "work"] },
            description: { type: "string", example: "Software development organization" },
            status: { type: "string", enum: ["active", "archived"], example: "active" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        OrganizationMembership: {
          type: "object",
          description: "The current user's membership (role) in the organization",
          properties: {
            id: { $ref: "#/components/schemas/ObjectId" },
            role: { type: "string", enum: ["organization_admin", "member"] },
            status: { type: "string", enum: ["active", "inactive"], example: "active" },
            joinedAt: { type: "string", format: "date-time" },
          },
        },
        UserOrganization: {
          type: "object",
          properties: {
            organization: { $ref: "#/components/schemas/Organization" },
            membership: { $ref: "#/components/schemas/OrganizationMembership" },
          },
        },

        // ---- Projects ----
        Project: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/ObjectId" },
            organizationId: { $ref: "#/components/schemas/ObjectId" },
            name: { type: "string", example: "AXMS Website" },
            key: { type: "string", example: "AXMS" },
            summary: { type: "string", example: "One line about the goal" },
            description: { type: "string", example: "Marketing site" },
            status: { type: "string", enum: ["planning", "active", "on_hold", "completed"] },
            priority: { type: "string", enum: ["no_priority", "low", "medium", "high", "urgent"] },
            leadId: { $ref: "#/components/schemas/ObjectId" },
            startDate: { type: "string", format: "date-time" },
            targetDate: { type: "string", format: "date-time" },
            color: { type: "string", example: "#7C6CF2" },
            createdBy: { $ref: "#/components/schemas/ObjectId" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ProjectMember: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/ObjectId" },
            userId: { $ref: "#/components/schemas/ObjectId" },
            role: { type: "string", enum: ["project_manager", "member"] },
            status: { type: "string", enum: ["active", "inactive"], example: "active" },
            joinedAt: { type: "string", format: "date-time" },
          },
        },
        UserSummary: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/ObjectId" },
            fullName: { type: "string", example: "Aiswarya" },
            email: { type: "string", format: "email" },
          },
        },
        ProjectListItem: {
          allOf: [
            { $ref: "#/components/schemas/Project" },
            {
              type: "object",
              description: "List rows have no description",
              properties: {
                lead: { allOf: [{ $ref: "#/components/schemas/UserSummary" }], nullable: true },
                memberCount: { type: "integer", example: 4 },
                myRole: {
                  type: "string",
                  enum: ["project_manager", "member"],
                  nullable: true,
                  description: "null when an admin sees a project they are not in",
                },
              },
            },
          ],
        },
      },
      responses: {
        BadRequest: {
          description: "Validation error (invalid body, query or id)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
        },
        Unauthorized: {
          description: "Access token missing, invalid or expired",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
        },
        Forbidden: {
          description: "Not a member, or the role is not allowed to do this",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
        },
        NotFound: {
          description: "Not found or archived (also returned to outsiders, so they can't learn it exists)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
        },
        Conflict: {
          description: "Already exists",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
        },
      },
    },
  },
  apis: ["src/modules/**/docs/*.ts", "src/modules/**/routes/*.ts"],
};

export const swaggerSpec = swaggerJsDoc(options);
