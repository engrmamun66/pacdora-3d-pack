import "server-only";

/** Most 3D pictures one project keeps, and the biggest one (a PNG at card size is far smaller). */
export const MAX_CAPTURES = 12;
export const MAX_CAPTURE_BYTES = 3 * 1024 * 1024;

/** Where a 3D picture is served. The owner sees every one; anyone sees the cover one (it is on the shared pages). */
export const captureUrl = (id: string) => `/api/captures/${id}`;

export interface CaptureInfo {
  id: string;
  url: string;
  layoutName: string | null;
  progress: number;
  cover: boolean;
}

/** Run a route handler; an unexpected error is logged and answered as JSON (with the reason outside production), never as an empty 500. */
export async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    console.error("[captures]", e);
    const why = process.env.NODE_ENV === "production" || !(e instanceof Error) ? "" : ` (${e.message.split("\n").pop()?.slice(0, 160)})`;
    return Response.json({ error: `The picture could not be saved on the server${why}.` }, { status: 500 });
  }
}
