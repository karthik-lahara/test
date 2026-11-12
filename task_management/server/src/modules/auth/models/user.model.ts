import { Schema, model } from "mongoose";
import { IUser } from "../entities/user.entity";

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
  },
  { timestamps: true, versionKey: false }
);

export const UserModel = model<IUser>("User", userSchema);
