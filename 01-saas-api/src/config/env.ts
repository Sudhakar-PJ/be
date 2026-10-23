/* eslint-disable no-console */
import dotenv from "dotenv";
import { z } from "zod";

// Load .env file into process.env
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // PostgreSQL Configuration
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis Configuration
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection URL"),

  // JWT Configuration (RS256)
  JWT_ACCESS_PRIVATE_KEY: z.string().min(1, "JWT_ACCESS_PRIVATE_KEY is required"),
  JWT_ACCESS_PUBLIC_KEY: z.string().min(1, "JWT_ACCESS_PUBLIC_KEY is required"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Fatal: Invalid or missing environment variables:\n");
    const formatted = result.error.format();

    for (const [key, value] of Object.entries(formatted)) {
      if (key !== "_errors" && value && "_errors" in value) {
        console.error(`  • ${key}: ${(value._errors as string[]).join(", ")}`);
      }
    }

    console.error("\nPlease check your .env file against .env.example.\n");
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
