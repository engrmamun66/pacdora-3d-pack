"use client";

import { Button } from "@/components/ui/button";
import { deleteProject } from "@/app/(app)/projects/actions";
import { useConfirmedSubmit } from "@/components/ui/confirm-host";

/** Delete with an explicit confirmation: deletion cannot be undone. */
export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const confirmed = useConfirmedSubmit();
  return (
    <form action={deleteProject} onSubmit={confirmed({ title: `Delete "${name}"?`, description: "The project and its design are removed. This cannot be undone." })}>
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="destructive">Delete project</Button>
    </form>
  );
}
