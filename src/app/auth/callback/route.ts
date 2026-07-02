import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authService } from "@/services/authService";
import { teamService } from "@/services/teamService";

const DEFAULT_REDIRECT = "/";

// Allowlist: only same-origin relative paths. Rejects absolute/protocol-relative
// URLs and the `${origin}${next}` userinfo bypass (e.g. next="@evil.com" turns
// into "http://host@evil.com", whose hostname is evil.com).
export function isInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

// Magic-link callback. Supabase redirects here with a `code` (PKCE flow).
// We exchange it for a session (stored in httpOnly cookies) and provision
// the Orbit User row on first login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? DEFAULT_REDIRECT;
  const next = isInternalPath(rawNext) ? rawNext : DEFAULT_REDIRECT;

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
