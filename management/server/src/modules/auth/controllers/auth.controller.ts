import { CookieOptions, Request, Response } from "express";
import { env } from "@config/env";
import { CustomResponse } from "@middleware/response.middleware";
import { STATUS_CODE } from "@utils/status-code";
import { SignedRefreshToken } from "@utils/jwt";
import { AuthorizeError } from "@utils/errors";
import { AuthResult } from "../entities/auth.entity";
import { AuthService } from "../services/auth.service";

export const REFRESH_COOKIE_NAME = "refreshToken";

// Only sent to the auth endpoints (refresh-token, logout), never to the rest of the API
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict",
  path: "/api/auth",
};

const setRefreshCookie = (res: Response, refreshToken: SignedRefreshToken): void => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken.token, { ...refreshCookieOptions, expires: refreshToken.expiresAt });
};

const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
};

/** Response body: user + access token. The refresh token is only in the cookie. */
const toBody = ({ user, accessToken }: AuthResult) => ({ user, accessToken });

export class AuthController {
  private service = new AuthService();

  public signup = async (req: Request, res: CustomResponse): Promise<void> => {
    const data = await this.service.signup(req.body);
    res.success("User registered successfully", data, STATUS_CODE.CREATED);
  };

  public login = async (req: Request, res: CustomResponse): Promise<void> => {
    const result = await this.service.login(req.body, { userAgent: req.get("user-agent"), ip: req.ip });
    setRefreshCookie(res, result.refreshToken);
    res.success("Login successful", toBody(result), STATUS_CODE.OK);
  };

  public refreshToken = async (req: Request, res: CustomResponse): Promise<void> => {
    try {
      const result = await this.service.refresh(req.cookies?.[REFRESH_COOKIE_NAME]);
      setRefreshCookie(res, result.refreshToken);
      res.success("Token refreshed", toBody(result), STATUS_CODE.OK);
    } catch (err) {
      // A refresh token that no longer works is useless to keep
      if (err instanceof AuthorizeError) clearRefreshCookie(res);
      throw err;
    }
  };

  public logout = async (req: Request, res: CustomResponse): Promise<void> => {
    await this.service.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);
    res.success("Logged out successfully", null, STATUS_CODE.OK);
  };
}
