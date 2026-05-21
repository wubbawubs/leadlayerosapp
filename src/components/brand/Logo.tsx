import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 group">
      <span
        aria-hidden
        className="grid place-items-center h-8 w-8 rounded-sm bg-primary text-primary-foreground"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <rect x="1" y="3" width="14" height="2" rx="1" />
          <rect x="1" y="7" width="10" height="2" rx="1" />
          <rect x="1" y="11" width="6" height="2" rx="1" />
        </svg>
      </span>
      <span className="font-semibold tracking-tight">
        LeadLayer <span className="text-primary">OS</span>
      </span>
    </Link>
  );
}
