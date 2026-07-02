/**
 * GlassButton — the one button system (Liquid OS v5).
 *
 * Capsule geometry, press physics and a specular highlight that tracks
 * the pointer. Variants map to the .gbtn-* materials in styles.css:
 *
 *  - amber  liquid-amber primary — ONE per screen
 *  - glass  secondary — adapts to .paper / .surface-charcoal contexts
 *  - ghost  hairline capsule
 *  - danger red-tinted glass
 *
 * Replaces `cta-shear`, shadcn Button variants and hand-rolled buttons
 * on customer surfaces. See docs/DESIGN_V5_LIQUID_GLASS.md.
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const glassButtonVariants = cva("gbtn", {
  variants: {
    variant: {
      amber: "gbtn-amber",
      success: "gbtn-success",
      glass: "gbtn-glass",
      ghost: "gbtn-ghost",
      danger: "gbtn-danger",
    },
    size: {
      default: "",
      sm: "gbtn-sm",
    },
  },
  defaultVariants: {
    variant: "glass",
    size: "default",
  },
});

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof glassButtonVariants> {
  asChild?: boolean;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, asChild = false, onPointerMove, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(glassButtonVariants({ variant, size, className }))}
        onPointerMove={(e: React.PointerEvent<HTMLButtonElement>) => {
          // Specular highlight follows the pointer (consumed by .gbtn-glass::after)
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
          onPointerMove?.(e);
        }}
        {...props}
      />
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };
