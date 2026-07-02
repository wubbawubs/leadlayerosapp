import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { GlassButton } from "@/components/ui/glass-button";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSigningIn(true);

    const [{ error: authError }] = await Promise.all([
      supabase.auth.signInWithPassword({ email, password }),
      // Minimum display time so the mark animation has room to play
      new Promise<void>((r) => setTimeout(r, 650)),
    ]);

    if (authError) {
      setSigningIn(false);
      setLoading(false);
      setError(authError.message);
      return;
    }

    // Overlay stays up through the navigation
    window.location.assign("/dashboard");
  }

  async function handleGoogle() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) {
      setError(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <>
      {signingIn && <SignInOverlay />}

      <AuthShell title="Sign in" subtitle="Welcome back to LeadLayer.">
        <form onSubmit={handleSubmit} className="space-y-4">
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
            autoComplete="current-password"
            required
          />
          {error && <p className="text-sm font-medium text-paper-danger">{error}</p>}
          <GlassButton
            type="submit"
            variant="amber"
            disabled={loading || signingIn}
            className="w-full"
          >
            Sign in
          </GlassButton>
        </form>

        <Divider />

        <button
          type="button"
          onClick={handleGoogle}
          className="h-12 w-full rounded-[4px] border border-paper-line-strong bg-white text-[15px] font-medium text-ink transition hover:bg-paper-subtle"
        >
          Continue with Google
        </button>

        <div className="mt-6 flex items-center justify-between text-sm text-ink-2">
          <Link to="/reset-password" className="transition hover:text-ink">
            Forgot password?
          </Link>
          <Link to="/signup" className="transition hover:text-ink">
            Create account
          </Link>
        </div>
      </AuthShell>
    </>
  );
}

function SignInOverlay() {
  return (
    <div
      className="paper fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
      style={{ animation: "login-card-in 0.18s ease-out both" }}
    >
      <LoginMark />
      <p className="label-mono" style={{ animation: "mark-wordmark 0.3s ease-out 0.5s both" }}>
        Signing in…
      </p>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="paper bg-blueprint flex min-h-screen flex-col items-center justify-center px-6 py-12">
      {/* Animated logo mark */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <LoginMark />
        <p
          className="font-display text-2xl font-bold tracking-tight text-ink"
          style={{ animation: "mark-wordmark 0.4s cubic-bezier(0.16,1,0.3,1) 0.55s both" }}
        >
          LeadLayer <span className="text-amber">OS</span>
        </p>
      </div>

      {/* Auth card */}
      <div
        className="w-full max-w-md rounded-[4px] border border-paper-line-strong bg-paper-raised p-8"
        style={{ animation: "login-card-in 0.5s cubic-bezier(0.16,1,0.3,1) 0.7s both" }}
      >
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 mb-6 text-[15px] text-ink-2">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function LoginMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-20 w-20"
      aria-hidden="true"
    >
      {/* Top layer — slides in from top-left */}
      <path
        d="M18 10 L54 10 L46 22 L10 22 Z"
        fill="var(--amber)"
        style={{ animation: "mark-layer-1 0.45s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}
      />
      {/* Middle layer — outline, scales in from center */}
      <path
        d="M14 27 L50 27 L42 39 L6 39 Z"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="2.5"
        style={{
          animation: "mark-layer-2 0.4s cubic-bezier(0.16,1,0.3,1) 0.28s both",
          transformOrigin: "32px 33px",
        }}
      />
      {/* Bottom layer — slides in from bottom-right */}
      <path
        d="M18 44 L54 44 L46 56 L10 56 Z"
        fill="var(--amber-deep)"
        style={{ animation: "mark-layer-3 0.45s cubic-bezier(0.16,1,0.3,1) 0.42s both" }}
      />
    </svg>
  );
}

export function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="h-12 w-full rounded-[4px] border border-paper-line-strong bg-white px-3 text-base text-ink outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/25"
      />
    </label>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="rule-hair flex-1" />
      <span className="label-mono">or</span>
      <span className="rule-hair flex-1" />
    </div>
  );
}
