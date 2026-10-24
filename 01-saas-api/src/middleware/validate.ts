import { NextFunction, Request, Response } from "express";
import { type AnyZodObject } from "zod";

/**
 * Validates request payload against a Zod schema.
 * Rejections automatically bubble to the central RFC 9457 errorHandler.
 */
export const validate =
  (schema: AnyZodObject) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
