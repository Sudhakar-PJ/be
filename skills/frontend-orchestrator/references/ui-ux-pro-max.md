---
name: ui-ux-pro-max
description: >-
  Comprehensive UI/UX design intelligence database inspired by NextLevelBuilder:
  color harmony matrices, font pairing formulas, enterprise table and filter
  UX patterns, dashboard metrics layout, and accessibility verification checklists.
---

# UI/UX Pro Max Design Intelligence (`ui-ux-pro-max`)

> **Pedagogical Mandate:** Governed by `tutor` ([skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)). Never write components or tokens directly into `01-saas-api/frontend/`. Provide the UX architecture, color harmonies, font choices, and layout code in chat. Explain user psychology and information architecture, and wait for PJ to type and test.

Inspired by **NextLevelBuilder's `ui-ux-pro-max`**.

---

## 1. Color Harmony Matrices & Token Formulas

### The 60-30-10 Rule in B2B SaaS (Semantic Tokens Only)
* **60% Dominant Base:** Structural canvas (`bg-background`).
* **30% Secondary Structure:** Card surfaces, sidebars, borders, inputs (`bg-card`, `bg-muted`, `border-border`).
* **10% Accent Intent:** Primary actions, active tab indicators, focus rings (`bg-primary`, `text-primary-foreground`, `ring-ring`). Never flood backgrounds with raw accent colors.

### Semantic Status Matrix (WCAG AA Compliant Tokens)
Never hardcode raw colors (e.g. `zinc`, `emerald`, `rose`). Map strictly to semantic design tokens:
* **Success / Completed:** (`text-success bg-success/10 border-success/20`).
* **Warning / In Progress:** (`text-warning bg-warning/10 border-warning/20`).
* **Error / Blocker / Failed:** (`text-destructive bg-destructive/10 border-destructive/20`).
* **Informational / Neutral:** (`text-muted-foreground bg-muted border-border`).

---

## 2. Font Pairing & Typography Hierarchy Matrix

| Role | Font Family Standard | Characteristics & Usage |
| :--- | :--- | :--- |
| **Primary UI / Body** | `Geist Sans`, `Inter`, `Plus Jakarta Sans` | High x-height, neutral geometric apertures, excellent legibility at 12px–14px. |
| **Monospace / Data** | `Geist Mono`, `JetBrains Mono` | Used for Task Keys (`PROJ-104`), UUIDs, hashes, timestamps, and currency/metrics. |
| **Display Headings** | `Geist Sans` or `Cal Sans` | Semi-bold/Bold, tight letter-spacing (`tracking-tight` / `-0.02em`). |

---

## 3. Enterprise UX Patterns (Jira/Linear Standards)

### A. High-Density Enterprise Data Tables
* **Sticky Column Headers:** Table headers (`<th>`) must stick to the top during scroll (`sticky top-0 bg-background/95 backdrop-blur z-10`).
* **Alignment Standards:**
  * Left-align: Text, names, task titles, status badges.
  * Right-align: Numeric amounts, timestamps, dates, action menus.
* **Row Hover & Selection:** Every row must feature an optical hover state (`hover:bg-muted/50 transition-colors cursor-pointer`).

### B. Filter Bar & Search Architecture
* **Immediate Filter Feedback:** Filters (Assignee, Status, Priority) must render active tags with a `1-click remove` cross icon.
* **Debounced Search:** Global task search must debounce keystrokes by `300ms` before querying the backend to avoid saturating PostgreSQL with partial queries.

### C. Modal & Drawer UX
* **Side Drawers for Task Details:** Never open a full-page reload to view a task. Use a sliding side-drawer (`max-w-xl`) so the user preserves their spatial context on the board.
* **Destructive Action Confirmation:** Deleting a task or workspace requires double-confirmation: type the name of the resource or hold a button for 2 seconds.

---

## 4. The 5-Point UX Sanity Checklist

Before presenting any UI solution to PJ, verify:
1. Is the visual hierarchy immediately obvious? (The eye goes: Page Title &rarr; Primary Metric / Action &rarr; Content).
2. Are all numbers and IDs monospaced to prevent tabular jitter?
3. Does every destructive action have a confirmation guard?
4. Are all interactive targets at least 32px &times; 32px (44px on mobile)?
5. Does the empty state provide a helpful button rather than a dead-end?

