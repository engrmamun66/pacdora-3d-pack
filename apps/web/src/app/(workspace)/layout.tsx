import type { ReactNode } from "react";

/** Full-screen shell for the dieline workspace (no sidebar: the sheet needs the room). */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
