# Board thickness: how it works end to end

Single reference for what the board thickness (and the material picked from it) does to an imported dieline,
its flat sheet, its cut corners and the 3D box. Read this before changing any of it. If you change a rule,
change the rule here, the code and the tests together.

Related: `docs/thickness.md` (the list of materials and their thicknesses), `docs/PLAN.md` (log).

## 1. The rules (must stay true)

1. **The drawing's own thickness `t0`.** `construction.thickness` of the fold setup (default 0.5 mm) is the board the
   SVG was drawn for. At `thickness == t0` the generated dieline is identical to the drawing (tests check this).
2. **Box sizes follow the thickness, in both size modes.** A size the customer left empty (auto) is
   `drawn size + allowanceFactor x (thickness - t0)` for each of width, depth and height (and for a lid that follows
   the body, through the body). The inside of the box stays the same. A size the customer TYPED is taken literally
   (crease-to-crease in Manufacture mode, the inside in Inner mode).
3. **Cut slots follow the thickness.** At each cut corner of a dust flap the slot is
   `cutGapFactor x (thickness - t0)` wider than drawn (a drawn slot can narrow to nothing; a corner with no drawn
   slot gets none at `t0`). Only the flap's corner moves. No box size changes. `cutGapFactor` default 1; 0 switches it off.
4. **One map for everything.** Panels, hinges, the cut outline and the fold lines of the dieline all come from the
   same mapping, so panels still share exactly the same edges. Every hinge segment must lie on one edge of its parent
   AND of its child polygon (a test checks this; `foldTree()` throws otherwise).
5. **No box settings, no effect.** A template without box settings (flat only, no fold, or the three sizes not
   found) keeps its drawing: the thickness only names the material.
6. **3D: the dieline is the INSIDE face of the board.** Folds turn about it (the engine folds every child toward +z,
   the unprinted side), the board grows from it toward the printed side (-z), the closed box is exactly
   `2 x thickness` larger each way than the zero-thickness box, and `model.size` includes the board.
7. **3D: outside folds are rounded** with radius = thickness; stacked inner flaps (glue, tuck, dust, lock) keep a
   flat seam. Two panels never go into each other at a corner.
8. **Watermark**: the admin watermark (when enabled and the viewer is not exempt) is drawn on the outside AND the
   inside of the 3D box, readable from both sides.

## 2. Where it lives

| Concern | File | Notes |
|---|---|---|
| `t0`, defaults, size solving | `packages/dieline-engine/src/templates/imported-construction.ts` | `CONSTRUCTION_DEFAULTS`, `sizeTargets` (`solve`: auto size shift; `slotDelta`), `creaseSizesOf` (reads `slotDelta` and the shown sizes back from resolved `params`) |
| Slots: detection and editing | `.../imported-resize.ts` | `Slot`, `findSlots`, `slotEdits`, `PartSizes.slotDelta`, `SLOT_MAX`, `SLOT_ROLES` |
| Applying it | `.../imported.ts` | `slotEdits(plan, sizes, map)` used for cut loops, fold lines (`segs(..., true)`), panel polygons, hinges; resolved `params` carry `thickness`, `sizeMode`, `allowanceFactor`, `cutGapFactor`, `slotDelta`; the "Cut gap" check |
| 3D board | `packages/model3d/src/index.ts` | `thickness` and `insideTexture` options, `addRoundedFolds`, layer offset, `size + 2t` |
| 3D view props | `apps/web/src/components/viewer3d/carton-view.tsx` | `thickness`, `watermark`, `boardGrain`; `boardPictures`, `paintGrain`; picture cache (`wm`) so the fold slider does not redraw them |
| Dieline page | `components/dielines/workspace.tsx`, `side-cards.tsx` (`FoldPreview`), `settings-fields.tsx` (`ThicknessField` help) | thickness passed as `bt` from the resolved params |
| Watermark drawing | `apps/web/src/lib/watermark-canvas.ts` | `mirrorText`: the inside picture flips each text vertically (do not "fix" it to horizontal) |
| Admin help | `components/templates-admin/construction-editor.tsx` | Cut gap help text |

## 3. Cut corners (slots): detection and algorithm

A flap gets a slot at a hinge end when ALL of these hold:
- its role is `dust-flap` or `tuck`, AND it is a leaf (nothing hangs from it): a panel that carries flaps of its
  own is a wall or a closure. (Imported templates often label every flap `tuck`, so roles alone cannot tell.)
- the hinge end lies at the end of the edge of the panel it hangs from (`m == e`) and another panel touches the
  flap's corner there, OR it stops short of that end by at most `SLOT_MAX` (10 mm, imported units) (a drawn strip).

Editing (`slotEdits`) cannot be a stretch of the sheet: the flap's corner and the closure's corner can be the very
same point of the drawing, and a pointwise map sends one input point to one output point. So:
- flap polygon (and, for a drawn strip, its parent's vertex at the hinge end), the hinge end: moved to the pulled-back corner;
- cut outline: that vertex becomes two (the closure keeps its corner, the flap's edge gets its own), the order
  decided by which neighbour is the flap's own edge (`Slot.side`);
- fold lines: one that ends at the corner ends at the new place; one that runs through is cut in two.
- d is clamped: a drawn strip cannot go below 0, the flap keeps at least a fifth of its hinge.

## 4. 3D rules in detail

- Board direction: printed face is -z (`PRINTED_NORMAL`). Outside mesh at z = -t, inside mesh at z = 0, walls between.
- Stacked flaps (layer > 0) are pushed toward the box centre along their normal by
  `layerGap x layer + t x (layer - 1)`, plus one more `t` when their printed face looks away from the centre.
- Rounded fold: a strip of radius t about the hinge line (on the inside face) from the parent's printed normal to the
  child's, plus sector caps at both ends; skipped for hinges whose panels are stacked flaps, and for tiny angles.
- Pictures: outside = artwork (or board colour) + board grain + watermark; inside = inside colour + grain + flipped watermark.

## 5. Tests that guard it (keep them green, extend them when a rule changes)

- `packages/dieline-engine/test/imported-construction.test.ts`: manufacture mode follows the thickness; back at `t0`
  the sheet is as drawn; typed sizes stay literal; slots open by about `cutGapFactor x extra` and the hinges still lie
  on their panels' edges.
- `packages/dieline-engine/test/imported-parts.test.ts`: box settings follow the board, flat-only keeps its drawing,
  out-of-range board is rejected.
- `packages/model3d/test/model3d.test.ts`: closed box is exactly 2t larger each way (nothing pokes out or sinks in),
  rounded fold strips exist, edge walls exist.
- Not covered by a unit test: a corner with NO drawn slot (the zero-gap case, e.g. template `ttttt`). Check it in the
  browser (below) after any change to `findSlots` / `slotEdits`.

## 6. How to check it in the browser

Dieline page of a folded template (e.g. `/template/dieline/ttttt`, `/template/dieline/test-cookie`). Thickness is
locked for fixed grades: open the material menu, pick family "Corrugated board" then the grade "Custom corrugated
board", then type the thickness. Compare 0.5 mm (= drawn) and 3 mm: the "Flat sheet" size grows, the auto sizes
(placeholders) move, every flap corner next to a closure opens a slot, and the 3D tab shows a thick board with rounded
folds and no overlaps. The page console must stay clean.

## 7. Not done / decisions

- Decided by the owner: slot gap = thickness (not a corner clearance).
- Not built: an admin tool to mark cut corners by hand (offered if some drawing is not detected). Reference lines
  (`scaleImportedPaths`) do not follow the slot notches. Glue and lock flaps get no slot. Two leaf flaps meeting at one
  point each pull back by the full amount (gap = 2 x). A flap corner next to a plain wall gets a notch too (usual relief).
  Lids/extra pieces use the same detection per piece but have no dedicated test.
- "Sheet width" is the width at the drawn thickness; the "Flat sheet" line shows the real sheet.
- Planned: customer image, logo and artwork on the 3D box go through the same `texture` + `textureRect` path
  (artwork under the watermark). Lighting, soft shadows, slits and rounded tuck shapes of the reference 3D are not done.

## 8. Mistakes already made (do not repeat)

- Treating "thickness has no effect in Manufacture mode" as final: the owner wants the dieline and the 3D to follow it.
- Putting the fold axis on the printed face (boards then overlap at corners): the axis is the inside face.
- Counting a panel with its own flaps as a flap, and using `find()` (first match) when two flaps meet at a point.
- Leaving the parent's vertex at a moved hinge end (the hinge then no longer lies on one edge of the parent).
- Forgetting `+2t` in `model.size` (the box sinks into the floor), and rebuilding the watermark pictures on every
  fold-slider tick (slow).
- Flipping inside watermark text horizontally (it must be vertical, checked on screen).
