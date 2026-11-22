import { z } from "zod";

// Project Key regex: uppercase alphanumeric (e.g. "PRJ", "CORE2")
const PROJECT_KEY_REGEX = /^[A-Z0-9]{2,10}$/;

export const createProjectSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Project name is required" })
      .trim()
      .min(2, "Project name must be at least 2 characters")
      .max(150, "Project name cannot exceed 150 characters"),
    key: z
      .string({ required_error: "Project key is required" })
      .trim()
      .toUpperCase()
      .regex(
        PROJECT_KEY_REGEX,
        "Project key must be 2-10 uppercase alphanumeric characters (e.g. 'API', 'CORE1')",
      ),
    description: z
      .string()
      .trim()
      .max(1000, "Description cannot exceed 1000 characters")
      .optional(),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid project ID. Must be a valid UUID."),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Project name must be at least 2 characters")
        .max(150, "Project name cannot exceed 150 characters")
        .optional(),
      description: z
        .string()
        .trim()
        .max(1000, "Description cannot exceed 1000 characters")
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field (name or description) must be provided for update",
    }),
});

export const projectIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid project ID. Must be a valid UUID."),
  }),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>["body"];
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>["body"];

export interface ProjectResponse {
  id: string;
  tenantId: string;
  name: string;
  key: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
