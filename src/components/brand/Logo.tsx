import { Link } from "@tanstack/react-router";
import mark from "@/assets/leadlayer-mark.svg";

export function Logo({ to = "/", showWordmark = true }: { to?: string; showWordmark?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 group">
      <img
        src={mark}
        alt="LeadLayerOS"
        className="h-8 w-8 transition-transform group-hover:scale-105"
      />
      {showWordmark && (
        <span className="font-display text-xl font-bold tracking-tight text-foreground">
          LeadLayer<span className="text-primary">OS</span>
        </span>
      )}
    </Link>
  );
}
