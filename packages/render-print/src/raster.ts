import { PNG } from "pngjs";
import { imageSize, imageSizeProblem } from "@packaging/vector-scene";

export interface RgbImage {
  readonly width: number;
  readonly height: number;
  /** 8-bit RGB, row by row from the top. */
  readonly rgb: Uint8Array;
  /** True if any pixel was not fully opaque (then composited onto white). */
  readonly hadAlpha: boolean;
}

/** Decode a PNG and composite it onto white (for formats without transparency). */
export function pngToRgbOnWhite(bytes: Uint8Array): RgbImage {
  // Check the header before decoding: a small PNG can declare billions of pixels.
  const problem = imageSizeProblem(imageSize(bytes, "image/png"));
  if (problem) throw new Error(`Image refused: ${problem}.`);
  const png = PNG.sync.read(Buffer.from(bytes));
  const { width, height, data } = png;
  const rgb = new Uint8Array(width * height * 3);
  let hadAlpha = false;
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3]! / 255;
    if (a < 1) hadAlpha = true;
    rgb[j] = Math.round(data[i]! * a + 255 * (1 - a));
    rgb[j + 1] = Math.round(data[i + 1]! * a + 255 * (1 - a));
    rgb[j + 2] = Math.round(data[i + 2]! * a + 255 * (1 - a));
  }
  return { width, height, rgb, hadAlpha };
}

/** Re-encode an RGB image as an opaque PNG. */
export function rgbToPng(img: RgbImage): Uint8Array {
  const png = new PNG({ width: img.width, height: img.height, colorType: 2, inputColorType: 2, inputHasAlpha: false });
  png.data = Buffer.from(img.rgb);
  return new Uint8Array(PNG.sync.write(png, { colorType: 2, inputColorType: 2, inputHasAlpha: false }));
}
