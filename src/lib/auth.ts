import { createClient } from "@/lib/supabase/server";
import { authService } from "@/services/authService";

// Resolves the current request's authenticated user as the Orbit `User` row.
// Server-only helper for Server Components / Route Handlers. Returns null when
// there is no valid session. Goes through the service layer (no Prisma here).
export async function getAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const appUser = await authService.getByEmail(user.email);
  if (!appUser) return null;

  return { ...appUser, supabaseUserId: user.id };
}
