---
name: motion-graphics
description: >-
  Provides programmatic timeline animation and motion graphics standards for
  GSAP, Framer Motion, and Remotion: deterministic keyframing, spring physics,
  frame-accurate rendering, and high-performance UI choreography.
---

# Programmatic Motion Graphics & Choreography (`motion-graphics`)

> **Pedagogical Mandate:** Governed by `tutor` ([skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)). Never write animation files directly into `01-saas-api/frontend/`. Provide the motion choreography, exact terminal commands, and complete animation code in the chat. Explain easing curves, spring physics, and timeline orchestration, and wait for PJ to type and test.

Inspired by **HeyGen’s `motion-graphics`** and **`remotion-to-hyperframes`**.

---

## The 4 Invariant Laws of UI Motion & Choreography

### 1. Purpose-Driven Motion Over Gratuitous Gimmicks
Every animation must communicate state or spatial hierarchy:
* **Entrances:** Elements enter in the direction they originate from (e.g., drawers slide from the right, modals scale up slightly from the center).
* **Exits:** Exits must always be faster than entrances (e.g. entrance = 250ms, exit = 150ms). Users are impatient when dismissing content.
* **Never Animate Layout Properties:** Never animate `width`, `height`, `top`, `left`, or `margin`. These trigger expensive browser reflows (layout recalculations) on every frame. **Always animate GPU-composited properties: `transform` (`translate`, `scale`, `rotate`) and `opacity`.**

### 2. Spring Physics Over Linear Easings
Real-world physical objects do not stop instantly like robotic linear transitions.
* Use spring physics with tuned damping and stiffness:
  * **Snappy UI Interaction:** `stiffness: 400, damping: 30` (Rapid, responsive, minimal overshoot).
  * **Gentle Modal Entrance:** `stiffness: 250, damping: 25` (Soft, elegant settling).
* For bezier curves, use standard cubic beziers: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out quint—fast start, gradual deceleration).

### 3. Orchestrated Staggers & Sequence Timing
When multiple items enter a screen simultaneously (e.g. a list of 10 tasks in a sprint):
* Never animate all 10 items at the exact same moment (creates a jarring flash).
* Never animate them with slow 100ms intervals (takes 1 second to render the list).
* **Use Micro-Staggers:** Stagger items by `20ms` to `40ms`:
  ```tsx
  // Framer Motion staggered list:
  const containerVariants = {
    show: {
      transition: {
        staggerChildren: 0.03, // 30ms between each task card
      },
    },
  };
  ```

### 4. Deterministic Frame-Accuracy (Remotion & Video Export)
When generating programmatic video or marketing demo captures:
* Do not rely on `setInterval` or wall-clock `Date.now()`.
* Base all animations strictly on the current frame index (`useCurrentFrame()` in Remotion):
  ```tsx
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  ```
* This ensures animations render with 100% deterministic reproducibility during server-side video generation.

---

## Respecting User Accessibility (`prefers-reduced-motion`)

Always respect the user's OS preference for reduced motion:
```tsx
// Automatically skip motion transitions if user requested reduced motion:
const prefersReducedMotion = useReducedMotion();
const transition = prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300 };
```

---

## Pedagogical Response Flow for Motion Tasks

When PJ wants to animate a UI component or build a motion sequence:
1. **Explain the Choreography:** Detail the timeline (timing, delays, easing curves, and physics values).
2. **Provide Shell Commands:** (e.g. `npm install framer-motion` or `npm install gsap`).
3. **Deliver Code in Chat:** Provide the clean, typed component with GPU-accelerated transforms.
4. **Explain the Physics:** Walk through the spring constants and bezier curves so PJ builds deep motion intuition.

