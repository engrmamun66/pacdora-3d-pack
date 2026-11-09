import "server-only";
import { generateDieline } from "@packaging/dieline-engine";
import type { ProjectDoc } from "@packaging/schema";
import { type ImageSource, type Scene, type SceneOptions, buildScene } from "@packaging/vector-scene";
import { nodeFontSource } from "@packaging/vector-scene/node";
import { db } from "./db";
import { storage } from "./storage";

/** Images of one user only: an export can never read another user's upload. */
export function userImageSource(userId: string): ImageSource {
  // One read per image per export, however many times the artwork places it.
  const cache = new Map<string, Promise<{ bytes: Uint8Array; mime: string } | null>>();
  return {
    load(assetId) {
      let hit = cache.get(assetId);
      if (!hit) {
        hit = (async () => {
          const asset = await db.asset.findFirst({ where: { id: assetId, userId }, select: { storageKey: true, fileType: true } });
          if (!asset) return null;
          const bytes = await storage.get(asset.storageKey);
          return bytes ? { bytes: new Uint8Array(bytes), mime: asset.fileType } : null;
        })();
        cache.set(assetId, hit);
      }
      return hit;
    },
  };
}

/** Regenerate geometry from the stored parameters (never trusts stored geometry) and build the scene. */
export async function projectScene(userId: string, doc: ProjectDoc, options: Partial<SceneOptions>): Promise<{ scene: Scene; geo: ReturnType<typeof generateDieline> }> {
  const geo = generateDieline(doc.template.generatorId, doc.template.params);
  const scene = await buildScene(geo, doc.artwork, { fonts: nodeFontSource, images: userImageSource(userId) }, options);
  return { scene, geo };
}

/** File name safe for Content-Disposition. */
export const fileBase = (name: string) => name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "dieline";
