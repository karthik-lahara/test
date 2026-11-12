import { IUser } from "./user.entity";
import { ISession } from "./session.entity";
import { SignedRefreshToken } from "@utils/jwt";



/** Body of POST /api/auth/signup */
export interface SignupInput {
  fullName: string;
  email: string;
  password: string;
}

/** Body of POST /api/auth/login */
export interface LoginInput {
  email: string;
  password: string;
}

// ---- Service ----

/** A user as sent to the client: `id` instead of `_id`, never the password */
export type PublicUser = Omit<IUser, "password" | "_id"> & { id: string };

/** Who is logging in from where, saved on the session */
export interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

/** The refresh token goes into an httpOnly cookie (set by the controller), never the response body */
export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: SignedRefreshToken;
}

// ---- Repository ----

export type CreateUserData = Pick<IUser, "fullName" | "email" | "password">;
export type CreateSessionData = Pick<ISession, "_id" | "userId" | "tokenHash" | "expiresAt" | "userAgent" | "ip">;
