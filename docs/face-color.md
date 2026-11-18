# Face color (colour of one panel)

A flat colour poured over ONE whole panel of the box, set in the artwork editor ("Face color" tool, the paint bucket in the top bar).

- **Stored** in the artwork as `artwork.faces`: a list of `{ panelId, color }` (`#rrggbb`), one per panel (`faceColor`, `facesOf` in `packages/schema/src/artwork.ts`). Absent = none. Old files have none.
- **Layer order**: board colour, then face colours, then the box background pictures, then every other artwork item. The colour fills the panel's outline and leaves its window holes open (`lib/panel-fill.ts`).
- **Where it shows**: the editor's dieline canvas (`editor-controller.ts`, `drawUnder`), the 3D preview and the PNG download (`editor/artwork-raster.ts`), and the vector exports PDF / SVG / AI / EPS (`packages/vector-scene/src/build.ts`: one filled path per face, in the Artwork layer, named "Face color <panel>").
- **Editor**: with the tool on, the panel under the pointer is outlined; a click opens the Face color box on it (colours, "no color", any colour). Each choice is one undo step. The hand tool and the tool switch each other off. Esc closes the box.
- Tests: `packages/vector-scene/test/scene.test.ts` ("face colours").
