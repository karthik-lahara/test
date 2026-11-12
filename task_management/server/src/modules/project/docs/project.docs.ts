/**
 * Swagger docs for the project module (mounted at /api/projects).
 * Only comments: swagger-jsdoc reads them, nothing here runs.
 */

/**
 * @openapi
 * /projects/{organizationId}:
 *   post:
 *     tags: [Projects]
 *     summary: Create a project (organization_admin)
 *     description: >
 *       The lead (default: the creator) becomes `project_manager`; memberIds become `member`.
 *       Lead and members must be active members of the organization.
 *       The key is saved uppercase, is unique in the organization and can never change.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, key]
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100, example: AXMS Website }
 *               key:
 *                 type: string
 *                 pattern: '^[A-Za-z][A-Za-z0-9]{1,5}$'
 *                 description: 2-6 letters or digits, starting with a letter
 *                 example: axms
 *               summary: { type: string, maxLength: 150, example: One line about the goal }
 *               description: { type: string, maxLength: 500, example: Marketing site }
 *               status: { type: string, enum: [planning, active, on_hold, completed], default: planning }
 *               priority: { type: string, enum: [no_priority, low, medium, high, urgent], default: medium }
 *               leadId: { $ref: '#/components/schemas/ObjectId' }
 *               startDate: { type: string, format: date, example: '2026-11-15' }
 *               targetDate: { type: string, format: date, example: '2026-12-20', description: Not before startDate }
 *               memberIds:
 *                 type: array
 *                 maxItems: 50
 *                 uniqueItems: true
 *                 items: { $ref: '#/components/schemas/ObjectId' }
 *               color: { type: string, pattern: '^#[0-9A-Fa-f]{6}$', example: '#7c6cf2' }
 *     responses:
 *       201:
 *         description: Project created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Project created successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     project: { $ref: '#/components/schemas/Project' }
 *                     members:
 *                       type: array
 *                       description: The lead (project_manager) first, then the members
 *                       items: { $ref: '#/components/schemas/ProjectMember' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Project key already exists in this organization
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

/**
 * @openapi
 * /projects/list/{organizationId}:
 *   get:
 *     tags: [Projects]
 *     summary: List projects of an organization
 *     description: >
 *       organization_admin sees every project; a member sees only projects they belong to.
 *       Archived projects are hidden. Newest first.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [planning, active, on_hold, completed] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [no_priority, low, medium, high, urgent] }
 *       - in: query
 *         name: search
 *         description: Matches name or key, case-insensitive
 *         schema: { type: string, maxLength: 100 }
 *     responses:
 *       200:
 *         description: Projects fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Projects fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     projects:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ProjectListItem' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /projects/details/{projectId}:
 *   get:
 *     tags: [Projects]
 *     summary: One project with its lead and members
 *     description: >
 *       organization_admin can open any project of the organization; a member only projects they belong to (403).
 *       Users outside the organization get 404. `access` tells the frontend which buttons to show.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Project fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Project fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     project:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Project'
 *                         - type: object
 *                           properties:
 *                             lead:
 *                               allOf: [{ $ref: '#/components/schemas/UserSummary' }]
 *                               nullable: true
 *                     members:
 *                       type: array
 *                       description: project_manager first, then members by join date
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId: { $ref: '#/components/schemas/ObjectId' }
 *                           fullName: { type: string, example: Aiswarya }
 *                           email: { type: string, format: email }
 *                           role: { type: string, enum: [project_manager, member] }
 *                           joinedAt: { type: string, format: date-time }
 *                     access:
 *                       type: object
 *                       properties:
 *                         organizationRole: { type: string, enum: [organization_admin, member] }
 *                         projectRole: { type: string, enum: [project_manager, member], nullable: true }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /projects/update/{projectId}:
 *   patch:
 *     tags: [Projects]
 *     summary: Change project details (organization_admin or the project's project_manager)
 *     description: >
 *       Send only what changes (at least one field). "" clears summary/description;
 *       null clears startDate/targetDate/color. The end date is checked against the saved start date too.
 *       key, lead and members cannot be changed here.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100, example: AXMS Website v2 }
 *               summary: { type: string, maxLength: 150 }
 *               description: { type: string, maxLength: 500 }
 *               status: { type: string, enum: [planning, active, on_hold, completed] }
 *               priority: { type: string, enum: [no_priority, low, medium, high, urgent] }
 *               startDate: { type: string, format: date, nullable: true }
 *               targetDate: { type: string, format: date, nullable: true, example: '2027-01-15' }
 *               color: { type: string, pattern: '^#[0-9A-Fa-f]{6}$', nullable: true }
 *     responses:
 *       200:
 *         description: Project updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Project updated successfully }
 *                 data: { $ref: '#/components/schemas/Project' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /projects/delete/{projectId}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete (archive) a project (organization_admin)
 *     description: >
 *       Soft delete: isArchived = true, archivedAt/archivedBy saved. Members are kept and the key stays reserved.
 *       The project is hidden from lists and returns 404 afterwards.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Project deleted
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessNoData' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /projects/members/{projectId}:
 *   get:
 *     tags: [Projects]
 *     summary: People in a project
 *     description: >
 *       Allowed: organization_admin, or anyone in the project (project_manager / member).
 *       Other organization members get 403; users outside the organization get 404.
 *       project_manager first, then A-Z by name. Inactive members are hidden.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: search
 *         description: Matches name or email, case-insensitive
 *         schema: { type: string, maxLength: 100 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [project_manager, member] }
 *     responses:
 *       200:
 *         description: Project members fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Project members fetched successfully }
 *                 data: { $ref: '#/components/schemas/MembersListData' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

export {};
