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
| `tuckDepth` | tuck flap length | 2 to 500 | **UNVERIFIED** `min(0.6 x depth, 25, 0.9 x height)` |
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
- No perforation, no punched holes.
- Geometry resolution is 0.1 micrometre (offset grid).

---

# Crash-lock bottom carton (template `crash-lock-carton`)

Our own construction, derived from first principles and checked by the 3D fold. Top (tuck closure, tuck, top dust flaps), body, glue strip and all shared parameters are identical to the tuck-end carton above (no `variant`). The bottom replaces the bottom closure, tuck and dust flaps.

## Extra parameter

| Name | Meaning | Range | Default |
|---|---|---|---|
| `lockFlapTaper` | cut-back of each bottom side (lock) flap's free end | 0 or 0.01 to `W/2` | **UNVERIFIED** `min(3, 0.1 x depth)` |

Extra rules: `W <= L` (the two lock flaps, each `W/2` deep, meet from opposite sides); `2 x safeMargin < W/2` (bottom flaps are printable).

## Bottom layout (flat, below `y = H`)

- `front` and `back` each carry a **bottom flap** `L x W/2`. A **45 degree crease** runs from the hinge corner next to the following side panel to the free edge, splitting off a right-triangle **glue tab** (legs `W/2`). The tab crease folds **180 degrees**.
- `right` and `left` each carry a **lock flap** `W x W/2`, its far end cut back by `lockFlapTaper`. The edge between a lock flap and the preceding glue tab is a **slit** (cut on the continuation of the body crease). With taper 0, the edge between `lock-right` and `bottom-back` also becomes a slit.

## How it works (closed state)

1. Each tab folds onto its own bottom flap and is glued to the following lock flap, so `front + right` and `back + left` are two rigid glued halves.
2. The outer bottom flaps butt at the centre line `z = W/2`.
3. Each lock flap lies over the **other** half's outer flap. The halves hold each other shut: that is the lock.

## Invariants (in addition to the shared ones)

| Check | Expected |
|---|---|
| sheet height | `max(W + tuckDepth, dustFlapDepth) + H + W/2` |
| total crease length | see formula below |
| folded bottom flat | every bottom panel vertex on the bottom plane |
| bottom covered | union of outer + lock flaps = `L x W` |
| no overlap | front/back outer flaps do not overlap; lock flaps do not overlap |
| glue tab on lock flap | folded tab lies completely on its lock flap (area `(W/2)^2 / 2`) |
| lock engages | each lock flap overlaps the other half's outer flap (area > 0) |

Total crease length = body `4H` + top `L + (L - 2 x tuckSlitLength) + 2W` + bottom hinges `2L + 2W` + tab creases `2 x (W/2) x sqrt(2)`.

## Limits

- The 3D view animates every hinge at the same rate; the real erecting motion (both halves swinging in together as the tube squares) is not simulated. Only the closed state is checked.
- No interlocking hook or notch on the centre line; the lock is the overlap described above. Ask your printer whether they want a hook profile.
- Board thickness at the glued layers (three layers near each tab) is not compensated.

---

# Regular slotted container, FEFCO 0201 (template `slotted-box`)

Our own implementation of the public FEFCO 0201 structure (corrugated). Body and joint as above; `width` = major panel length `L`, `depth` = minor panel length `W`.

## Parameters

| Name | Meaning | Range | Default |
|---|---|---|---|
| `width`, `depth`, `height` | `L`, `W`, `H` | 10 to 2000 | required |
| `thickness` | board thickness | 0.5 to 15 | 3 |
| `sizeMode`, `allowanceFactor` | as for the tuck end | | |
| `bleed` / `safeMargin` | | 0 or 0.01 to 20 / 50 | 3 / 5 |
| `glueFlapWidth` | manufacturer's joint | 5 to 100 | **UNVERIFIED** `min(30, W)` |
| `glueFlapBevel` | joint end bevel | 0 to 50 | **UNVERIFIED** `min(5, 0.4 x joint, 0.1 x H)` |
| `slotWidth` | gap between neighbouring flaps, centred on the body crease | 0 or 0.01 to `< W/2` | **UNVERIFIED** `min(2 x thickness, W/4)` |

Rules: `W <= L` (minor flaps, each `W/2`, must not overlap); `2 x safeMargin < min(W/2, H)`.

## Layout

Each body panel carries a top and a bottom flap `W/2` deep, set in by `slotWidth/2` at both ends (so hinge = panel width minus one slot). Front/back flaps are the **major** (outer, printable) flaps; right/left the **minor** (inner) flaps. With `slotWidth = 0`, neighbouring flaps are separated by slits.

## Invariants (in addition to the shared ones)

| Check | Expected |
|---|---|
| sheet | `(joint + 2L + 2W) x (H + W)` |
| total crease length | `4H + 4L + 4W - 8 x slotWidth` |
| folded major flaps | far edges meet at the centre line `z = W/2` (top and bottom) |
| folded end flat | all flaps of each end on the end plane |
| end covered | union of the 4 flaps = `L x W - slotWidth^2` (four `s/2 x s/2` corner holes) |
| no overlap | majors do not overlap each other; minors do not overlap each other |

## Limits

- Slot ends are square; no rounded slot ends or score offsets for flute direction.
- Allowance is the simple per-dimension rule; real corrugated allowances differ by dimension and flute. Confirm with your converter.
