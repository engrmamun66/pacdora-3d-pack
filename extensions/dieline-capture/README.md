# Dieline Capture (Chrome extension)

Select a dieline on any page and get a clean SVG in millimetres (cut, crease and bleed lines). It works from a **picture of the screen**
(the page's own vector data is never read), so it only sees what you see.

## Install (no build step)

1. Open `chrome://extensions`, switch on **Developer mode**.
2. **Load unpacked**, choose this folder (`extensions/dieline-capture`).

## Use

1. Open the page with the dieline. Click the extension icon (or press **Alt+Shift+S**).
2. Drag a rectangle round the dieline (Esc cancels). A new tab opens with the result.
3. **Measure**: click the two ends of a line whose length you know, type its length in mm. Until then the scale is a guess (1 page pixel = 1/96 inch).
4. If a kind of line is missing, press **Pick** next to its name and click that line in the picture. **Tolerance** accepts more shades.
5. **Ignore area**: drag a rectangle round anything that is not part of the dieline (a size arrow, a note). It is left out of the SVG. **Clear** takes the rectangles away.
6. **Download SVG** or **Copy SVG**.

## What it does and does not do

- Lines are told apart by colour (cut = dark blue, crease = dotted red, bleed = green by default). A pixel is compared with the paper next to it
  (white on the sheet, grey around it), so pale 1 px lines and lines on a grey page work. Grey watermarks and light-blue size arrows are left out
  because the *direction* of their colour is not one of the three. Tolerance is how far that direction may be off.
- Cut and bleed lines are followed from end to end and simplified; small breaks (one line hidden under another, a label on top) are closed; almost straight lines are made straight.
- Crease lines are found only when they run straight along x or y. A crease at an angle is not detected.
- Curves become short straight pieces. The accuracy is the accuracy of the screenshot: zoom the page in (and select a smaller area) for more. On a 920 px wide picture of a 952 mm sheet, the size came out within 1 mm of the size the page printed.
- Only for pictures you have the right to use. Do not copy a watermark or a brand into the SVG.

## Files

- `vectorize.js`: picture in, SVG out (pure JavaScript, also tested in Node: `npm test`).
- `content.js`: the selection overlay. `background.js`: takes the picture of the tab and cuts out the area. `result.html` / `result.js`: the result page.
- Permissions: `activeTab` (only after you click the icon), `scripting` (to show the overlay), `storage` (to hand the picture to the result tab). No host access, nothing is sent to any server.
