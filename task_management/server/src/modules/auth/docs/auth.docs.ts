/**
 * Swagger docs for the auth module (mounted at /api/auth).
 * Only comments: swagger-jsdoc reads them, nothing here runs.
 */

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Create an account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password]
 *             additionalProperties: false
 *             properties:
 *               fullName: { type: string, minLength: 2, maxLength: 100, example: Amal Pradeep }
 *               email: { type: string, format: email, example: amal@lahara.dev }
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 128
 *                 description: At least one letter and one number
 *                 example: Passw0rd1
 *     responses:
 *       201:
 *         description: User registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: User registered successfully }
 *                 data: { $ref: '#/components/schemas/PublicUser' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       409:
 *         description: Email is already registered
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in
 *     description: >
 *       Returns the access token in the body and sets the refresh token in an httpOnly
 *       `refreshToken` cookie (path /api/auth). 5 failed attempts per IP + email in 15 minutes block login for 15 minutes.
 *       After login, call **GET /organization/list** to decide where to send the user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             additionalProperties: false
 *             properties:
 *               email: { type: string, format: email, example: amal@lahara.dev }
 *               password: { type: string, example: Passw0rd1 }
 *     responses:
 *       200:
 *         description: Logged in
 *         headers:
 *           Set-Cookie:
 *             description: refreshToken (httpOnly)
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Login successful }
 *                 data: { $ref: '#/components/schemas/AuthResult' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: Too many failed login attempts
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Get a new access token
 *     description: >
 *       Uses the `refreshToken` cookie (no body). Returns a new access token and rotates the cookie.
 *       Reusing an old refresh token ends all of the user's sessions.
 *     responses:
 *       200:
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Token refreshed }
 *                 data: { $ref: '#/components/schemas/AuthResult' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out
 *     description: Ends the session of the `refreshToken` cookie and clears the cookie. Always succeeds.
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessNoData' }
 */

export {};
