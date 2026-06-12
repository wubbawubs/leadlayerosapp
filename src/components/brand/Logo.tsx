import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/brand/Mark";

export function Logo({ to = "/", showWordmark = true }: { to?: string; showWordmark?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 group">
      <Mark className="h-8 w-8 shrink-0 transition-transform group-hover:scale-105" />
      {showWordmark && (
        <span className="font-display text-xl font-bold tracking-tight text-foreground">
          LeadLayer <span className="text-accent">OS</span>
        </span>
      )}
    </Link>
  );
}
