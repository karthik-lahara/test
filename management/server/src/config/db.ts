import mongoose from "mongoose";
import { logger } from "@utils/logger";
import { env } from "./env";

mongoose.set("strictQuery", true);

export async function connectDB(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  logger.info("MongoDB connected");
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
  logger.info("MongoDB connection closed");
}
