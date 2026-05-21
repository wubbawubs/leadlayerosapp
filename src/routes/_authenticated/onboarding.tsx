import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingLayout,
});

const STEPS = [
  { path: "/onboarding/welcome", label: "Welcome" },
  { path: "/onboarding/business", label: "Business" },
  { path: "/onboarding/site", label: "Site" },
  { path: "/onboarding/done", label: "Done" },
];

function OnboardingLayout() {
  const { pathname } = useLocation();
  const activeIdx = Math.max(
    0,
    STEPS.findIndex((s) => pathname.startsWith(s.path)),
  );

  return (
    <div className="min-h-screen bg-background bg-blueprint">
      <header className="container mx-auto px-6 py-5">
        <Logo />
      </header>
      <main className="container mx-auto max-w-2xl px-6 pb-24 pt-4">
        <ol className="mb-10 flex items-center gap-2 text-xs uppercase tracking-widest">
          {STEPS.map((s, i) => (
            <li key={s.path} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  i <= activeIdx
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={i === activeIdx ? "text-foreground" : "text-muted-foreground"}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-border">—</span>}
            </li>
          ))}
        </ol>
        <Outlet />
      </main>
    </div>
  );
}
