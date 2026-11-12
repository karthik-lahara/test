import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";
import { env } from "@config/env";
import { AuthorizeError } from "@utils/errors";

/** Data inside the access token, available as req.user. No roles: those come from memberships. */
export interface TokenPayload {
  userId: string;
  name: string;
  email: string;
}

/** Data inside the refresh token: who, and which session (device) */
export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
}

export interface SignedRefreshToken {
  token: string;
  expiresAt: Date;
}

/** Refresh tokens are stored as SHA-256 hashes (they are long random JWTs, so a fast hash is enough) */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export class JWTUserHandler {
  private accessTokenSecret = env.USER_ACCESS_TOKEN_SECRET;
  private refreshTokenSecret = env.USER_REFRESH_TOKEN_SECRET;

  public generateAccessToken(data: TokenPayload): string {
    return jwt.sign(data, this.accessTokenSecret, {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
    });
  }

  public generateRefreshToken(data: RefreshTokenPayload): SignedRefreshToken {
    // jwtid makes every token unique, even two issued in the same second
    const token = jwt.sign({ userId: data.userId, sid: data.sessionId }, this.refreshTokenSecret, {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
      jwtid: randomUUID(),
    });
    const { exp } = jwt.decode(token) as JwtPayload;
    return { token, expiresAt: new Date((exp as number) * 1000) };
  }

  public verifyAccessToken(token: string): TokenPayload {
    const decoded = this.verify(token, this.accessTokenSecret, "Invalid or expired access token");
    const { userId, name, email } = decoded as JwtPayload & TokenPayload;
    return { userId, name, email };
  }

  public verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = this.verify(token, this.refreshTokenSecret, "Invalid or expired refresh token");
    const { userId, sid } = decoded as JwtPayload & { userId?: string; sid?: string };
    if (!userId || !sid) throw new AuthorizeError("Invalid or expired refresh token");
    return { userId, sessionId: sid };
  }

  private verify(token: string, secret: string, errorMessage: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, secret);
      if (typeof decoded === "string") throw new AuthorizeError("Invalid token format");
      return decoded;
    } catch {
      throw new AuthorizeError(errorMessage);
    }
  }
}
