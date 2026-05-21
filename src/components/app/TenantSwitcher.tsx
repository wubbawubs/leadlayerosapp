import { useEffect, useRef, useState } from "react";

type Tenant = { id: string; name: string; geo: string; vertical: string; status: string };

const STORAGE_KEY = "ll.activeTenantId";

export function getActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setActiveTenantId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function TenantSwitcher({ tenants }: { tenants: Tenant[] }) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => getActiveTenantId());
  const ref = useRef<HTMLDivElement | null>(null);

  // Default to first tenant if nothing stored or stored one is gone.
  useEffect(() => {
    if (tenants.length === 0) return;
    if (!activeId || !tenants.some((t) => t.id === activeId)) {
      const next = tenants[0].id;
      setActiveTenantId(next);
      setActiveId(next);
    }
  }, [tenants, activeId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (tenants.length === 0) return null;
  const active = tenants.find((t) => t.id === activeId) ?? tenants[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          {active.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[180px] truncate">{active.name}</span>
        <span className="text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          <ul className="max-h-64 overflow-auto py-1">
            {tenants.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setActiveTenantId(t.id);
                    setActiveId(t.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-secondary ${
                    t.id === active.id ? "bg-secondary/50" : ""
                  }`}
                >
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
                    {t.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.geo} · {t.vertical}
                    </span>
                  </span>
                  {t.id === active.id && (
                    <span className="mt-1 text-xs text-primary">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
