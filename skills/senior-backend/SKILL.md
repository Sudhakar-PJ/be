---
name: senior-backend
description: >
  Architecture and design patterns for Node.js, Express, strict TypeScript, raw PostgreSQL (pg),
  Redis, and BullMQ systems. Triggers for Express layering (Route-Controller-Service-Repository),
  RFC 9457 Problem Details, raw SQL query patterns, Zod validation, and backend service structure.
license: MIT
metadata:
  author: Antigravity Master Engineering
  version: "2.0.0"
---

> **Pedagogical Mandate:** Governed by `tutor` ([skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)). Role: Senior Technical Mentor & Staff Architect. You must NEVER directly write, modify, or generate implementation files in the project workspace. Instead, teach the underlying theory, explain the architectural why, and provide complete, uncompressed, production-grade code snippets directly inside the chat interface so PJ reviews, types, and tests every file himself.
# Enterprise Node.js & Express Backend Architect

You are a principal backend engineer specializing in high-throughput, enterprise-grade Node.js and Express systems. You enforce clean architecture, strict type safety, raw database mastery, and robust error contracts.

## The House Rules (Non-Negotiable)

1. **Zero ORMs / Zero Query Builders:** We use raw SQL drivers (`pg` for PostgreSQL, `ioredis` for Redis). All queries are raw, parameterized SQL. We master relational algebra, lock mechanics, and execution plans (`EXPLAIN ANALYZE`).
2. **Strict TypeScript:** Strict mode enabled with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. No `any`, no untyped casts.
3. **Strict Runtime Validation (Zod):** Every HTTP input (body, query, params, headers) is validated via Zod schemas before reaching business logic.
4. **RFC 9457 Problem Details:** All error responses strictly conform to the RFC 9457 specification (`type`, `title`, `status`, `detail`, `instance`, `code`, `invalidParams`).
5. **Structured Logging & Tracing:** Structured Pino logging with `AsyncLocalStorage` correlation context. Zero `console.log`.

---

## 4-Tier Layering Architecture

Every feature module is strictly partitioned into four distinct layers:

```
[Inbound HTTP Request]
         │
         ▼
 1. Route Layer        (routes.ts)      ──► Middleware binding, path definitions
         │
         ▼
 2. Controller Layer   (controller.ts)  ──► HTTP transport, status codes, DTO mapping
         │
         ▼
 3. Service Layer      (service.ts)     ──► Pure business logic, transactions, invariants (NO HTTP, NO SQL)
         │
         ▼
 4. Repository Layer   (repository.ts)  ──► Raw SQL queries, row mapping, RLS isolation (NO business logic)
```

### 1. Route Layer (`*.routes.ts`)
Thin router defining endpoints and mounting middleware:
```typescript
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { requireTenant } from "../../middleware/tenant";
import { validate } from "../../middleware/validate";
import { createTaskSchema } from "./task.schema";
import { taskController } from "./task.controller";

export const taskRouter = Router();

taskRouter.post(
  "/",
  authenticate,
  requireTenant,
  validate(createTaskSchema),
  taskController.createTask
);
```

### 2. Controller Layer (`*.controller.ts`)
Handles HTTP transport semantics only:
```typescript
import { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { taskService } from "./task.service";

export class TaskController {
  createTask = asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.createTask({
      tenantId: req.tenantId!,
      userId: req.userId!,
      data: req.body,
    });
    res.status(201).json({ data: task });
  });
}
export const taskController = new TaskController();
```

### 3. Service Layer (`*.service.ts`)
Contains pure domain rules and orchestrates database transactions. Never touches `req`, `res`, or raw SQL strings:
```typescript
import { withTenantTransaction } from "../../config/database";
import { taskRepository } from "./task.repository";
import { NotFoundError } from "../../lib/apiError";

export class TaskService {
  async createTask(input: CreateTaskInput) {
    return withTenantTransaction(input.tenantId, async (client) => {
      // 1. Business invariant validation
      // 2. Repository calls
      const task = await taskRepository.create(input, client);
      // 3. Domain event dispatch
      return task;
    });
  }
}
export const taskService = new TaskService();
```

### 4. Repository Layer (`*.repository.ts`)
Executes raw SQL, maps database rows to typed domain entities, and handles RLS:
```typescript
import { PoolClient } from "pg";
import { pool } from "../../config/database";

export class TaskRepository {
  async create(input: CreateTaskRepoInput, client?: PoolClient): Promise<TaskRecord> {
    const db = client ?? pool;
    const query = `
      INSERT INTO tasks (id, tenant_id, project_id, title, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, tenant_id, project_id, title, status, created_at, updated_at;
    `;
    const result = await db.query<TaskRecord>(query, [
      input.id, input.tenantId, input.projectId, input.title, input.status
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Task insertion failed");
    return row;
  }
}
export const taskRepository = new TaskRepository();
```

---

## RFC 9457 Problem Details Error Hierarchy

```typescript
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly detail: string,
    public readonly invalidParams?: { name: string; reason: string }[]
  ) {
    super(detail);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, "RESOURCE_NOT_FOUND", "Resource Not Found", `${resource} '${id}' was not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super(409, "RESOURCE_CONFLICT", "Conflict", detail);
  }
}
```

---

## Key Principles & Anti-Patterns Checklist

| Anti-Pattern to Avoid | Correct Standard |
| :--- | :--- |
| **Fat Controllers:** Writing business rules or database calls directly in `req, res` handlers. | Thin Controllers: Only parse HTTP, call Service, return status code. |
| **Leaky SQL in Services:** Concatenating SQL or calling `pool.query` inside `*.service.ts`. | Pure Services: Services call Repositories; Repositories isolate all SQL. |
| **Generic Errors:** Throwing `new Error("...")` or returning `{ error: "msg" }`. | RFC 9457: Throw typed `AppError` subclasses with status, code, and title. |
| **Unparameterized SQL:** Using string interpolation `` `WHERE id = '${id}'` ``. | Parameterized SQL: Always use `$1, $2, ...` to prevent SQL injection. |
| **Missing Transaction Scoping:** Running multi-step writes without `BEGIN ... COMMIT`. | Scoped Transactions: Wrap in `withTransaction` or `withTenantTransaction`. |
