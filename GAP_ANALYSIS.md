# Gap Analysis: Table of Rules Document vs. Implementation

**Date:** 2026-03-25
**Source Document:** Table of Rules.docx (SDI-RB Positional Rules)

---

## IMPLEMENTED (fully or substantially)

| Rule | Status |
|------|--------|
| **Wall model** (A/B points, d/n vectors, h, t) | Implemented. Image 2 (wall diagram with A, B, d, n) matches code's `Wall` class |
| **Rule 1** - Same-floor: no overlap, aligned walls share orientation & thickness | Implemented in `validateWall()` and `isWallInRestrictedZone()` |
| **Rule 2** - Cross-floor: overlapping segments share orientation & thickness | Implemented for adjacent floors |
| **Rule 3a** - Parallel wall min distance: 600mm same-side, 1200mm opposite-facing | Implemented. Image 4 (distance decision tree diagram) logic matches code |
| **Rule 3b** - Perpendicular walls: no minimum distance | Implemented (`isPerpendicularTo` check skips validation) |
| **Rule 5 (partial)** - Min length 400mm, max 6000mm auto-segmentation | Min length enforced; auto-split for >6000mm walls exists |
| **Grid system** - 300mm external + 100mm internal | Implemented (this is the "Future Strategy" from the doc) |
| **Steel columns** - 10x10cm at wall ends on internal face | Implemented and rendered |
| **Floor planes** - Walls on multiple floors | Implemented with level management |
| **Building envelope detection** - Closed wall loop finding | Implemented via graph traversal |
| **Slab system grouping** - Union-find across floors | Implemented for envelope-based restriction toggling |

---

## NOT IMPLEMENTED

### 1. Wall height is not configurable (Structural Walls intro)

The document specifies height `h` ranges **2500mm to 3100mm in 100mm steps**. The code hardcodes `height = 2700` with no UI control or validation. There's no height dropdown/input and no validation that height is within the allowed range.

### 2. Wall length snapping to 600mm multiples (Structural Walls intro)

> "Walls can only snap their length to a 60cm grid"

Endpoints snap to the 300mm grid, so wall lengths are multiples of 300mm (e.g., 300, 600, 900...). The document requires lengths to be multiples of **600mm** only. Lengths like 300mm, 900mm, 1500mm, etc. are currently allowed but should be prohibited.

### 3. Rule 4 - Envelope connection angle validation (Structural Walls req 4)

> "Each Wall making up the envelope has its extremes connected with another Wall, either with a 90-degree or 270-degree angle (this excludes Blade Walls as a Product)."

Image 7 (the building envelope diagram) shows a legend distinguishing **90° = Open** and **270° = Closed** corner types with color coding. The code detects envelopes but does **NOT**:
- Validate that envelope wall connections are exactly 90° or 270°
- Reject/warn about "blade walls" (free-standing walls not forming part of an envelope)
- Visually distinguish open vs. closed corners

### 4. Rule 6 - Wall-Slab beam generation (Structural Walls req 6)

This is entirely unimplemented. The document states:

> When interfacing with a Slab, the Structural Wall generates a Beam:
> - At least as thick as the Wall, with 2 Rebars under the Steel Column
> - At least as long as the Wall, terminating on the Pod's Grid

Image 5 shows beam length vs wall length detail. Image 6 shows beam configuration for "Roof" vs "Roof Overhang" cases (beam alignment relative to Pod's Grid). Image 7 shows "BEAM" labels on all envelope edges. None of this beam generation, validation, or visualization exists in the code.

### 5. Rule 7 - Void interactions (Structural Walls req 7)

Entirely unimplemented. No concept of "Voids" exists in the code at all. The document specifies:
- **Internal walls**: Void can be 0mm from the non-column face
- **External walls**: Void can be 0mm from the column face, interrupting the Edge Beam and substituting with a prefab Beam

### 6. Slab Rule 1 - Pod's Grid lattice validation (Slab req 1)

> "The Pod's Grid must produce a lattice without any rectangle with sides less than 600mm. All influencing elements must combine into a consistent, gap-free grid."

Image 1 (Section 3) shows three grid layers:
- **Slab's Rebars' Grid** (100mm) - shown in code as internal grid
- **Pod's Grid** (cells of 600x600, 600x900, or 900x900mm) - **NOT computed or validated**
- **User's Grid** (300mm) - shown in code as external grid

The Pod's Grid computation/validation is completely absent. Walls, voids, and columns should divide the slab into cells that all meet the minimum 600mm cell dimension.

### 7. Slab Rule 2 - Edge Beams on slab perimeter (Slab req 2)

Not implemented. Two configurations required:
- **Matching a structural wall**: innermost Rebar on Pod's Grid
- **Free edge**: outermost Rebar on Pod's Grid

Image 6 shows the exact cross-section details of how beams align with the Pod's Grid for "Roof" and "Roof Overhang" scenarios.

### 8. Slab Rule 3 - Free edge minimum distances (Slab req 3)

> "Minimum distances for the Slab refer only to the free edges and are bound to the Pod Catalog."

Not implemented. No concept of free slab edges or minimum distance validation for them.

### 9. Slab Rule 4 - Virtual beam continuation (Slab req 4)

> "Every Beam that does not terminate with two convex corners has a virtual continuation in the Slab."

Not implemented. This would require beam generation (Rule 6) to be implemented first.

### 10. Columns (Columns section)

The document section is empty (just "-"), indicating it's TBD. The code has no standalone column support — only wall-embedded steel columns.

---

## Summary by Priority

| Priority | Gap | Complexity |
|----------|-----|-----------|
| **High** | Wall height configurability (2500-3100mm) | Low |
| **High** | Wall length must be multiples of 600mm | Low |
| **High** | Rule 4: Envelope angle validation (90°/270° only, no blade walls) | Medium |
| **High** | Rule 6: Beam generation at wall-slab interface | High |
| **Medium** | Slab Rule 1: Pod's Grid computation & 600mm min cell validation | High |
| **Medium** | Slab Rule 2: Edge beam configurations | High |
| **Medium** | Rule 7: Void support and interaction rules | High |
| **Low** | Slab Rule 3: Free edge min distances | Medium |
| **Low** | Slab Rule 4: Virtual beam continuation | Medium |
| **N/A** | Columns (document says TBD) | Unknown |

The **wall-specific rules (1-3, 5)** are well-implemented. The major gaps are in **slab-related systems** (Pod's Grid, beams, edge beams, voids) and the **envelope angle validation**. The two quick wins are wall height configurability and 600mm length snapping.
