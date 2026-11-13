# Window holes

Customers cut window holes (rectangle, circle, heart...) into one panel of a box. Own design and own shape set; the
reference image the owner sent was only an idea of the feature, nothing of its layout or shapes is copied.

## Rules (decided with the owner)
- A window lies fully inside ONE panel, at least `WINDOW_MARGIN` (2 mm) from that panel's edges (cut edges and folds), at
  least `WINDOW_GAP` (2 mm) from every other window, and from holes the drawing already has; each side >= 3 mm.
  Crossing a fold or an edge is not allowed (first phase). The engine decides, never the UI.
- A window that breaks a rule is LEFT OUT of the geometry (the dieline stays valid) and reported with a reason.
  Saving is refused while any window is invalid (server checks again).
- Stored with the customer's project (`ProjectDoc.windows`), copied by "Save as".
- An admin can also give a template **default windows** (`Template.windows`, JSON, nullable). New projects from the template start with them (`initialWindows` on the template page); customers can move, resize, delete them or add more. SVG templates: the "Window holes" button in the 3D fold editor (edit page and create wizard); built-in templates have no fold editor, so they keep the "Window holes" section (`sec-windows`) on the edit page. They are saved with the main Save and re-checked on the server against the dieline at its starting size (`windowsProblem` in `doraadmin/template-actions.ts`). They need panels: a built-in template, or an SVG template with a 3D fold (without a fold they are cleared). UI: `components/templates-admin/template-windows-field.tsx` (list, picture, full-screen `WindowEditor`). The 3D fold editor also has a "Window holes" button (rightmost of the fold editor's buttons) that opens the same editor; the holes are cut into its 3D preview. Both open the editor through `window-editor-modal.tsx` (slide-up / slide-down, same motion as the customer page). The fold editor builds its preview with `importedStartParams`, the same starting size the windows are placed and checked on.

## Where it lives
| Concern | File |
|---|---|
| Rules, `applyWindows` | `packages/dieline-engine/src/windows.ts` (tests: `test/windows.test.ts`) |
| Shape library (66 shapes) | `packages/dieline-engine/src/window-shapes.ts`: one table `SHAPE_DEFS`, groups "Basic Shapes" (16) and "More Shapes" (50) |
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

## Where the template's holes show
Besides the customer page, the 3D fold editor preview and the editor itself, the admin "Starting 3D view" editor (edit page section and the camera icon on the template list) cuts the template's window holes into its box, so the camera and the saved product image are taken with the holes. `loadTemplateViewData` sends the saved `windows`; the edit page passes its live (maybe unsaved) holes to override them. That editor builds the box with `importedStartParams`, the same starting size the holes are placed on.

## Shape palette
Each group title ("Basic Shapes", "More Shapes") is a bar with the same background (`bg-muted`) and radius (`rounded-lg`); the shapes under it have no card around them. A search box sits above all of them and stays at the top while the palette scrolls: it matches shape names and ids (and a group title shows the whole group), hides empty groups, shows "No shape matches", Enter adds the only match, Escape clears. It is disabled in the 3D tab with the rest of the palette. The palette is the same in the dieline page editor and the admin modal.

## Shape library
Each shape is a function that draws ONE simple polygon in a `w` x `h` box (most are drawn in a unit frame and stretched to the box with `fit`; rounded corners, notches and waves use `w` and `h`). To add a shape: add an entry to `SHAPE_DEFS` (`label`, `group`, `ratio`, `lock` for round / regular shapes, optional `start`, `build`); the palette, the 3D hole, the exports and the checks follow. The test `the shape library` checks every shape is simple (no crossing edges), fills its box wide, tall and square, and can be cut and rotated. Ids are stored in projects: never rename one.

## Distances and guides (editor)
- A chosen window shows two blue measures: from the left edge (or fold) of its panel, and from the top one (`windowGaps` in `apps/web/src/lib/window-guides.ts`, measured along the window's middle, in the chosen unit).
- Moving snaps (6 screen px) the left / middle / right and top / middle / bottom lines of the window to the same lines of other windows and to the middle of its panel (`snapMove`); lined-up lines show as orange dashed guides. Alt = move freely. Tests: `lib/window-guides.test.ts`.

## Grips and right-click menu
A chosen window has a solid blue frame, round grips on the corners and a pill grip on each side (long along the side it moves), a round rotate grip above. Right click on a window or its grips selects it and opens a small menu: Duplicate, Delete (`menu` state in `window-editor.tsx`; closes on a click elsewhere, Escape, scroll or zoom). The handler sits on the window's `<g>`, so it also works on the grips of a small window.

## Dieline | 3D tabs (editor header) and tab switching
The editor header has Dieline | 3D tabs in the middle. In "3D" the 3D box takes the centre and the dieline moves to the right bar as a small read-only picture (`MiniSheet`; click a window there to choose it); the big sheet stays mounted but hidden, so its zoom and position come back. Both the editor and the dieline page switch tabs the same way (`components/dielines/view-switch.tsx`): `useViewSwitch` changes the tab at once, mounts the slow view two frames later (so the placeholder is painted first), keeps the tabs disabled until the new view reports it is drawn (`CartonView` `onReady`, passed through `FoldPreview`), with a 10 s safety timer; `ViewSkeleton` is the placeholder.

## Open / close animation
The editor is not swapped in: it slides up from the bottom over the page when it opens (`wh-enter`) and slides down again when it closes (`wh-exit`), both in `globals.css`. Dieline page state `windowsView` is `closed | open | closing`; the page behind stays mounted (hidden once the editor has settled, shown again at the start of the close) so the close shows it at once. Inside the editor the 3D box is built only after the slide-up (`settled`), so the animation does not stutter. `prefers-reduced-motion` makes it near-instant. In the 3D tab the shape palette stays visible but disabled, with a note. The Dieline | 3D tabs have no colour transition and keep their text colours while disabled (a transition made the text vanish on the dark tab).

## Smooth dragging (do not undo)
Moving a window must not rebuild the 3D box on every pointer move: that costs seconds in a slow browser. So `window-editor.tsx` (1) handles pointer moves once per animation frame (`onMove` keeps the latest, `moveNow` runs in `requestAnimationFrame`; `onUp` applies the last one), (2) keeps the live check (`applyWindows`, about 1 ms) on the drawing, but (3) feeds the 3D preview from `boxDraft`, which only follows the drawing when no drag is running (`dragging`). Measured in headless Chrome: 60 moves, long tasks 72 (200 s) before, 0 after.

## Not done / ideas
- Windows across several panels, film behind the window, window on a stacked flap in 3D layer logic (works, not tuned).
- Holes the drawing already has stay clear (a cut loop inside another loop); the outline of a second piece such as a lid is not a hole.
- Windows keep their sheet position when the box size changes: one that no longer fits is left out and the save is refused.
- Drag from the palette works with a mouse (HTML5 drag and drop: `addAt` in `window-editor.tsx` centres the shape on the drop point, sized to fit the panel under it); not on touch screens, where tapping a shape still adds it. The editor's sheet picture has no artwork or watermark.
