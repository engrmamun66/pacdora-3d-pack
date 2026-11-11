import { redirect } from "next/navigation";

/** The dashboard moved to /my-dashboard (old links and bookmarks keep working). */
export default function DashboardMoved() {
  redirect("/my-dashboard");
}
