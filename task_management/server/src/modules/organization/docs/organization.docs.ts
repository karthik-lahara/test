/**
 * Swagger docs for the organization module (mounted at /api/organization).
 * Only comments: swagger-jsdoc reads them, nothing here runs.
 */

/**
 * @openapi
 * /organization/create:
 *   post:
 *     tags: [Organization]
 *     summary: Create a personal or work organization
 *     description: The creator automatically becomes `organization_admin`.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100, example: Lahara Technologies }
 *               type: { type: string, enum: [personal, work] }
 *               description: { type: string, maxLength: 500, example: Software development organization }
 *     responses:
 *       201:
 *         description: Organization created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Organization created successfully }
 *                 data: { $ref: '#/components/schemas/UserOrganization' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */

/**
 * @openapi
 * /organization/list:
 *   get:
 *     tags: [Organization]
 *     summary: The logged-in user's organizations, with their role in each
 *     description: >
 *       Call after login. `onboarding.status`:
 *       NO_ORGANIZATION -> show create workspace,
 *       SINGLE_ORGANIZATION -> open organizations[0],
 *       MULTIPLE_ORGANIZATIONS -> show a selector.
 *       Archived organizations and inactive memberships are not listed. Sorted A-Z by name.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Organizations fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Organizations fetched successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { $ref: '#/components/schemas/ObjectId' }
 *                         fullName: { type: string, example: Amal Pradeep }
 *                         email: { type: string, format: email }
 *                     onboarding:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           enum: [NO_ORGANIZATION, SINGLE_ORGANIZATION, MULTIPLE_ORGANIZATIONS]
 *                     organizations:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/UserOrganization' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */

/**
 * @openapi
 * /organization/update/{organizationId}:
 *   patch:
 *     tags: [Organization]
 *     summary: Change the organization's name or description (organization_admin)
 *     description: Send at least one field. An empty description ("") removes it. The type cannot be changed.
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
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               name: { type: string, minLength: 2, maxLength: 100, example: Lahara Technologies Pvt Ltd }
 *               description: { type: string, maxLength: 500, example: Updated description }
 *     responses:
 *       200:
 *         description: Organization updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Organization updated successfully }
 *                 data: { $ref: '#/components/schemas/UserOrganization' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /organization/delete/{organizationId}:
 *   delete:
 *     tags: [Organization]
 *     summary: Delete (archive) an organization (organization_admin)
 *     description: >
 *       Soft delete: status becomes "archived" and archivedAt/archivedBy are saved.
 *       The organization disappears from the list and returns 404 afterwards.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       200:
 *         description: Organization deleted
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
 * /organization/members/{organizationId}:
 *   get:
 *     tags: [Organization]
 *     summary: People in an organization
 *     description: >
 *       Any active member of the organization can see this list. Inactive (removed) members are hidden.
 *       Sorted A-Z by name. Used for the People page and the Lead / Members pickers in the New Project form.
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
 *         name: search
 *         description: Matches name or email, case-insensitive
 *         schema: { type: string, maxLength: 100 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [organization_admin, member] }
 *     responses:
 *       200:
 *         description: Organization members fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Organization members fetched successfully }
 *                 data: { $ref: '#/components/schemas/MembersListData' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

export {};
