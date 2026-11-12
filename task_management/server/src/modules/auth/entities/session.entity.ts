import { Types } from "mongoose";

/**
 * A document in the sessions collection: one login on one device.
 * Holds a hash of that device's current refresh token.
 * Rotating the refresh token replaces the hash; logout deletes the session.
 */
export interface ISession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** SHA-256 of the current refresh token, never the token itself */
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}
