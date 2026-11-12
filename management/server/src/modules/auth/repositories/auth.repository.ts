import { Types } from "mongoose";
import { UserModel } from "../models/user.model";
import { SessionModel } from "../models/session.model";
import { IUser } from "../entities/user.entity";
import { ISession } from "../entities/session.entity";
import { CreateSessionData, CreateUserData } from "../entities/auth.entity";

export class AuthRepository {
  // ---- Users ----

  public async userExistsByEmail(email: string): Promise<boolean> {
    return (await UserModel.exists({ email })) !== null;
  }

  public async createUser(data: CreateUserData): Promise<IUser> {
    const user = await UserModel.create(data);
    return user.toObject();
  }

  /** Includes the password hash, which is hidden by default */
  public async findByEmailWithPassword(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email }).select("+password").lean<IUser>();
  }

  public async findUserById(id: Types.ObjectId | string): Promise<IUser | null> {
    return UserModel.findById(id).lean<IUser>();
  }

  // ---- Sessions ----

  public async createSession(data: CreateSessionData): Promise<void> {
    await SessionModel.create(data);
  }

  public async findSessionById(id: string): Promise<ISession | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return SessionModel.findById(id).lean<ISession>();
  }

  /**
   * Swaps in the new token hash, but only if the session still holds the old one.
   * Returns false if another request already rotated it.
   */
  public async rotateSessionToken(
    id: Types.ObjectId,
    oldHash: string,
    newHash: string,
    expiresAt: Date
  ): Promise<boolean> {
    const result = await SessionModel.updateOne(
      { _id: id, tokenHash: oldHash },
      { $set: { tokenHash: newHash, expiresAt } }
    );
    return result.modifiedCount === 1;
  }

  public async deleteSession(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await SessionModel.deleteOne({ _id: id });
  }

  public async deleteAllSessionsForUser(userId: Types.ObjectId | string): Promise<void> {
    await SessionModel.deleteMany({ userId });
  }
}
