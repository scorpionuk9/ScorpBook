import "server-only";

import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

export async function requireAccountingUser() {
  const supabase = await createSessionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const allowedIds = (process.env.SCORPBOOK_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!allowedIds.length || !allowedIds.includes(user.id)) {
    redirect("/unauthorized");
  }
  return user;
}
