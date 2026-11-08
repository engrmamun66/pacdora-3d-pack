# Dieline math: tuck-end carton (template `tuck-end-carton`)

Units: millimetres. Sheet coordinates: x right, y DOWN (SVG convention). Origin of the sheet is the top-left corner of the bleed outline.

## Parameters

| Name | Meaning | Range | Default |
|---|---|---|---|
| `variant` | `straight` or `reverse` tuck end | enum | `straight` |
| `width` | front/back panel width (x) | 10 to 1000 | required |
| `depth` | side panel width | 10 to 1000 | required |
| `height` | body height | 10 to 1000 | required |
| `thickness` | board thickness | 0.05 to 5 | 0.5 |
| `sizeMode` | `manufacture` (crease-to-crease, used as given) or `inner` (inside size) | enum | `manufacture` |
| `allowanceFactor` | inner mode only: allowance = factor x thickness added to width, depth, height | 0 to 5 | **UNVERIFIED** `1` (inner mode) |
| `bleed` | bleed distance | 0 or 0.01 to 20 | 3 |
| `safeMargin` | inset of printable safe area | 0 or 0.01 to 20 | 3 |
| `glueFlapWidth` | glue flap width | 2 to 100 | **UNVERIFIED** `min(15, depth)` |
| `glueFlapBevel` | slant at glue flap ends | 0 to 50 | **UNVERIFIED** `min(3, 0.4 x glueFlapWidth)` |
| `tuckDepth` | tuck flap length | 2 to 500 | **UNVERIFIED** `min(0.6 x depth, 25)` |
| `tuckCornerCut` | radius (round) or chamfer size on the tuck flap's free corners | 0 to 50 | **UNVERIFIED** `min(4, tuckDepth / 3)` |
| `tuckCornerStyle` | `round` (true arcs) or `chamfer` | enum | `round` |
| `tuckSlitLength` | cut slit at each end of the tuck crease | 0 to 50 | 0 (no slits) |
| `dustFlapDepth` | dust flap length | 2 to 500 | **UNVERIFIED** `min(0.5 x depth, 0.4 x width)` |
| `dustFlapInset` | taper of dust flap free edge, each side | 0 to 100 | **UNVERIFIED** `min(3, 0.1 x depth)` |
| `dustFlapCornerRadius` | radius rounding the dust flap's free corners | 0 to 50 | **UNVERIFIED** `min(3, dustFlapDepth/4, (depth - 2 x inset)/4)` |

> **The UNVERIFIED defaults are placeholders chosen to give a plausible shape. They are not taken from any packaging standard.** The engine reports which ones were used (`unverifiedDefaultsUsed`). Confirm every one with your printer, or pass explicit values, before using output for production.

Effective dimensions: `L = width + k`, `W = depth + k`, `H = height + k`, with `k = allowanceFactor x thickness` in inner mode and `k = 0` in manufacture mode.

## Arc edges

Panel edges may be circular arcs, stored as a DXF-style **bulge** per edge (`tan(sweep/4)`, 0 = straight). Areas, bounds and lengths are computed exactly; SVG output uses true arc commands. Only cut edges may be curved: hinges and slits must be straight. Offsets (bleed, safe area) flatten arcs to 5 micrometres first.

## Layout (flat)

Body panels left to right: `[glue g][front L][right W][back L][left W]`, each `H` tall.

- Top closure `L x W` hangs from `back`'s top edge, then top tuck `L x tuckDepth` beyond it.
- Bottom closure and tuck hang from `back` (straight) or `front` (reverse).
- Dust flaps (hinge length `W`, depth `dustFlapDepth`) on top and bottom of `right` and `left`.
- Glue flap on the free left edge of `front`.

## Derived line types

An edge used by one panel is a **cut**; an edge shared by two panels must be a declared hinge and is a **crease**. Anything else (overlap, undeclared shared edge, hinge without an edge) throws. Bleed is the cut outline offset outward by `bleed` (mitered, via Clipper, so slits narrower than `2 x bleed` are bridged). Safe area is each printable panel inset by `safeMargin`.

## Closed-form invariants checked on every generation

| Check | Expected |
|---|---|
| sheet width | `g + 2L + 2W` |
| sheet height | `H + 2 x max(W + tuckDepth, dustFlapDepth)` |
| total crease length | `4H + 2L + 2(L - 2 x tuckSlitLength) + 4W` |
| sum of panel areas | equals area of outer cut loop (no overlaps, no gaps) |
| hinges | panels minus 1 (connected tree) |
| cut loops | exactly 1 |
| bleed bounds | cut bounds expanded by `bleed` on each side |
| bleed outline | single polygon, larger than cut outline |
| folded box size (3D, fully closed) | exactly `L x H x W`; every flap ends inside |
| folded side seam | last side panel's free edge meets the front panel's glue edge |
| folded lids | each closure's far edge lands on the opposite panel's top/bottom edge |
| folded print side | printed face of every body panel and closure points outward |

Cross-field rules (rejected as parameter errors): glue flap no wider than depth; tuck flap no longer than depth **and shorter than height** (found by the 3D fold check: a longer tuck sticks out of the closed box); dust flaps shorter than half the width; safe area must not vanish on any printable panel.

## Known limits (this is a spike, not production)

- Folding uses zero-thickness panels: flaps that rest against a panel are coincident with it (the 3D viewer separates them by 0.3 mm for display only). Tuck insertion clearance and collision during folding are not modelled.
- Thickness compensation is only the simple allowance above. A real rule must come from your printer.
- No perforation, no punched holes, no curved edges.
- Geometry resolution is 0.1 micrometre (offset grid).
