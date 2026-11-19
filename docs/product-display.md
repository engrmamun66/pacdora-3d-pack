# Product display and 3D pictures

## Product Display Settings (Client dashboard > Settings)

- Columns on `user`: `cardColumns` (2 to 6, default 4) and `cardImage` (`dieline` or `3d`, default `dieline`). Saved by `saveDisplaySettings` (`app/(dash)/my-dashboard/actions.ts`).
- The Client's shared template list (`TemplateGrid`) uses them: cards per row on wide screens, and the picture on a card. With `3d`, a template without a cover picture shows its dieline.
- "Product Image" (a photo of the finished product) is not built yet; the option is shown as coming soon.

## 3D pictures (online design page)

- In the 3D drawer of `/editor/[id]` (`CaptureBar`, `components/viewer3d/capture-bar.tsx`): pick a layout (the active Template Layouts), set the fold amount and camera, press "Capture 3D picture". The PNG (1200 x 900) is kept with the project.
- Table `project_capture` (project, layout name, fold amount, `cover`). Files in storage under `captures/<uuid>.png`. At most 12 per project, 3 MB each. The first picture becomes the cover; the star makes another one the cover; the bin deletes it (the newest left becomes the cover).
- Routes: `GET/POST /api/projects/[id]/captures`, `PATCH/DELETE /api/projects/[id]/captures/[cid]` (owner only), and `GET /api/captures/[id]` (the owner sees any picture; anyone sees the cover one, since it is on the shared pages).
