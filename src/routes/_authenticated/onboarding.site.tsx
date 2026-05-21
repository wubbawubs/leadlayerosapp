import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { saveSiteStep } from "@/lib/shared/db/repos/onboarding.functions";
import { SiteStepSchema } from "@/lib/shared/db/repos/onboarding.schemas";
import { onboardingCopy } from "@/lib/shared/locale/onboarding";

export const Route = createFileRoute("/_authenticated/onboarding/site")({
  component: Site,
});

function Site() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(saveSiteStep);
  const t = onboardingCopy.en.site;

  const [siteUrl, setSiteUrl] = useState("https://");
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    setName(sessionStorage.getItem("onboarding.name") ?? "");
  }, []);

  const m = useMutation({
    mutationFn: async () => {
      const parsed = SiteStepSchema.parse({ site_url: siteUrl });
      if (!name) throw new Error("Missing business name — go back to step 2");
      return save({ data: { ...parsed, name } });
    },
    onSuccess: async () => {
      sessionStorage.removeItem("onboarding.name");
      await qc.invalidateQueries({ queryKey: ["my-tenants"] });
      await qc.invalidateQueries({ queryKey: ["onboarding"] });
      navigate({ to: "/onboarding/done" });
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

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">{t.url}</span>
        <input
          type="url"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          required
          placeholder="https://example.com"
          className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </label>

      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      <button
        type="submit"
        disabled={m.isPending}
        className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {m.isPending ? "Creating workspace…" : t.next}
      </button>
    </form>
  );
}
