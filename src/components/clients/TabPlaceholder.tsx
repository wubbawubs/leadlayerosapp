export function TabPlaceholder({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Phase 3 placeholder
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
