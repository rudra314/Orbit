import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authService } from "@/services/authService";
import { teamService } from "@/services/teamService";

// Magic-link callback. Supabase redirects here with a `code` (PKCE flow).
// We exchange it for a session (stored in httpOnly cookies) and provision
// the Orbit User row on first login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      const appUser = await authService.ensureUser({
        email: data.user.email,
        name:
          (data.user.user_metadata?.name as string | undefined) ??
          (data.user.user_metadata?.full_name as string | undefined) ??
          null,
        avatarUrl:
          (data.user.user_metadata?.avatar_url as string | undefined) ?? null,
      });
      // Auto-join any projects this email was invited to.
      await teamService.acceptInvitationsForUser(appUser.id, data.user.email);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
