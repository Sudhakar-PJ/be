---
name: frontend-assets
description: >-
  Standards for generating, prompting, optimizing, and placing AI-generated visual
  assets, 3D hero illustrations, icons, and responsive imagery for web and mobile
  layouts inspired by Leon's imagegen-frontend suite.
---

# Frontend Visual Assets & Image Generation (`frontend-assets`)

> **Pedagogical Mandate:** Governed by `tutor` ([skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)). Role: Senior Technical Mentor & Staff Architect. You must NEVER directly write, modify, or generate implementation files in the project workspace. Instead, teach the underlying theory, explain the architectural why, and provide complete, uncompressed, production-grade code snippets directly inside the chat interface so PJ reviews, types, and tests every file himself.
Inspired by **Leon’s `imagegen-frontend-web`** and **`imagegen-frontend-mobile`**.

---

## 1. Asset Generation & Prompting Standards (No Cheesy AI Visuals)

When generating or specifying hero images, feature illustrations, and 3D icons:

* **The Studio Clay / Glass Aesthetic:**  
  Avoid hyper-realistic photorealism or messy anime styles. Standardize on **minimalist 3D matte clay, frosted glass (glassmorphism), and subtle iridescent rim lighting**.
  * *Prompt Blueprint:*  
    `"Minimalist 3D isometric representation of [concept], matte porcelain clay material with frosted glass accents, subtle directional rim lighting on dark slate studio background, octane render, 8k, elegant composition, high contrast, clean negative space --no text, --no watermark"`

* **Color Palette Alignment:**  
  Asset colors must match our theme tokens:
  * Dark theme: Deep charcoal (`#09090b`), slate, with subtle emerald or sky blue illumination.
  * Light theme: Clean off-white studio background with soft diffuse shadows.

---

## 2. Aspect Ratio & Responsive Viewport Rules

| Placement | Aspect Ratio | Desktop Resolution | Mobile Resolution | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Background** | `16:9` or `21:9` | 1920 &times; 1080 | 800 &times; 1200 (`9:16` crop) | Fade into dark canvas via radial mask |
| **Feature Card Icon** | `1:1` | 512 &times; 512 | 256 &times; 256 | Centered or left-aligned floating badge |
| **Mobile App Preview** | `9:19.5` | 1170 &times; 2532 | 750 &times; 1624 | Phone mockup with perspective tilt |

---

## 3. Web Performance & Optimization Pipeline

Never ship raw 5MB PNGs to users:
1. **Next-Gen WebP/AVIF Format:** Always convert PNGs to `.webp` or `.avif` using `sharp` or `cwebp` (reduces payload by 80–90%).
2. **Radial Gradient Vignette / Alpha Masks:** Hero illustrations must fade smoothly into the background canvas using CSS masks to eliminate hard rectangle borders:
   ```tsx
   className="mask-radial-gradient [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]"
   ```
3. **Blur-Up Placeholders:** Always generate an inline 10px base64 blur hash placeholder to prevent layout shifts while high-resolution assets load asynchronously.
