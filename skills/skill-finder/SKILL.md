---
name: skill-finder
description: >-
  Finds, searches, and evaluates AI agent skills across the open web, GitHub,
  independent developer repositories, community awesome-lists, and skills.sh
  when the user describes a skill or asks how to automate a capability.
  Automatically hands off found skills to workspace-skill-adapter for Antigravity adaptation.
---
> **Pedagogical Mandate:** Governed by `tutor` ([skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)). Role: Senior Technical Mentor & Staff Architect. You must NEVER directly write, modify, or generate implementation files in the project workspace. Instead, teach the underlying theory, explain the architectural why, and provide complete, uncompressed, production-grade code snippets directly inside the chat interface so PJ reviews, types, and tests every file himself.

# Skill Finder (Wide-Net Open-Source Discovery Engine)

Use this skill when the user asks to find, locate, discover, or recommend skills for coding agents (e.g., *"find a skill for security audits"*, *"is there a skill for docker profiling?"*, *"find a community skill to optimize postgres"*).

Inspired by `vercel-labs/skills/find-skills` on `skills.sh`, but expanded with a **wide-net open-source crawler** that searches independent developer repositories across GitHub and the broader web.

---

## Operating Workflow

When triggered, execute the following 5-step pipeline:

```
[ User Request ]
       │
       ▼
[ Step 1: Check Native IDE Primitives ]
  ├── Slash Commands (/grill-me, /plan, /boost, /learn, etc.)
  └── Built-in System Skills (builtin/skills/)
       │
       ├─► IF NATIVE CORE COMMAND: Suggest using native command immediately.
       │
       └─► IF CUSTOM / DOMAIN SKILL: Cast a Wide Net Across the Open-Source Ecosystem
              │
              ▼
[ Step 2: Query Analysis ] ──► [ Step 3: Wide-Net Search ] ──► [ Step 4: Quality Vetting ] ──► [ Step 5: workspace-skill-adapter Handoff ]
```

---

## Step 1: Check Antigravity Native Commands (Zero-Reinvention for Core Tools)

Before searching externally, verify if the request is an intrinsic IDE workflow command:
* **Interactive Design Interview / Plan Grilling:** `/grill-me`
* **Deep Architecture Planning:** `/plan`
* **Multi-Angle Rigorous Reasoning:** `/boost`
* **Autonomous Task Loop:** `/goal`
* **Live Chrome Web Driving:** `/browser`
* **Persistent Rule Teaching:** `/learn`
* **Cron & Timer Scheduling:** `/schedule` / `automation`
* **Multi-Agent Teams:** `/teamwork` / `/swarm`

*Rule:* If the user is looking for a core IDE behavior like grilling design decisions or deep planning, recommend the native slash command. For all **domain-specific, technical, framework, or architectural capabilities**, proceed immediately to wide-net community search.

---

## Step 2: Query Analysis & Search Keyword Expansion

Break the user's intent into 2–3 search variants, covering both formal terminology and open-source hacker naming:
* Example: *"Find a skill to audit express and postgres code for security flaws"*
  * Variant A: `"SKILL.md" express postgres security audit`
  * Variant B: `site:github.com in:path:skills security vulnerability owasp`
  * Variant C: `site:skills.sh security`

---

## Step 3: Wide-Net Open-Source Search

Do NOT restrict search to official corporate channels. The most efficient, high-impact skills are created by independent engineers, solo practitioners, and power users.

Execute parallel searches across multiple discovery surfaces:

### 1. GitHub Code & Repository Search (The Primary Goldmine)
Use `search_web` to hunt across GitHub for independent open-source authoring:
```text
site:github.com "SKILL.md" "<query>"
site:github.com in:path:skills "<query>"
site:github.com topic:agent-skills "<query>"
site:github.com topic:cursor-rules "<query>"
site:gist.github.com "SKILL.md" "<query>"
```

### 2. Community Aggregators & Registries
Search community-driven catalogs where engineers submit their skills:
```text
site:skills.sh "<query>"
site:agenticskills.io "<query>"
```

### 3. Community Curated "Awesome" Repositories
Search curated developer collections:
* `awesome-agent-skills`
* `awesome-claude-skills`
* `awesome-cursorrules`

### 4. Optional CLI Registry Query (if network permitted)
```bash
npx -y skills find "<query>"
```

---

## Step 4: Quality & Practicality Vetting

Independent skills range from brilliant production runbooks to low-effort prompts. Evaluate candidates on **practical software engineering depth**:

1. **Concrete Procedural Runbooks over Fluff:**  
   Reject skills that are just generic pep-talks (*"You are a 10x developer..."*). Favor skills that have **step-by-step algorithms, explicit edge-case checklists, and verifiable bash/code commands**.
2. **Community Validation:**  
   Check stars, forks, recent maintenance, and author credibility (e.g. active backend engineers, security researchers, framework contributors).
3. **Real-World Stack Alignment:**  
   Does the skill match our production standards (Raw SQL, strict TypeScript, no ORMs, RFC 9457 error details, Docker containerization)?

Present the top 1–2 discovered skills to the user:
* **Skill Name & GitHub / Registry Link:** Full URL to the repository or raw `SKILL.md`.
* **Author / Source:** (e.g. independent developer repo or community package).
* **Why it's effective:** The specific procedures, checklists, or commands it introduces.

---

## Step 5: Autonomous Handoff to `workspace-skill-adapter`

Most independent skills found on GitHub are written for Claude Code, Cursor, or raw LLM prompts.

Once the user approves or selects a candidate:
1. Retrieve the raw Markdown content or URL from the repository.
2. Hand off directly to **`workspace-skill-adapter`** to:
   - Translate all tool calls (`Bash` &rarr; `run_command`, `View` &rarr; `read_file`, `Edit` &rarr; `edit_file`).
   - Format standard Antigravity YAML frontmatter (`name`, `description`).
   - Save the finalized skill to `/mnt/recovery/be/skills/<skill-name>/SKILL.md`.
