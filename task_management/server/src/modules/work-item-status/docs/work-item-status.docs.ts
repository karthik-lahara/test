/**
 * Swagger docs for the work item status module (mounted at /api/work-item-statuses).
 * Only comments: swagger-jsdoc reads them, nothing here runs.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     WorkItemStatusSummary:
 *       type: object
 *       properties:
 *         id: { $ref: '#/components/schemas/ObjectId' }
 *         name: { type: string, example: In Progress }
 *         category:
 *           type: string
 *           enum: [todo, in_progress, done]
 *           description: Drives the rules (completedAt, progress); the name is free
 *         color: { type: string, example: '#5E9BFF' }
 *     WorkItemStatus:
 *       allOf:
 *         - $ref: '#/components/schemas/WorkItemStatusSummary'
 *         - type: object
 *           properties:
 *             projectId: { $ref: '#/components/schemas/ObjectId' }
 *             order: { type: integer, example: 2000, description: Board column order }
 *             isDefault: { type: boolean, description: New work items start here }
 *             itemCount: { type: integer, description: Active work items in this status }
 *             createdAt: { type: string, format: date-time }
 *             updatedAt: { type: string, format: date-time }
 */

/**
 * @openapi
 * /work-item-statuses/{projectId}:
 *   get:
 *     tags: [Work item statuses]
 *     summary: List a project's statuses in board order
 *     description: >
 *       Every project starts with To Do (default), In Progress, Blocked, In QA and Done.
 *       Projects made before statuses existed get these the first time they are listed.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { $ref: '#/components/schemas/ObjectId' } }
 *     responses:
 *       200:
 *         description: Statuses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Statuses fetched successfully }
 *                 data: { type: array, items: { $ref: '#/components/schemas/WorkItemStatus' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   post:
 *     tags: [Work item statuses]
 *     summary: Add a status at the end of the board (organization_admin, project_manager)
 *     description: At most 20 statuses per project. Names are unique in the project, ignoring capitals.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { $ref: '#/components/schemas/ObjectId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category]
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, maxLength: 30, example: Code review }
 *               category: { type: string, enum: [todo, in_progress, done], example: in_progress }
 *               color: { type: string, pattern: '^#[0-9A-Fa-f]{6}$', example: '#F5A524' }
 *               isDefault: { type: boolean, description: Not allowed for the done category }
 *     responses:
 *       201:
 *         description: Status created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Status created successfully }
 *                 data: { $ref: '#/components/schemas/WorkItemStatus' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */

/**
 * @openapi
 * /work-item-statuses/update/{statusId}:
 *   patch:
 *     tags: [Work item statuses]
 *     summary: Rename, recolour, change category or make default (organization_admin, project_manager)
 *     description: >
 *       Changing the category updates the status's work items too (entering done sets completedAt,
 *       leaving done clears it). The project must keep at least one todo and one done status.
 *       To change the default, make another status the default (isDefault true).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: statusId, required: true, schema: { $ref: '#/components/schemas/ObjectId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, maxLength: 30 }
 *               category: { type: string, enum: [todo, in_progress, done] }
 *               color: { type: string, pattern: '^#[0-9A-Fa-f]{6}$' }
 *               isDefault: { type: boolean, enum: [true] }
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Status updated successfully }
 *                 data: { $ref: '#/components/schemas/WorkItemStatus' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */

/**
 * @openapi
 * /work-item-statuses/reorder/{projectId}:
 *   post:
 *     tags: [Work item statuses]
 *     summary: Change the board column order (organization_admin, project_manager)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { $ref: '#/components/schemas/ObjectId' } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [statusIds]
 *             additionalProperties: false
 *             properties:
 *               statusIds:
 *                 type: array
 *                 description: Every active status of the project, once, in the new order
 *                 items: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: The statuses in their new order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Statuses reordered successfully }
 *                 data: { type: array, items: { $ref: '#/components/schemas/WorkItemStatus' } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /work-item-statuses/delete/{statusId}:
 *   delete:
 *     tags: [Work item statuses]
 *     summary: Delete a status, moving its work items (organization_admin, project_manager)
 *     description: >
 *       The default status cannot be deleted. The project must keep at least one todo and one done status.
 *       When the status has work items, moveToStatusId is required and they move there first.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: statusId, required: true, schema: { $ref: '#/components/schemas/ObjectId' } }
 *       - in: query
 *         name: moveToStatusId
 *         description: Another status of the same project
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Status deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Status deleted successfully }
 *                 data: { nullable: true, example: null }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
