import argon2 from "argon2";

export const hashPassword = async (plain: string): Promise<string> => {
  return argon2.hash(plain);
};

export const verifyPassword = async (hashed: string, plain: string): Promise<boolean> => {
  return argon2.verify(hashed, plain);
};
