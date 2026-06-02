import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";

import { createSiteConnection } from "@/lib/shared/db/repos/siteConnections.functions";
import { probeSiteConnection } from "@/lib/shared/db/repos/siteConnections.functions";
import { onboardingCopy } from "@/lib/shared/locale/onboarding";

export const Route = createFileRoute("/_authenticated/onboarding/wordpress")({
  component: WordpressStep,
});

function WordpressStep() {
  const navigate = useNavigate();
  const t = onboardingCopy.en.wordpress;

  const createFn = useServerFn(createSiteConnection);
  const probeFn = useServerFn(probeSiteConnection);

  const [tenantId, setTenantId] = useState("");
  const [siteUrl, setSiteUrl] = useState("https://");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [probeResult, setProbeResult] = useState<{
    status: "connected" | "error";
    message?: string;
  } | null>(null);

  useEffect(() => {
    const tid = sessionStorage.getItem("onboarding.tenantId") ?? "";
    const url = sessionStorage.getItem("onboarding.siteUrl") ?? "https://";
    setTenantId(tid);
    setSiteUrl(url);
  }, []);

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Workspace not found — complete the previous step first.");
      const { siteConnectionId } = await createFn({
        data: { tenantId, baseUrl: siteUrl, username, appPassword },
      });
      const result = await probeFn({ data: { siteConnectionId } });
      return result;
    },
    onSuccess: (r) => {
      setProbeResult({
        status: r.status,
        message:
          r.status === "connected"
            ? t.connected
            : (r.probeResult as { error?: string }).error ?? "Connection failed.",
      });
    },
    onError: (e) => {
      setProbeResult({ status: "error", message: (e as Error).message });
    },
  });

  function proceed() {
    navigate({ to: "/onboarding/goal" });
  }

  const canTest =
    siteUrl.startsWith("http") &&
    username.trim().length > 0 &&
    appPassword.trim().length >= 8;

  return (
    <div className="rounded-lg border border-border bg-card/70 p-8 backdrop-blur">
      <h1 className="font-display text-3xl text-foreground">{t.title}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t.body}</p>

      <div className="space-y-4">
        <Field
          label={t.urlLabel}
          type="url"
          value={siteUrl}
          onChange={setSiteUrl}
          placeholder="https://example.com"
        />
        <Field
          label={t.usernameLabel}
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="admin"
        />
        <div>
          <Field
            label={t.passwordLabel}
            type="password"
            value={appPassword}
            onChange={setAppPassword}
            autoComplete="off"
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {t.passwordHint}
            <a
              href="https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-accent hover:underline"
            >
              Guide <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      </div>

      {probeResult && (
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-md border px-4 py-3 text-sm ${
            probeResult.status === "connected"
              ? "border-status-green/30 bg-status-green-soft/20 text-foreground"
              : "border-status-red/30 bg-status-red-soft/20 text-foreground"
          }`}
        >
          {probeResult.status === "connected" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-green" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-red" />
          )}
          <span>{probeResult.message}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {probeResult?.status === "connected" ? (
          <button
            type="button"
            onClick={proceed}
            className="inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
          >
            {t.next}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={!canTest || testMutation.isPending}
            className="inline-flex rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {testMutation.isPending ? "Testing…" : t.testLabel}
          </button>
        )}
        <button
          type="button"
          onClick={proceed}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.skipLabel} →
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
