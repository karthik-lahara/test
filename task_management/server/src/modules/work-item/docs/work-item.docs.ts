/**
 * Swagger docs for the work item module (mounted at /api/work-items).
 * Only comments: swagger-jsdoc reads them, nothing here runs.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     WorkItem:
 *       type: object
 *       properties:
 *         id: { $ref: '#/components/schemas/ObjectId' }
 *         organizationId: { $ref: '#/components/schemas/ObjectId' }
 *         projectId: { $ref: '#/components/schemas/ObjectId' }
 *         key: { type: string, example: PAY-12, description: Project key + running number. Never changes. }
 *         type: { type: string, enum: [epic, feature, story, task, bug, subtask] }
 *         title: { type: string, example: Build the export API }
 *         description: { type: string, example: '' }
 *         acceptanceCriteria:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id: { $ref: '#/components/schemas/ObjectId' }
 *               text: { type: string }
 *               done: { type: boolean }
 *         statusId: { $ref: '#/components/schemas/ObjectId' }
 *         status: { $ref: '#/components/schemas/WorkItemStatusSummary' }
 *         priority: { type: string, enum: [no_priority, low, medium, high, urgent] }
 *         assigneeIds: { type: array, items: { $ref: '#/components/schemas/ObjectId' } }
 *         reporterId: { $ref: '#/components/schemas/ObjectId' }
 *         parentId: { type: string, nullable: true }
 *         sprintId: { type: string, nullable: true }
 *         labels: { type: array, items: { type: string } }
 *         startDate: { type: string, format: date-time, nullable: true }
 *         dueDate: { type: string, format: date-time, nullable: true }
 *         estimateHours: { type: number, nullable: true }
 *         loggedHours: { type: number, example: 0, description: Sum of logged time }
 *         storyPoints: { type: number, nullable: true }
 *         createdVia: { type: string, enum: [manual, text, voice] }
 *         aiGenerated: { type: boolean, description: Fields came from an AI suggestion the user approved }
 *         attachments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id: { $ref: '#/components/schemas/ObjectId' }
 *               fileName: { type: string, example: invoice-requirements.pdf }
 *               fileUrl: { type: string, example: 'https://storage.example.com/invoice-requirements.pdf' }
 *         order: { type: integer, example: 42000, description: 'Position in the backlog (number × 1000); new items go last' }
 *         completedAt: { type: string, format: date-time, nullable: true }
 *         createdBy: { $ref: '#/components/schemas/ObjectId' }
 *         isArchived: { type: boolean, example: false }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */

/**
 * @openapi
 * /work-items:
 *   post:
 *     tags: [Work items]
 *     summary: Create a work item in a project (organization_admin, project_manager, member)
 *     description: >
 *       organizationId and projectId go in the body and are required; the project must belong to the organization (404 otherwise).
 *       The key is the project key plus the next number (PAY-1, PAY-2...). The signed-in user is the reporter.
 *       Hierarchy: Epic → Feature → Story → Task / Bug → Subtask. The parent must be in the same project;
 *       an epic has no parent and a subtask must have one (a task or bug).
 *       Assignees must be active members of the organization. Story points only on stories and bugs.
 *       loggedHours, attachments and isArchived start empty; createdBy is the signed-in user.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, projectId, type, title]
 *             additionalProperties: false
 *             properties:
 *               organizationId: { $ref: '#/components/schemas/ObjectId' }
 *               projectId: { $ref: '#/components/schemas/ObjectId' }
 *               type: { type: string, enum: [epic, feature, story, task, bug, subtask], example: task }
 *               title: { type: string, minLength: 1, maxLength: 200, example: Build the export API }
 *               description: { type: string, maxLength: 5000 }
 *               statusId:
 *                 type: string
 *                 nullable: true
 *                 description: One of the project's statuses (GET /work-item-statuses/{projectId}). Default is the project's default status.
 *               priority: { type: string, enum: [no_priority, low, medium, high, urgent], default: medium }
 *               assigneeIds:
 *                 type: array
 *                 maxItems: 10
 *                 uniqueItems: true
 *                 items: { $ref: '#/components/schemas/ObjectId' }
 *               parentId: { type: string, nullable: true, description: ObjectId of the parent work item }
 *               sprintId:
 *                 type: string
 *                 nullable: true
 *                 description: Not for epics and features. Items under a story, bug or task follow the parent's sprint.
 *               labels:
 *                 type: array
 *                 maxItems: 20
 *                 items: { type: string, maxLength: 30 }
 *                 example: [export-api]
 *               startDate: { type: string, format: date, nullable: true, example: '2026-11-16' }
 *               dueDate: { type: string, format: date, nullable: true, example: '2026-11-20', description: Not before startDate }
 *               estimateHours: { type: number, exclusiveMinimum: 0, maximum: 1000, nullable: true, example: 6 }
 *               storyPoints: { type: number, minimum: 0, maximum: 100, nullable: true, description: Stories and bugs only }
 *               acceptanceCriteria:
 *                 type: array
 *                 maxItems: 20
 *                 items: { type: string, maxLength: 300 }
 *               createdVia: { type: string, enum: [manual, text, voice], default: manual }
 *               aiGenerated: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Work item created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Work item created successfully }
 *                 data: { $ref: '#/components/schemas/WorkItem' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
