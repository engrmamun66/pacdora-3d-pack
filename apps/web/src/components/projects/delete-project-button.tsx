"use client";

import { Button } from "@/components/ui/button";
import { deleteProject } from "@/app/(app)/projects/actions";

/** Delete with an explicit confirmation: deletion cannot be undone. */
export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  return (
    <form
      action={deleteProject}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="destructive">Delete project</Button>
    </form>
  );
}
