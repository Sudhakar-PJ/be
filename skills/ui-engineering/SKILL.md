---
name: ui-engineering
description: >-
  Enforces production-grade frontend UI engineering standards inspired by Addy
  Osmani: scalable component architecture, composition over configuration,
  strict edge-state handling (loading, empty, error, success), WCAG 2.1 AA
  accessibility compliance, performance budgets, and design token adherence for React/Next.js.
---

# Production Frontend UI Engineering (`ui-engineering`)

> **Pedagogical Mandate:** Governed by `tutor` ([skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)). Never write component files directly into `01-saas-api/frontend/`. Provide the architectural design, exact terminal commands, and complete production-grade TypeScript components in the chat. Explain what each hook and type does, and wait for PJ to type and test.

Complete uncompromised standards inspired by **Addy Osmani's `frontend-ui-engineering`**.

---

## 1. Component Scale & Composition Over Configuration
* **The 200-Line Rule:** No single React component file may exceed 200 lines of code. If a component approaches 200 lines, decompose it into smaller sub-components using **composition**.
* **Colocation:** Colocate related assets close to their consumer:
  ```text
  components/task-board/
  ├── task-board.tsx            # Main container/composition
  ├── task-card.tsx             # Presentational card component
  ├── task-card.test.tsx        # Automated tests
  ├── task-board.types.ts       # TypeScript interface contracts
  └── use-task-board.ts         # Custom state/query hook
  ```
* **Discriminated Union Props Over Mega-Props:** Reject components with 25 optional boolean props. Use typed discriminated unions so invalid prop states are mathematically impossible:
  ```tsx
  type TaskBadgeProps =
    | { variant: "status"; status: "TODO" | "IN_PROGRESS" | "DONE" }
    | { variant: "priority"; priority: "URGENT" | "HIGH" | "LOW" };
  ```

---

## 2. The Mandatory 4-State Lifecycle
Every data-driven component MUST explicitly implement and handle all four lifecycle states. Never render `null` or a blank screen:
1. **Loading State:** Render an animated Skeleton loader that mirrors the exact layout geometry of the loaded content (prevent Cumulative Layout Shift / CLS).
2. **Empty State:** When arrays are length `0`, display an illustrated/icon zero-state with a clear call-to-action (CTA) (e.g. *"No tasks in this sprint yet. [Create First Task]"*).
3. **Error State:** Wrap asynchronous surfaces in React Error Boundaries and show an actionable RFC 9457 error card with a **[Retry]** button.
4. **Success / Settled State:** The populated, interactive view.

---

## 3. Server State vs. Local UI State vs. URL State
Enforce strict separation across the three state layers:
* **Server Cache State (TanStack Query):** Remote database data (`/api/v1/tasks`, `/api/v1/tenants`). Never store server data in `useState` or global Redux stores. Rely on query keys (`['tenants', tenantId, 'tasks']`) and automatic cache invalidation.
* **URL State (`nuqs` / Next.js `useSearchParams`):** Search filters, active tab, pagination cursors, and sorting. If refreshing the page should preserve the view, it belongs in the URL query string.
* **Local UI State (`useState` / Zustand):** Ephemeral UI controls (e.g. is modal open, active dropdown, draft input before submit).

---

## 4. Performance Budgets & Code-Splitting
* **Heavy Module Lazy Loading:** Heavy client libraries (e.g., Three.js canvas, chart libraries like Recharts, Markdown editors) must NEVER be in the initial page bundle. Always lazy load via `next/dynamic` or `React.lazy()` with `ssr: false`:
  ```tsx
  const AnalyticsChart = dynamic(
    () => import('./analytics-chart').then(mod => mod.AnalyticsChart),
    { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
  );
  ```
* **React Hook Safety:** Ensure all `useEffect` and `useCallback` dependency arrays are exhaustive to prevent stale closures.

---

## 5. Accessibility (WCAG 2.1 AA Compliance)
* **Semantic HTML First:** Use `<button>`, `<dialog>`, `<nav>`, `<aside>`, `<main>`. Never use `<div onClick={...}>`.
* **Keyboard Navigability:** Every interactive element must be reachable and triggerable via `Tab`, `Enter`, and `Space`. Modals and drawers must trap focus and close on `Escape`.
* **Color Contrast:** Text and icons must have at least a `4.5:1` contrast ratio against their background (`3:1` for large text).
* **ARIA Attributes:** Use `aria-expanded`, `aria-haspopup`, `aria-live="polite"` for asynchronous updates.

---

## 6. Design Token Adherence (Zero Raw Hex Values)
* **No Inline Hex Values:** Reject `#3b82f6`, `#ffffff`, `#1e293b`.
* All colors, borders, radii, and shadows must resolve to semantic CSS variables or Tailwind utility tokens (`bg-card`, `text-card-foreground`, `border-border`, `rounded-md`).
