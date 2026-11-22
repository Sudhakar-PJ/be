import { NextFunction, Request, Response } from "express";
import { type AnyZodObject } from "zod";

/**
 * Validates request payload against a Zod schema.
 * Replaces req.body, req.query, and req.params with the parsed/coerced data.
 */
export const validate =
  (schema: AnyZodObject) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Update Express request objects with parsed and defaulted values
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;

      next();
    } catch (error) {
      next(error);
    }
  };
