import { type CookieOptions, type Request, type Response } from "express";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../lib/apiError";
import { authService, type RequestMetadata } from "./auth.service";

const REFRESH_COOKIE_NAME = "refreshToken";

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  path: "/api/v1/auth", // Cookie is only sent to auth endpoints
};

function extractMetadata(req: Request): RequestMetadata {
  return {
    userAgent: (req.headers["user-agent"] as string) ?? null,
    ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
  };
}

function extractRefreshToken(req: Request): string {
  // Check HttpOnly cookie first, then fall back to JSON body
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;

  if (!token || typeof token !== "string") {
    throw new UnauthorizedError("Refresh token is required", "REFRESH_TOKEN_REQUIRED");
  }

  return token;
}

export class AuthController {
  /**
   * POST /api/v1/auth/signup
   */
  async signup(req: Request, res: Response): Promise<void> {
    const meta = extractMetadata(req);
    const result = await authService.signup(req.body, meta);

    res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, COOKIE_OPTIONS);

    res.status(201).json({
      status: "success",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.rawRefreshToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    const meta = extractMetadata(req);
    const result = await authService.login(req.body, meta);

    res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, COOKIE_OPTIONS);

    res.status(200).json({
      status: "success",
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.rawRefreshToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/refresh
   */
  async refresh(req: Request, res: Response): Promise<void> {
    const rawToken = extractRefreshToken(req);
    const meta = extractMetadata(req);
    const result = await authService.refresh(rawToken, meta);

    // Set the newly rotated refresh token cookie
    res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, COOKIE_OPTIONS);

    res.status(200).json({
      status: "success",
      data: {
        accessToken: result.accessToken,
        refreshToken: result.rawRefreshToken,
      },
    });
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;

    if (token && typeof token === "string") {
      await authService.logout(token);
    }

    const { maxAge: _, ...clearCookieOptions } = COOKIE_OPTIONS;
    res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions);

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  }
}

export const authController = new AuthController();
