import { requireUser } from "@/server/session";
import { UserMenuClient } from "./user-menu-client";

/** Server part: resolves the signed-in user (inside the layout's Suspense boundary). */
export async function UserMenu() {
  const user = await requireUser();
  return <UserMenuClient name={user.name} email={user.email} image={user.image ?? null} />;
}
