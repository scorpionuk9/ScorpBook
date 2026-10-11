import "server-only";

import { cookies } from "next/headers";
import { parseViewMode, VIEW_MODE_COOKIE, type ViewMode } from "@/lib/ui/view-mode";

export async function getViewMode(): Promise<ViewMode> {
  return parseViewMode((await cookies()).get(VIEW_MODE_COOKIE)?.value);
}
