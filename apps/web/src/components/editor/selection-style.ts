import { Control, FabricObject, Textbox, type FabricObject as FabricObjectType } from "fabric";

/**
 * The look of a selected artwork: the same as a selected window hole in the window editor
 * (components/dielines/window-editor.tsx): a blue frame, round white grips with a soft halo on the
 * corners, a pill on each side, and a round turn grip with a circular-arrow icon on a stem above. Sizes are screen pixels.
 */
const BLUE = "#3b82f6";
const HALO = "rgba(99,102,241,0.18)";
const EDGE = "#e4e1ff";

/** A grip drawn like the window editor's: halo, then a white shape with a thin pale edge. Pills turn with the object. */
function gripRenderer(w: number, h: number) {
  return function render(this: Control, ctx: CanvasRenderingContext2D, left: number, top: number, _style: unknown, obj: FabricObjectType) {
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.translate(left, top);
    if (obj.angle) ctx.rotate((obj.angle * Math.PI) / 180);
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 1.2, -h / 2 - 1.2, w + 2.4, h + 2.4, r + 1.2);
    ctx.fillStyle = HALO;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = EDGE;
    ctx.stroke();
    ctx.restore();
  };
}

/**
 * The turn grip: a round grip with a circular arrow (about three quarters of a circle, arrow head at the end).
 * The icon always stays upright, so it reads the same however the artwork is turned.
 */
function turnRenderer(size: number) {
  const round = gripRenderer(size, size);
  return function render(this: Control, ctx: CanvasRenderingContext2D, left: number, top: number, style: unknown, obj: FabricObjectType) {
    round.call(this, ctx, left, top, style, obj);
    const r = size * 0.27;
    const start = -Math.PI / 2 + 0.55;
    const end = start + Math.PI * 1.5;
    const [px, py] = [Math.cos(end) * r, Math.sin(end) * r];
    const [tx, ty] = [-Math.sin(end), Math.cos(end)]; // the way the arc is going at its end
    const [nx, ny] = [Math.cos(end), Math.sin(end)]; // outward from the centre
    const head = size * 0.16;
    ctx.save();
    ctx.translate(left, top);
    ctx.strokeStyle = BLUE;
    ctx.fillStyle = BLUE;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r, start, end);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + tx * head * 1.2, py + ty * head * 1.2);
    ctx.lineTo(px + nx * head, py + ny * head);
    ctx.lineTo(px - nx * head, py - ny * head);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
}

/** Grip size [width, height] in px: corners 12 round, top/bottom 15 x 6, left/right 6 x 15, turn grip 22 round. */
const SIZES: Record<string, [number, number]> = {
  tl: [12, 12], tr: [12, 12], bl: [12, 12], br: [12, 12],
  mt: [15, 6], mb: [15, 6], ml: [6, 15], mr: [6, 15],
  mtr: [22, 22],
};

function restyle(controls: Record<string, Control>) {
  for (const [key, c] of Object.entries(controls)) {
    const size = SIZES[key];
    if (!size) continue; // a control of its own kind keeps fabric's look
    const [w, h] = size;
    c.render = key === "mtr" ? turnRenderer(w) : gripRenderer(w, h);
    c.sizeX = w;
    c.sizeY = h;
    // A little easier to hit than to see, like a thumb on a touch screen.
    c.touchSizeX = w + 8;
    c.touchSizeY = h + 8;
    if (key === "mtr") {
      c.offsetY = -26; // the stem: 26 px above the top edge
      c.withConnection = true;
    }
  }
  return controls;
}

let done = false;
/** Restyle the grips of every new object (call once, in the browser). */
export function installSelectionStyle() {
  if (done) return;
  done = true;
  for (const cls of [FabricObject, Textbox] as const) {
    const original = cls.createControls.bind(cls);
    cls.createControls = () => {
      const made = original();
      restyle(made.controls);
      return made;
    };
  }
}

/** Frame of the selection (apply to the active object when it is selected). */
export function styleFrame(o: FabricObjectType | undefined) {
  o?.set({ borderColor: BLUE, borderScaleFactor: 2.2, borderOpacityWhenMoving: 1, padding: 0 });
}
