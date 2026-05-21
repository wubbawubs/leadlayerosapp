import { createFileRoute, Link } from "@tanstack/react-router";
import { onboardingCopy } from "@/lib/shared/locale/onboarding";

export const Route = createFileRoute("/_authenticated/onboarding/done")({
  component: Done,
});

function Done() {
  const t = onboardingCopy.en.done;
  return (
    <div className="rounded-lg border border-border bg-card/70 p-8 backdrop-blur">
      <h1 className="font-display text-4xl text-foreground">{t.title}</h1>
      <p className="mt-3 text-muted-foreground">{t.body}</p>
      <Link
        to="/app"
        className="mt-8 inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
      >
        {t.cta}
      </Link>
    </div>
  );
}
