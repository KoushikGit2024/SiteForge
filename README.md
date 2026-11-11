# SiteForge

> Architectural Webpage Deconstruction, CAD Blueprint Inspection & Clean Component Extraction.

SiteForge is a high-performance Google Chrome extension (Manifest V3) that deconstructs any live website into an architectural CAD blueprint, reveals spatial layouts through technical drafting animations, and allows developers to inspect layout metrics and export clean Tailwind CSS utility classes.

---

## Key Capabilities & Architecture

- **Architectural CAD Styling:** Dark technical navy canvas with subtle millimeter grid lines and crisp geometric vector lines. No emojis, no hyper-saturated neon glows, and no exaggerated pill roundness.
- **Procedural Web Audio Engine:** Produces original, event-specific cues with a shared Web Audio mixer and no external audio assets.
- **Specialized Engineering Roles:** Replaced personal names with functional architectural roles (`[Grid Architect]`, `[Layout Drafter]`, `[Dimension Lead]`, `[Metric Surveyor]`, etc.).
- **Tailwind CSS & Clean HTML Exporter:** Inspect a captured card, button, or container to copy computed-style Tailwind utility suggestions with its HTML.
- **Precision Rulers & Technical HUD:** A compact engineering telemetry bar with keyboard-accessible sound and export controls. Export mode lets you inspect a reconstructed layer and copy its Tailwind utilities and HTML.

---

## 🛠️ Build & Installation

### 1. Build

```bash
npm install
npm run build
```

### 2. Load in Chrome

1. Navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist` folder:
4. Visit any webpage and press **`Alt + Shift + B`** (or click the SiteForge icon).
