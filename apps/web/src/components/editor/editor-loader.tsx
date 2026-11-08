"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ArtworkEditor } from "./artwork-editor";

/** Fabric needs the browser: load the editor on the client only. */
const Editor = dynamic(() => import("./artwork-editor").then((m) => m.ArtworkEditor), {
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading editor…</div>,
});

export function EditorLoader(props: ComponentProps<typeof ArtworkEditor>) {
  return <Editor {...props} />;
}
