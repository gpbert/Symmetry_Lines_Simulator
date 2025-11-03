# Changelog

All notable changes to the 30cm Grid Simulator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] - 2025-11-03

### Added
- **Wall stretching**: Click and drag wall endpoints in Select mode to resize walls
  - Visual endpoint handles appear when hovering over walls
  - Constrained to wall's axis (horizontal stays horizontal, vertical stays vertical)
  - Snaps to 300mm grid
  - Real-time validation during stretching
  - Minimum length (400mm) enforced
  - Undo/redo support
  - Automatically restores original position if invalid

---

## [1.0.0] - 2025-11-03

### Added
- **Multi-level simulation**: Create and manage multiple building levels with independent wall placement
- **Level visualization**: 
  - "Show Levels Below" to ghost walls from lower levels with increasing transparency
  - "Show Levels Above" to show dashed outlines with faint grey fill for upper level walls
- **Interactive wall drawing**: Draw walls on a 30cm grid with real-time preview
  - Horizontal and vertical wall placement only
  - Grid snapping (always enabled)
  - Wall thickness options: 20cm or 30cm
  - Minimum wall length: 40cm
- **Wall flipping**: Flip wall orientation during drawing (Space key) or after placement (select wall + Space)
- **Selection and manipulation**:
  - Select single walls or multi-select with Shift+click
  - Move selected walls with drag-and-drop
  - Delete walls via Delete/Backspace keys or Delete mode
- **Undo/Redo system**: 
  - Ctrl/Cmd+Z to undo
  - Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo
  - Supports all operations (draw, move, delete, flip)
- **Canvas navigation**:
  - Pan with click and drag
  - Zoom with scroll wheel
  - Grid adjusts to viewport
- **Real-time validation**:
  - Dynamic restriction zones during wall drawing preview
  - Red pulsing effect on walls generating restriction zones
  - Green/red preview based on placement validity
  - Toast notifications for placement errors
- **Positional rules modal**: View the complete list of rules being enforced in the simulator
- **Feedback system**: Send feedback directly from the app via integrated form

### Rules Enforced
1. **Same-floor aligned walls**: Must share orientation and thickness; cannot overlap
2. **Cross-floor aligned walls**: Can be placed on same gridline with matching orientation/thickness
3. **Cross-floor overlapping walls**: Must share orientation and thickness
4. **Parallel wall distances**:
   - Same orientation: Minimum 60cm (column face to column face)
   - Opposite orientation facing each other: Minimum 120cm
   - Opposite orientation facing away: Minimum 60cm
   - Applies to both same-floor and consecutive levels
5. **Perpendicular walls**: No restrictions
6. **Column placement**: 10cm x 10cm columns at both ends of each wall, aligned to internal corner

### Technical
- Single-file HTML application with embedded CSS and JavaScript
- Canvas-based rendering with transformation matrix for pan/zoom
- Grid system: 30cm major grid with 10cm subdivisions
- Wall model: Internal face (blue line) grid-aligned, external face calculated
- Cross-floor validation with body overlap detection
- Floating-point tolerance (2mm) for distance comparisons
- History stack with 50-operation limit
