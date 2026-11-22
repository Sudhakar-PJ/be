---
name: web-design-guidelines
description: Review and audit UI code against Vercel Web Interface Guidelines. Use when asked to "review my UI", "audit design", "check accessibility", "audit UI code", "lint my frontend", or "check site against interface guidelines".
---

# Web Interface Guidelines Auditor

Review frontend and UI code for strict compliance with Vercel Web Interface Guidelines.

## Triggering & Role Boundary

- **When to Trigger:** Trigger when auditing, linting, or reviewing UI components, templates, styles, or frontend pages for accessibility, polish, edge cases, interaction patterns, and performance flaws.
- **Distinction from Other Skills:**
  - `design-taste`: Art director deciding aesthetic style, typography hierarchies, and tactile depth.
  - `ui-engineering`: Architect structuring component lifecycles, state triads, and clean separation.
  - `web-design-guidelines`: **QA Auditor & Linter** running strict verification passes on code to catch micro-flaws and output terse `file:line` findings.
- **Hands-off Constraint:** When used alongside `tutor`, output findings and explain violations concisely in chat. Never directly alter user project source files.

---

## Audit Rules

### 1. Accessibility & Semantics
- **Icon Buttons:** Icon-only buttons must have an explicit `aria-label`.
- **Form Controls:** Every form control requires an associated `<label>` (via `htmlFor` or wrapping) or an `aria-label`.
- **Interactive Elements:** Non-native interactive elements must have keyboard listeners (`onKeyDown`/`onKeyUp`) and `tabIndex={0}`.
- **Semantic Tags:** Use `<button>` for actions, `<a>`/`<Link>` for navigation. Never use `<div onClick>` or `<span onClick>`.
- **Images:** All `<img>` tags must have an `alt` attribute (use `alt=""` for purely decorative images).
- **Decorative SVGs/Icons:** Must include `aria-hidden="true"`.
- **Async Updates:** Live regions, toasts, and dynamic error messages require `aria-live="polite"`.
- **Headings & Skip Links:** Maintain hierarchical `<h1>`–`<h6>` structure; provide a skip-to-content link for main content.
- **Anchor Offset:** Headings with anchor IDs must include `scroll-margin-top` to avoid hiding beneath fixed/sticky headers.
- **Media Support:** Media controls must be keyboard operable; meaningful video/audio requires captions/transcripts.

### 2. Focus States
- **Visible Rings:** Every interactive element must display a visible focus indicator: `focus-visible:ring-*` or equivalent custom outline.
- **Never Kill Outlines Bare:** Never use `outline-none` or `outline: none` without an explicit `:focus-visible` replacement.
- **`:focus-visible` Over `:focus`:** Prefer `:focus-visible` to prevent distracting focus rings on mouse click while preserving keyboard accessibility.
- **Compound Controls:** Use `:focus-within` on containers grouping multiple controls.
- **Sticky Occlusion:** Sticky headers, floating toolbars, and modals must never obscure a focused element.

### 3. Forms & Inputs
- **Autofill Attributes:** Inputs must have valid `autocomplete` attributes and descriptive `name` attributes.
- **Input Types & Modes:** Choose semantic `type` (`email`, `tel`, `url`, `number`) and appropriate `inputmode` (`numeric`, `decimal`).
- **Never Block Paste:** Never intercept `onPaste` with `preventDefault()` (e.g. on passwords, credit cards, MFA codes).
- **Hit Targets:** Checkbox/radio labels and controls must share a unified clickable hit target (no dead zone between box and label).
- **Spellcheck Disabling:** Explicitly set `spellCheck={false}` on email addresses, API keys, codes, and usernames.
- **Submit State:** Submit buttons stay enabled until submission begins; show a loading spinner and disable duplicate clicks during flight.
- **Inline Validation:** Render errors directly adjacent to invalid fields; automatically shift focus to the first invalid field upon submission failure.
- **Placeholder Formatting:** Placeholder text should end with an ellipsis (`…`) and demonstrate example input formats.
- **Unsaved Changes:** Warn users before navigating away from dirty forms (`beforeunload` or router transition guard).

### 4. Animation & Motion
- **Motion Reduction:** Strictly respect `prefers-reduced-motion` (provide simplified instant transitions or disable loops).
- **Compositor Properties:** Animate only `transform` and `opacity`. Never animate layout-triggering properties (`width`, `height`, `top`, `margin`, `padding`).
- **No Blanket Transitions:** Never write `transition: all`. Explicitly enumerate transitioned properties (e.g., `transition: opacity 150ms ease, transform 150ms ease`).
- **Transform Origin:** Set explicit `transform-origin`. On SVG transforms, place animations on a `<g>` wrapper with `transform-box: fill-box; transform-origin: center`.
- **Interruptible Motion:** Interactive animations must gracefully abort or reverse upon rapid user re-triggering without jumping.
- **Long-Running Animations:** Any autoplaying animation lasting >5 seconds must provide controls to pause, stop, or hide.

### 5. Typography & Punctuation
- **Ellipses:** Use Unicode horizontal ellipsis `…` (`&hellip;`), never three raw dots `...`.
- **Curly Quotes:** Prefer typographic curly quotes (`“`, `”`, `‘`, `’`) over dumb straight quotes in static copy.
- **Non-Breaking Spaces:** Use `&nbsp;` before units (`10&nbsp;MB`), keyboard shortcuts (`⌘&nbsp;K`), and compound brand names.
- **Tabular Figures:** Apply `font-variant-numeric: tabular-nums` or `tabular-nums` on tables, timers, counters, and comparison columns.
- **Heading Wrap:** Use `text-wrap: balance` or `text-wrap: pretty` on titles and headings to prevent orphaned words.

### 6. Content Handling & Defensive CSS
- **Text Truncation:** Text containers must specify `truncate`, `line-clamp-*`, or `break-words`.
- **Flex Child Shrink:** Flex children carrying text must include `min-w-0` to allow ellipsis truncation without breaking parent containers.
- **Empty States:** Guard against rendering blank boxes, broken borders, or orphaned separators when arrays or strings are empty.
- **User-Generated Content Bounds:** Verify layout resilience against zero-length strings, 1-character words, and 200-character unbroken strings.

### 7. Images & Media
- **Dimensions & CLS:** All `<img>` tags must include explicit `width` and `height` attributes or aspect-ratio wrappers to prevent layout shifts.
- **Lazy Loading:** Images below the fold must use `loading="lazy"`.
- **Critical Images:** Above-the-fold hero images must use `fetchpriority="high"` or `priority`.
- **Video Over GIFs:** Replace heavy animated GIFs with `<video autoplay muted loop playsinline>`; supply a poster image and respect reduced-motion.

### 8. Performance & DOM Discipline
- **List Virtualization:** Lists exceeding 50 items must be virtualized or use `content-visibility: auto`.
- **No Render-Phase Layout Thrashing:** Never read layout geometries (`getBoundingClientRect`, `offsetHeight`, `offsetWidth`, `scrollTop`) during React render cycles.
- **Input Control:** Prefer uncontrolled inputs with sensible defaults; ensure controlled input change handlers remain low-overhead per keystroke.
- **Asset Preconnects:** Add `<link rel="preconnect">` for CDN, font, and external asset origins.
- **Font Preloading:** Critical web fonts should be preloaded with `<link rel="preload" as="font" crossorigin>` and `font-display: swap`.

### 9. Navigation, History & URL State
- **URL Synchronization:** Synchronize filters, active tabs, search queries, pagination, and modal states into query parameters.
- **Native Link Semantics:** Always use `<a>` or framework `<Link>` components so middle-click, Cmd/Ctrl+click, and copy-link work natively.
- **Destructive Confirmations:** Destructive operations (deleting workspaces, revoking API keys) must require modal confirmation or an explicit undo window.

### 10. Touch & Mobile Interactions
- **Tap Delay:** Apply `touch-action: manipulation` to interactive controls to eliminate the mobile 300ms double-tap zoom delay.
- **Highlight Cleanliness:** Set `-webkit-tap-highlight-color: transparent` intentionally.
- **Scroll Chaining:** Modals, dialogs, drawers, and bottom sheets must declare `overscroll-behavior: contain`.
- **Drag Ergonomics:** During dragging actions, disable text selection and set `inert` on background siblings; ensure full keyboard/tap alternatives exist.
- **Cautious Autofocus:** Avoid `autoFocus` on mobile devices as it forcibly opens the software keyboard and displaces viewports.

### 11. Safe Areas & Layout
- **Notch Insets:** Full-bleed fixed/sticky layouts must respect `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, etc.
- **Container Overflow:** Prevent unexpected horizontal scrollbars with container-level `overflow-x: clip` or `overflow-x: hidden`.

### 12. Dark Mode & Theming
- **HTML Scheme:** Declare `color-scheme: dark` on `<html>` in dark themes to style native scrollbars, inputs, and form controls correctly.
- **Theme Color:** Match `<meta name="theme-color">` to the active page background.
- **Select Controls:** Native `<select>` elements in dark themes must explicitly set `background-color` and `color` to avoid white-on-white text in Windows/browser popups.

### 13. Localization & i18n
- **Intl APIs:** Format dates, relative times, currencies, and numbers using `Intl.DateTimeFormat` and `Intl.NumberFormat` instead of naive string concatenation.
- **Translation Shields:** Wrap brand names, code snippets, tokens, and untranslatable identifiers with `translate="no"`.

### 14. Hydration Safety
- **Controlled Symmetry:** Controlled inputs passing `value` must provide `onChange` (or switch to `defaultValue`).
- **Time Hydration:** Protect against client/server timestamp and timezone mismatches during hydration.

---

## Output Format

Review findings must be grouped by file and presented in concise, clickable `file:line` format:

```text
## src/components/CreateWorkspaceModal.tsx

src/components/CreateWorkspaceModal.tsx:42 - icon button missing aria-label
src/components/CreateWorkspaceModal.tsx:58 - input lacks associated <label> or aria-label
src/components/CreateWorkspaceModal.tsx:73 - onPaste has preventDefault() (paste-blocking anti-pattern)
src/components/CreateWorkspaceModal.tsx:89 - transition: all → enumerate specific transition properties
src/components/CreateWorkspaceModal.tsx:112 - flex child text container missing min-w-0 for truncation

## src/components/UserAvatar.tsx

✓ pass
```

State the issue and exact location. Keep commentary terse and actionable.

