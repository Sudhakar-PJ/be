---
name: skill-creator
description: >-
  Creates, adapts, and optimizes AI agent skills for Google Antigravity IDE.
  Converts external skills from Claude Code, Cursor, Codex, and skills.sh into
  native Antigravity skills, adjusting tool signatures and frontmatter. Use when
  authoring new skills or when given a direct skill URL or content.
---

# Skill Creator (Antigravity Adaptation Engine)

Use this skill when:
1. The user provides a direct link or URL to an external skill (e.g., from `skills.sh`, GitHub, Claude Code, or Cursor).
2. The `skill-finder` skill has discovered an external skill that needs conversion for Antigravity IDE.
3. The user wants to author a brand-new custom skill from scratch for this workspace.

Inspired by `anthropics/skills/skill-creator` on `skills.sh`.

---

## The Antigravity Skill Specification

In Google Antigravity, a skill lives in its own dedicated directory inside the workspace skills root (`skills/<skill-name>/`) and consists of:

```
skills/<skill-name>/
├── SKILL.md            # Required: Instructions, runbooks, and YAML frontmatter
├── scripts/            # Optional: Automated validation or execution scripts
├── examples/           # Optional: Code patterns and input/output samples
└── references/         # Optional: Supporting documentation and schema specs
```

### Frontmatter Schema Rules
The top of `SKILL.md` MUST contain a YAML frontmatter block with exactly two fields:

```yaml
---
name: kebab-case-name
description: >-
  Action-oriented summary explaining WHAT the skill does and strictly WHEN to
  activate it. Do NOT make descriptions overly generic to prevent false-positive triggers.
---
```

---

## The Cross-Agent Adaptation Matrix (Claude / Cursor ➔ Antigravity)

Most external skills on `skills.sh` are authored for Claude Code or Cursor. When adapting them, apply this systematic translation layer:

| External Agent Primitive (Claude / Cursor) | Antigravity IDE Native Equivalent | Adaptation Rule |
| :--- | :--- | :--- |
| `Bash(command: "...")` | `run_command` | Set `toolSummary` and use `WaitMsBeforeAsync`. Remember the terminal sandbox rules (sandboxed first). |
| `View(file: "...", offset: ...)` | `read_file` | Use `Path`, `StartLine`, and `EndLine`. |
| `Edit(file: "...", replace: ...)` | `edit_file` | Ensure `Target` has exact whitespace matching and `Replacement` is a drop-in replacement. |
| `Write(file: "...", content: ...)` | `write_file` | Use `Path`, `Content`, and `Overwrite: true`. |
| `Task(prompt: "...")` (Subagent) | `invoke_subagent` | Specify `TypeName` (`research`, `self`, `browser`), `Role`, and `Prompt`. |
| Multi-Agent Pipelines | `run_workflow` or `swarm` | Use Python workflow orchestration scripts or swarm message boards. |
| Custom UI / HTML previews | `generative_ui` | Inline interactive widgets and markdown artifacts. |
| `CLAUDE.md` / `.cursorrules` | `GEMINI.md` / Rule files | Convert persistent global constraints into rules. |

---

## The 5 Antigravity Porting Guardrails (Why Naive Ports Fail)

When external skills from Claude Code or Cursor are ported without adjustment, they often misbehave severely in Antigravity. Always enforce these 5 guardrails:

1. **Eliminate Imaginary Tool Names:**  
   External skills frequently tell the model: *"Use the Bash tool to run curl"* or *"Call the View tool"*. If left unedited, Antigravity attempts to call non-existent tools or hallucinates signatures. All references must be rewritten to Antigravity's native primitives (`run_command`, `read_file`, `write_file`, `edit_file`).

2. **Respect the Terminal Sandbox Boundary:**  
   In Claude Code, `Bash` assumes unrestrained host shell execution with full internet access. In Antigravity, `run_command` runs inside a **secure, isolated Linux container sandbox** with no direct network access by default. Never assume scripts can `curl` external APIs from the sandbox; use `search_web` for external lookups or keep operations local to the workspace.

3. **Prevent Description Trigger Explosion (Progressive Disclosure):**  
   In Antigravity, only the frontmatter `description` resides in memory until triggered. External skills often use vague descriptions like *"A helpful frontend skill"* or *"Assists with coding"*. This causes Antigravity to load the skill on every single message, polluting the context window and breaking unrelated tasks. **Descriptions must specify strict, unambiguous trigger conditions.**

4. **Honor the `tutor` Meta-Layer (Zero File Overwrite):**  
   Claude Code CLI skills often instruct: *"Immediately create the component in `src/Button.tsx`"*. In our workspace, this directly violates **Rule 1** and `tutor`. Every adapted skill must instruct the model to provide the complete code and terminal commands **in chat**, explaining the mechanics and waiting for the user to type and test.

5. **Strip Prompt Fluff & Philosophical Filler:**  
   External skills often contain thousands of tokens of vague "roleplay" (*"You are a legendary 10x designer whose soul yearns for beauty..."*). This degrades Gemini/Antigravity's instruction-following. Convert vague fluff into **deterministic rules, concrete negative constraints, and verifiable checklists**.

---

## Step-by-Step Skill Adaptation Workflow

### Step 1: Ingest Source Skill
* If given a URL (e.g. `https://raw.githubusercontent.com/.../SKILL.md` or `https://skills.sh/...`):
  * Fetch and read the raw Markdown contents using `search_web` or `run_command`.
* If handed off from `skill-finder`:
  * Parse the skill requirements and candidate text.

### Step 2: Clean & Modernize
1. **Strip Agent-Specific Artifacts:** Remove Claude-specific CLI flags, Cursor-specific `.mdc` frontmatter, or legacy commands that do not exist in Antigravity.
2. **Translate Tool References:** Replace any instructions instructing the model to call `Bash`, `Edit`, or `grep` with Antigravity tool equivalents.
3. **Optimize Frontmatter Description:** Ensure the description clearly states the trigger conditions so the Antigravity model auto-activates it at the right moment.

### Step 3: Write to Workspace Skills Directory
Write the adapted file into:
```text
/mnt/recovery/be/skills/<skill-name>/SKILL.md
```
*(If the skill includes helper scripts, place them in `/mnt/recovery/be/skills/<skill-name>/scripts/`)*.

### Step 4: Validate
1. Verify the YAML frontmatter syntax is valid and parses cleanly.
2. Verify all referenced file paths are absolute or relative to the workspace root.
3. Confirm the skill is visible in `/mnt/recovery/be/skills/`.

---

## Direct User Invocations

When a user says:
> *"Convert this skill for our project: [URL]"*

Immediately:
1. Fetch the remote `SKILL.md`.
2. Translate tools and frontmatter to Antigravity standards.
3. Create `/mnt/recovery/be/skills/<skill-name>/SKILL.md`.
4. Present a summary of what was converted to the user.

