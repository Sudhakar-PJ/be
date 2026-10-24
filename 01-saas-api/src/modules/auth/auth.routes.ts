import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../middleware/validate";
import { authController } from "./auth.controller";
import { loginSchema, signupSchema } from "./auth.schemas";

const authRouter = Router();

authRouter.post(
  "/signup",
  validate(signupSchema),
  asyncHandler((req, res) => authController.signup(req, res))
);

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler((req, res) => authController.login(req, res))
);

authRouter.post(
  "/refresh",
  asyncHandler((req, res) => authController.refresh(req, res))
);

authRouter.post(
  "/logout",
  asyncHandler((req, res) => authController.logout(req, res))
);

export { authRouter };
