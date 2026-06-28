"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OrbitMark } from "@/components/OrbitMark";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    searchParams.get("error") ? "error" : "idle",
  );
  const [message, setMessage] = useState(
    searchParams.get("error")
      ? "That sign-in link was invalid or expired. Try again."
      : "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-primary">
          <OrbitMark className="h-8 w-8" />
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            Orbit
          </span>
        </div>

        {status === "sent" ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold text-card-foreground">
              Check your email
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a magic link to <strong>{email}</strong>. Click it to sign
              in.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-card p-6"
          >
            <h1 className="text-lg font-semibold text-card-foreground">
              Sign in to Orbit
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your work email and we&apos;ll send you a magic link.
            </p>

            <label
              htmlFor="email"
              className="mt-5 block text-sm font-medium text-card-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@innominds.com"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />

            {status === "error" && (
              <p className="mt-3 text-sm text-danger">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
