import { createClient } from "@supabase/supabase-js";

// Service-role client for privileged auth operations (sending invite emails).
// Returns null when the service-role key isn't configured so callers can treat
// email delivery as best-effort — the Invitation row is the source of truth and
// acceptance also runs on a normal magic-link sign-in.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Sends (or re-sends) a Supabase invite magic-link email. Best-effort: any
// failure (no service key, email already a user, SMTP not configured) is logged
// and swallowed so the invitation flow still succeeds.
export async function sendInviteEmail(email: string, redirectTo: string) {
  const admin = adminClient();
  if (!admin) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY not set — invite email skipped for",
      email,
    );
    return;
  }
  try {
    await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  } catch (err) {
    console.error("invite email failed for", email, err);
  }
}
