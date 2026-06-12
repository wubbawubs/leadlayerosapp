import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field } from "./login";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If the browser arrived with a #type=recovery hash, switch to update mode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setMode("update");
    }
  }, []);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo("Check your email for the reset link.");
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/app" });
  }

  if (mode === "update") {
    return (
      <AuthShell title="Set new password" subtitle="Pick a strong password.">
        <form onSubmit={handleUpdate} className="space-y-4">
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
          {error && <p className="text-sm font-medium text-paper-danger">{error}</p>}
          <button type="submit" disabled={loading} className="cta-shear w-full">
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password" subtitle="We'll email you a reset link.">
      <form onSubmit={handleRequest} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        {error && <p className="text-sm font-medium text-paper-danger">{error}</p>}
        {info && <p className="text-sm font-medium text-paper-success">{info}</p>}
        <button type="submit" disabled={loading} className="cta-shear w-full">
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-2">
        <Link to="/login" className="transition hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
