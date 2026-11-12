# Window holes

Customers cut window holes (rectangle, circle, heart...) into one panel of a box. Own design and own shape set; the
reference image the owner sent was only an idea of the feature, nothing of its layout or shapes is copied.

## Rules (decided with the owner)
- A window lies fully inside ONE panel, at least `WINDOW_MARGIN` (2 mm) from that panel's edges (cut edges and folds), at
  least `WINDOW_GAP` (2 mm) from every other window, and from holes the drawing already has; each side >= 3 mm.
  Crossing a fold or an edge is not allowed (first phase). The engine decides, never the UI.
- A window that breaks a rule is LEFT OUT of the geometry (the dieline stays valid) and reported with a reason.
  Saving is refused while any window is invalid (server checks again).
- Stored with the customer's project (`ProjectDoc.windows`), copied by "Save as". Templates themselves have none.

## Where it lives
| Concern | File |
|---|---|
| Shapes, rules, `applyWindows` | `packages/dieline-engine/src/windows.ts` (tests: `test/windows.test.ts`) |
| Result in the geometry | extra closed cut loops in `geo.cutLoops` (so SVG, PDF, DXF, thumbnails draw them as cut lines) + `Panel.holes` |
| 3D | `packages/model3d`: `THREE.Shape.holes` per panel + edge walls around each hole (test in `model3d.test.ts`) |
| Stored form | `packages/schema/src/index.ts` `windowSchema`, `ProjectDoc.windows` (optional, no migration) |
| Server | `apps/web/src/app/(app)/projects/actions.ts` (`readWindows`, `checkWindows`, create / update / save as), `server/export.ts` (exports apply them) |
| Editor view | `apps/web/src/components/dielines/window-editor.tsx`; opened from the bottom tool bar ("Window holes" button in `sheet-canvas.tsx`, badge = count); `workspace.tsx` swaps the whole body for it (same route), state `windows`, hidden form field `windows` |
| Artwork editor | `artwork-editor.tsx` applies the windows to its geometry (3D and export) |

## Editor
Shapes palette (click adds at the first spot the engine accepts, biggest panel first), sheet with move / resize
(8 handles, ratio lock) / rotate (Shift = 15 deg), arrow keys nudge, Delete, Ctrl+D duplicate, Ctrl+Z / Ctrl+Y, zoom;
right side: live 3D preview with the holes, Width / Height / X / Y / Turn in mm or in, Duplicate, Delete, the engine's
reason when a window does not fit. Cancel discards, Done keeps (disabled while a window is red); the project is saved with
the normal Save.

## Not done / ideas
- Windows across several panels, film behind the window, window on a stacked flap in 3D layer logic (works, not tuned).
- Windows keep their sheet position when the box size changes: one that no longer fits is left out and the save is refused.
- Drag from the palette onto the sheet (click only now). The editor's sheet picture has no artwork or watermark.
