# Template layouts and featured backgrounds

The shared (portal) template page shows the box in 3D only. Two admin-managed things change that picture.

## Template Layouts (admin menu, after Templates)

- Table `template_layout` (`name`, `sortOrder`, `active`, `spec` JSON). One list for every template.
- `spec` is a `LayoutSpec` v2 (`apps/web/src/lib/scene-layout.ts`): a list of boxes, a floor mirror, and a camera (turn around, look from, zoom).
  - Each box (up to 12): place (right, up from the floor, towards the viewer), spin, lean forward, lean sideways, size, and a **repeat** (a line of copies with a step right/up/forward, extra spin/lean per copy, optional zig-zag lean; plus rows of such lines for grids), and a shape (wider / taller / deeper). So any quantity, in any direction. At most 48 boxes on screen in all.
  - Distances are in box sizes (the box as it stands after its turn; 1 = touching), so a layout fits any box. Lying flat = lean forward 90°.
  - Glossy floor (`mirror`): a reflection of every box in the floor. Strength (0.05 to 0.8) is how strong it is where the box touches the floor; length (0.1 to 3, in heights of the group) is how far down it reaches. It fades out smoothly with depth, done per pixel in the shader (`onBeforeCompile` on the cloned materials).
  - Presets (`PRESETS` in the same file: 20 of them, such as stacks, flat piles, floating trios, zig-zag, receding row, flat and diamond grids, wide + tall pair) only fill in the box list. First-version layouts (arrangement + count) already stored are converted when read.
- `layoutInstances(spec)` expands the boxes and their repeats into the boxes on screen.
- The admin page (`/doraadmin/template-layouts`) has a live preview on a plain sample box, box tabs with Add / Duplicate / Remove, a "Use this camera" button that copies the preview camera into the layout, up/down order, on/off, and "Add starter layouts" for an empty list.
- On the portal template page the active layouts become the tabs Sample 1, Sample 2 ... in list order. A tab sets `CartonView`'s `layout` prop: the box is cloned (same geometry and materials), each copy is turned, leaned, lowered to the floor and lifted by its steps; with the glossy floor on, flipped clones with the depth fade go under the floor (`ShadowMaterial` ground does not write depth, so they show). The camera glides to the layout's view.

## Featured backgrounds

- `artwork_item.featured` (boolean). On the Artworks page a star button appears on background pictures (category "Background Image" or "Backgrounds: ..."); only those can be featured.
- Featured pictures are the ones under the portal 3D view. They are served by the public route `/api/portal/backgrounds/[id]` (no sign-in, only featured background pictures).
- A customer's pick is shown at once as the CSS background behind the (see-through) 3D canvas, with the box's shadow on it. It is not saved: not in the order, not in the project.

Layouts are our own arrangements. No third-party mock-up images or layouts are copied.
