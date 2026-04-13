# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **Symmetry Line Simulator** (aka "30cm Grid Simulator") is a web-based tool for simulating and validating structural wall placement on a 300mm grid system. It enforces ZuruTech SDI manufacturing positional rules for walls, slabs, and structural elements.

## Running the Application

No build step or dependencies required for the main app. Open `index.html` directly in a browser.

The only npm dependency (`resend`) is for the serverless feedback API endpoint (`api/feedback.js`), which runs on Vercel.

## Architecture

This is a **single-file vanilla HTML/CSS/JavaScript application** with no framework or build tooling.

### `index.html` (~4300 lines)
The entire 2D simulator lives in one file containing inline CSS, HTML, and a single `<script>` block. Key sections:

- **Lines ~650-700**: Constants and global state (`GRID_SIZE_EXTERNAL`, `MM_TO_PX`, `walls[]`, `floors[]`, `currentFloor`, undo/redo history)
- **Lines ~700-900**: Toast notifications and undo/redo system
- **Lines ~890-1150**: Canvas setup, resize handling, coordinate conversion utilities (`mmToPx`, `pxToMm`, `snapToGrid`, `pxSnapToGrid`)
- **Lines ~1150-1340**: Grid drawing and restricted zone calculation/rendering
- **Lines ~1340-1940**: Building envelope detection (connected wall loop finding), slab system grouping (union-find), and preview wall slab system prediction
- **Lines ~1940-2090**: `isWallInRestrictedZone()` — core collision/proximity checking against parallel/opposite wall distance rules
- **Lines ~2090-2330**: Wall rendering (`drawWall`) and building envelope visualization
- **Lines ~2320-3030**: Main `draw()` function — orchestrates full canvas redraw including grid, zones, walls, preview, envelopes
- **Lines ~3030-3260**: Validation engine (`validateWall`, `validateAllWalls`) — checks all structural rules
- **Lines ~3290-4040**: Event listeners — mouse/keyboard handling for draw, select/move, delete, and wall stretching modes
- **Lines ~4040-4100**: UI update helpers (floor dropdown, mode buttons, info panel)

### Modular JS files (sim.js, renderer2d.js, renderer3d.js, interaction.js)
Refactored modules for simulation logic, 2D/3D rendering, and user interaction.

### `index3d.html` (~740 lines)
A separate Three.js-based 3D viewer (in progress).

## Development

Code changes are made **directly in this repo** — there is no VPS or remote deployment involved in development.

### `api/feedback.js`
Vercel serverless function using `resend` to email user feedback.

### `rules.txt`
Source document for the structural positional rules the simulator enforces.

## Key Domain Concepts

- **Wall model**: Defined by points A and B (internal/column face), a normal vector `n` (toward external face), direction vector `d`, height `h`, and thickness `t` (200mm or 300mm)
- **Grid strategy**: 300mm external grid for wall snapping, 100mm internal grid for steel column positioning
- **Restricted zones**: 600mm minimum between parallel same-orientation walls; 1200mm between opposite-facing parallel walls
- **Auto-segmentation**: Walls >6000mm are automatically split and share a `groupId`
- **Building envelopes**: Connected wall loops detected via graph traversal for slab system association
- **Slab systems**: Walls grouped by connectivity using union-find; validation rules apply within the same slab system

## Feature Toggles

The application has a **Feature Toggles** system accessible via a modal in the sidebar. Toggles are persisted in `localStorage` with `ft_` prefixed keys and stored at runtime in `state.featureToggles`.

**IMPORTANT:** All feature toggles MUST be maintained with each new implementation. When adding or modifying behavior that interacts with a toggled feature, ensure both the ON and OFF states work correctly. When adding a new optional UX behavior, add it as a feature toggle rather than a hardcoded default.

Current toggles:
- `envelopeShift` (`ft_envelopeShift`): Auto-shift walls near envelope zones. OFF by default. When ON, walls drawn parallel near an envelope are shifted sideways to clear the restriction zone. When OFF, the wall preview stops at the last valid position.

## Important Patterns

- All rendering uses HTML5 Canvas 2D context with manual coordinate transforms (mm-to-pixel conversion)
- Wall state is stored in a flat `walls[]` array; floors are managed via `floors[]` with `currentFloor` tracking
- Undo/redo stores full wall array snapshots (max 50 history entries)
- Validation runs on-demand, not continuously — triggered by user action
- The `draw()` function is called on every frame/interaction to fully redraw the canvas
