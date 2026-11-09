import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./session";

export const SUPERADMIN = "superadmin";

/**
 * The signed-in super admin, or a redirect to /doraadmin/login. The role is read
 * from the database on every call (never from a cookie), so removing the role or
 * suspending the account takes effect immediately. Call it in every admin page
 * and every admin server action.
 */
export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) redirect("/doraadmin/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, banned: true, emailVerified: true },
  });
  if (!user || user.role !== SUPERADMIN || user.banned || !user.emailVerified) redirect("/doraadmin/login");
  return user;
}
