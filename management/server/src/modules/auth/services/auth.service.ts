import { Types } from "mongoose";
import { validateWithSchema } from "@utils/validator";
import { AuthorizeError, ConflictError } from "@utils/errors";
import { hashPassword, verifyPassword } from "@utils/password";
import { hashToken, JWTUserHandler } from "@utils/jwt";
import { logger } from "@utils/logger";
import { IUser } from "../entities/user.entity";
import { signupSchema } from "../ajv-schema/signup.schema";
import { loginSchema } from "../ajv-schema/login.schema";
import { AuthResult, ClientInfo, LoginInput, PublicUser, SignupInput } from "../entities/auth.entity";
import { AuthRepository } from "../repositories/auth.repository";

const toPublicUser = ({ _id, password: _password, ...rest }: IUser): PublicUser => ({
  id: _id.toString(),
  ...rest,
});

/** MongoDB duplicate key error (e.g. two signups with the same email at once) */
const isDuplicateKeyError = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

export class AuthService {
  private repository = new AuthRepository();
  private jwt = new JWTUserHandler();

  public async signup(body: unknown): Promise<PublicUser> {
    const input = validateWithSchema<SignupInput>(signupSchema, body);
    const email = input.email.trim().toLowerCase();

    if (await this.repository.userExistsByEmail(email)) {
      throw new ConflictError("Email is already registered");
    }

    try {
      const user = await this.repository.createUser({
        fullName: input.fullName.trim(),
        email,
        password: await hashPassword(input.password),
      });
      return toPublicUser(user);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new ConflictError("Email is already registered");
      throw err;
    }
  }

  /**
   * Checks email + password and starts a new session (one per device).
   * Roles are not part of login: they live on organization/project memberships.
   */
  public async login(body: unknown, client: ClientInfo): Promise<AuthResult> {
    const input = validateWithSchema<LoginInput>(loginSchema, body);
    const email = input.email.trim().toLowerCase();

    const user = await this.repository.findByEmailWithPassword(email);
    // Same message for unknown email and wrong password, so emails can't be probed
    if (!user || !(await verifyPassword(user.password, input.password))) {
      throw new AuthorizeError("Invalid email or password");
    }

    const sessionId = new Types.ObjectId();
    const refreshToken = this.jwt.generateRefreshToken({ userId: user._id.toString(), sessionId: sessionId.toString() });
    await this.repository.createSession({
      _id: sessionId,
      userId: user._id,
      tokenHash: hashToken(refreshToken.token),
      expiresAt: refreshToken.expiresAt,
      userAgent: client.userAgent,
      ip: client.ip,
    });

    return { user: toPublicUser(user), accessToken: this.issueAccessToken(user), refreshToken };
  }

  /**
   * Exchanges a valid refresh token for a new access token and a new refresh token (rotation).
   * Reusing an old, already rotated token means it was probably stolen: all of the user's sessions are ended.
   */
  public async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) throw new AuthorizeError("Refresh token missing");

    const { userId, sessionId } = this.jwt.verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionById(sessionId);
    if (!session || session.userId.toString() !== userId) {
      throw new AuthorizeError("Session expired, please log in again");
    }

    const presentedHash = hashToken(refreshToken);
    if (session.tokenHash !== presentedHash) {
      await this.endAllSessions(userId, "Refresh token reuse detected");
      throw new AuthorizeError("Session expired, please log in again");
    }

    const user = await this.repository.findUserById(userId);
    if (!user) {
      await this.repository.deleteSession(sessionId);
      throw new AuthorizeError("Session expired, please log in again");
    }

    const next = this.jwt.generateRefreshToken({ userId, sessionId });
    const rotated = await this.repository.rotateSessionToken(
      session._id,
      presentedHash,
      hashToken(next.token),
      next.expiresAt
    );
    if (!rotated) {
      // Another request rotated this token between our read and write: treat as reuse
      await this.endAllSessions(userId, "Concurrent refresh token reuse detected");
      throw new AuthorizeError("Session expired, please log in again");
    }

    return { user: toPublicUser(user), accessToken: this.issueAccessToken(user), refreshToken: next };
  }

  /** Ends the session that owns this refresh token. Never fails: logout always succeeds. */
  public async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const { sessionId } = this.jwt.verifyRefreshToken(refreshToken);
      await this.repository.deleteSession(sessionId);
    } catch {
      // Invalid or expired token: nothing to delete, the cookie is still cleared
    }
  }

  private issueAccessToken(user: IUser): string {
    return this.jwt.generateAccessToken({
      userId: user._id.toString(),
      name: user.fullName,
      email: user.email,
    });
  }

  private async endAllSessions(userId: string, reason: string): Promise<void> {
    logger.warn({ userId }, `${reason}, ending all sessions`);
    await this.repository.deleteAllSessionsForUser(userId);
  }
}
