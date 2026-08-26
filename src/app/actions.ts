"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession } from "@/lib/auth";

export async function logoutAction(): Promise<void> {
  await destroySession();
  // Same reasoning as loginAction -- clears the Router Cache so a
  // same-tab login as a different user afterward can't render this
  // session's stale cached pages.
  revalidatePath("/", "layout");
  redirect("/login");
}
