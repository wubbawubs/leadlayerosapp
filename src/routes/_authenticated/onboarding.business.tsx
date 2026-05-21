import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { saveBusinessStep } from "@/lib/shared/db/repos/onboarding.functions";
import {
  GEO_OPTIONS,
  VERTICAL_OPTIONS,
  BusinessStepSchema,
} from "@/lib/shared/db/repos/onboarding.schemas";
import { onboardingCopy } from "@/lib/shared/locale/onboarding";

export const Route = createFileRoute("/_authenticated/onboarding/business")({
  component: Business,
});

function Business() {
  const navigate = useNavigate();
  const save = useServerFn(saveBusinessStep);
  const t = onboardingCopy.en.business;
  const verticals = onboardingCopy.en.verticals;

  const [name, setName] = useState("");
  const [geo, setGeo] = useState<(typeof GEO_OPTIONS)[number]>("NL");
  const [vertical, setVertical] =
    useState<(typeof VERTICAL_OPTIONS)[number]>("home_services");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const parsed = BusinessStepSchema.parse({ name, geo, vertical });
      return save({ data: parsed });
    },
    onSuccess: (r) => {
      sessionStorage.setItem("onboarding.name", r.name);
      navigate({ to: "/onboarding/site" });
    },
    onError: (e) => setErr((e as Error).message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    m.mutate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border bg-card/70 p-8 backdrop-blur"
    >
      <h1 className="font-display text-3xl text-foreground">{t.title}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t.body}</p>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">{t.name}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">{t.geo}</span>
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value as typeof geo)}
            className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary"
          >
            {GEO_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">{t.vertical}</span>
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value as typeof vertical)}
            className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary"
          >
            {VERTICAL_OPTIONS.map((v) => (
              <option key={v} value={v}>{verticals[v]}</option>
            ))}
          </select>
        </label>
      </div>

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      <button
        type="submit"
        disabled={m.isPending}
        className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {m.isPending ? "Saving…" : t.next}
      </button>
    </form>
  );
}
