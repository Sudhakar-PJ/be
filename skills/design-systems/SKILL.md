---
name: design-systems
description: Theme registry & aesthetic style selector containing 67 design systems (enterprise, shadcn, bento, minimal, neobrutalism, glassmorphism, claymorphism, etc.). Use when asked to "apply a UI theme", "switch aesthetic", "use enterprise/shadcn/bento style", or choose a visual design preset.
---

# Design Systems Theme Registry (67 Curated Aesthetics)

A comprehensive, uncompressed registry of 67 complete design system specifications derived from TypeUI and curated for agentic development.

## How This Skill Operates

When the user asks to style a component, page, or dashboard with a specific visual theme (or when selecting a design system for a project feature):

1. **Locate the Target Theme:** Check the directory at `skills/design-systems/<theme-slug>/`.
2. **Read Full Theme Specifications:**
   - Read `skills/design-systems/<theme-slug>/SKILL.md` for AI implementation rules, exact color tokens, typography scales, spacing grids, and component anatomy.
   - Read `skills/design-systems/<theme-slug>/DESIGN.md` for human design intent, layout hierarchy, and visual rationale.
3. **Apply Tokens Strictly:** Use the exact font families, border radii, hex color tokens, and shadow treatments defined in that theme's files.
4. **Pedagogical & Structural Compliance:**
   - **With `tutor`:** Provide theme tokens, Tailwind classes, or CSS variables directly in chat; guide the user interactively without auto-writing code into project files.
   - **With `ui-engineering`:** Maintain strict component bounds (<200 lines, 4-state lifecycle, state triad).
   - **With `web-design-guidelines`:** Ensure colors pass WCAG 2.1/2.2 AA contrast ratios and preserve accessibility standards.

---

## Complete Catalog of 67 Available Design Systems

### 1. Enterprise, SaaS & Productivity (Primary Project Stack)
| Slug | Aesthetic Mood | Primary Fonts | Key Color Tokens | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| **`enterprise`** | Cloud-platform dark theme, Heroku/Vercel/GitHub feel, modular data grids, glass panels | IBM Plex Sans | Primary `#0C5CAB`, Surface `#09090b`, Text `#fafafa` | Complex B2B SaaS, Admin portals, Observability dashboards |
| **`shadcn`** | Minimal, clean, monochrome Radix utility-first UI | Geist / Fira Code | Primary `#000000`, Surface `#FFFFFF`, Text `#111827` | Clean productivity apps, modern developer tooling |
| **`bento`** | Modern bento-box grid layouts, content compartmentalization | Inter / Inter Display | Surface contrasts, subtle rounded borders | Analytics overviews, feature showcase grids |
| **`clean`** | High-clarity, distraction-free minimalist interface | Inter / System | Crisp whites, neutral grays, focused accents | Productivity flows, distraction-free document views |
| **`minimal`** | Monochrome elegance, generous whitespace, zero visual clutter | Geist / Helvetica | Deep blacks, stark whites, minimal borders | Typography-heavy products, note-taking apps |
| **`corporate`** | Trustworthy, polished enterprise structure | Inter / Roboto | Corporate blues, crisp slate neutrals | Financial portals, compliance dashboards |
| **`modern`** | Contemporary balanced digital product design | Plus Jakarta Sans | Modern blues, clean zinc neutrals | Customer-facing SaaS web applications |
| **`professional`** | Crisp, authoritative, structured data presentation | Inter / Source Sans | Deep navy, slate grays, clear indicator badges | Executive dashboards, reporting engines |

### 2. High-Craft Visual Trends & Modern Aesthetics
| Slug | Aesthetic Mood | Primary Fonts | Key Tokens / Style Features |
| :--- | :--- | :--- | :--- |
| **`glassmorphism`** | Frosted glass backdrops, subtle translucency, luminous borders | Plus Jakarta Sans | `backdrop-blur-md`, subtle 1px white/alpha borders |
| **`claymorphism`** | Soft 3D tactile buttons, inflated surfaces, friendly depth | Poppins / Nunito | Dual inner/outer soft drop shadows, rounded corners |
| **`neobrutalism`** | High-contrast black outlines, brutalist drop-shadows, raw vitality | Space Grotesk | Heavy 2px-3px solid borders, offset hard shadows (`box-shadow: 4px 4px 0 #000`) |
| **`brutalism`** | Raw, unpolished, stark monochromatic industrial design | Archivo / Mono | Pure black/white contrast, raw structural gridlines |
| **`gradient`** | Rich, vivid multi-stop background meshes and glowing accents | Inter Display | Radial glow layers, vibrant mesh accents |
| **`contemporary`** | Modern editorial layout mixed with sleek digital components | General Sans | Asymmetric grids, refined type hierarchies |
| **`sleek`** | Ultra-refined dark mode, razor-sharp borders, metallic sheen | Inter | Micro-borders, high-contrast monochrome highlights |
| **`refined`** | Luxury-tier restraint, subtle lighting, understated elegance | Editorial New / Inter | Soft ambient lighting, subtle micro-interactions |

### 3. Bold, Vibrant & Creative Flavors
| Slug | Focus & Characteristics |
| :--- | :--- |
| **`bold`** | High-impact typography, saturated contrast accents, commanding visual presence. |
| **`colorful`** | Dynamic multi-hue palettes, playful chromatic categorization, engaging visual energy. |
| **`vibrant`** | Radiant, energetic color ramps paired with punchy modern typography. |
| **`creative`** | Expressive layout arrangements breaking traditional container grids. |
| **`expressive`** | Dynamic component sizing, emotive color tokens, and lively visual pacing. |
| **`cosmic`** | Deep nebula blacks, starfield glowing borders, futuristic purples and blues. |
| **`futuristic`** | Sci-fi HUD geometry, glowing cyan/magenta accents, angular component chamfers. |
| **`immersive`** | Full-bleed interactive visual environments, sensory depth, layered backgrounds. |

### 4. Editorial, Storytelling & Typography-First
| Slug | Focus & Characteristics |
| :--- | :--- |
| **`editorial`** | Magazine-style multi-column grids, drop caps, refined serif headings, high readability. |
| **`storytelling`** | Narrative-driven pacing, expansive hero stages, progressive content reveals. |
| **`fiction`** | Atmospheric typography, immersive narrative layout blocks, thematic accent colors. |
| **`fantasy`** | Parchment-inspired tones, ornate borders, classic typographic flourishes. |
| **`paper`** | Tactile print-mimicking textures, subtle grain, warm off-white surfaces (`#FDFBF7`). |
| **`riso`** | Risograph print aesthetics, overlapping spot colors, halftone grain, screen-print charm. |
| **`terracotta`** | Earthy Mediterranean warmth, warm clay, burnt orange, and organic stone palettes. |
| **`cafe`** | Warm artisanal coffee tones, rich espresso browns, creamy oat surfaces, cozy vibes. |

### 5. Retro, Nostalgic & Gaming
| Slug | Focus & Characteristics |
| :--- | :--- |
| **`retro`** | 80s/90s nostalgia, vintage colorways, subtle phosphor glow, warm analog tones. |
| **`vintage`** | Timeless heritage aesthetics, muted sepia tones, classic serif headlines. |
| **`dithered`** | 1-bit / 2-bit pixel dithering patterns, retro bitmap texture fills. |
| **`matrix`** | Phosphor green on true black, digital rain accents, monospace data streaming. |
| **`sega`** | 16-bit arcade vibrancy, high-energy blues and magentas, dynamic slant angles. |
| **`tetris`** | Geometric block modularity, distinct primary block coloring, playful rigid grids. |
| **`pacman`** | Retro arcade maze geometry, vibrant yellow accents on deep maze black. |
| **`mono`** | Pure terminal monospace engineering, strict ASCII-friendly layouts, code-first UI. |

### 6. Additional Distinct Frameworks & Aesthetics
- **`agentic`**: Interfaces optimized for autonomous AI agent monitoring and interactive steering.
- **`ant`**: Ant Design inspired dense enterprise tables and robust form controls.
- **`artistic`**: Canvas-like fluid surfaces with expressive artistic accents.
- **`basic`**: Bare-essential skeleton primitives ready for custom skinning.
- **`claude`**: Warm, thoughtful, parchment-neutral assistant style (Anthropic warmth).
- **`codex`**: High-density developer-centric layout, terminal aesthetics, code focus.
- **`doodle`**: Hand-drawn sketchy borders, organic imperfect outlines, friendly personality.
- **`dramatic`**: Cinematic high-contrast chiaroscuro lighting, deep shadows, theatrical focus.
- **`flat`**: Modern flat design 2.0 with crisp vector clarity and zero false depth.
- **`friendly`**: Rounded pill shapes, approachable pastel palettes, welcoming tone.
- **`geometric`**: Strict mathematical symmetry, sharp angles, polygon-inspired layout cards.
- **`impeccable`**: Pixel-perfect alignment, micro-detail craftsmanship, meticulous polish.
- **`levels`**: Gamified progression trackers, XP bars, tier badges, milestone UI.
- **`lingo`**: Conversational UI, floating chat bubbles, language-learning interfaces.
- **`material`**: Material Design 3 elevation system, dynamic tonal palettes, ripple feedback.
- **`neon`**: Cyberpunk glowing borders, dark alley backdrops, luminous electric strokes.
- **`neumorphism`**: Soft extruded plastic surfaces, dual directional soft bevels.
- **`perspective`**: Isometric 3D tilted surfaces, layered orthographic projection.
- **`power`**: High-intensity sports/performance UI, bold italic typography, speed angles.
- **`premium`**: High-end luxury luxury branding, gold/champagne accents, deep obsidian.
- **`pulse`**: Live telemetry, heartbeat activity graphs, real-time pulse animations.
- **`roku`**: TV/10-foot UI ergonomics, oversized navigation focus states, couch-friendly sizing.
- **`sketch`**: Wireframe pencil-style draft aesthetics for early ideation.
- **`skeumorphism`**: Realistic physical materials (brushed metal, leather, glass dials).
- **`spacious`**: Ultra-wide breathing room, oversized margins, uncluttered executive glanceability.
- **`square`**: Sharp 90-degree corners, strict rigid box grids, zero border-radius.
- **`stitch`**: Textile-inspired dashed borders, fabric textures, handcrafted stitch details.

---

## How to Switch Themes in Practice

When working with PJ:

```markdown
User: "Let's build the workspace activity dashboard using the bento theme."
Agent:
1. Opens `skills/design-systems/bento/SKILL.md` and `DESIGN.md`.
2. Adopts bento modular grid ratios, rounded borders, and subtle contrast surfaces.
3. Implements the components using `ui-engineering` architecture and `tutor` active-coding rules.
```

