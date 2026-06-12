import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthShell, Field, Divider } from "./login";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/app",
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    window.location.assign("/app");
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/app",
    });
    if (result.error) {
      setError(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/app" });
  }

  return (
    <AuthShell title="Create account" subtitle="Operator access to LeadLayer OS.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" value={name} onChange={setName} autoComplete="name" required />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
        />
        {error && <p className="text-sm font-medium text-paper-danger">{error}</p>}
        <button type="submit" disabled={loading} className="cta-shear w-full">
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <Divider />

      <button
        type="button"
        onClick={handleGoogle}
        className="h-12 w-full rounded-[4px] border border-paper-line-strong bg-white text-[15px] font-medium text-ink transition hover:bg-paper-subtle"
      >
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-ink transition hover:text-amber-deep">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
