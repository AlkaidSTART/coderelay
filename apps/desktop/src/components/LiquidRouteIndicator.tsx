import { motion } from "motion/react";
import type { ReactNode } from "react";

export interface LiquidRouteIndicatorProps {
  layoutId?: string;
  className?: string;
  variant?: "glass" | "subtle" | "dark";
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<LiquidRouteIndicatorProps["variant"]>, string> = {
  dark: "rounded-[9px] bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
  glass:
    "border border-zinc-900/8 bg-zinc-900/7 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_1px_2px_rgba(0,0,0,0.04)]",
  subtle: "bg-black/[0.045]",
};

export function LiquidRouteIndicator({
  layoutId = "sidebar-active-indicator",
  className = "",
  variant = "glass",
  children,
}: LiquidRouteIndicatorProps) {
  return (
    <motion.div
      layoutId={layoutId}
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] ${VARIANT_CLASSES[variant]} ${className}`}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 30,
        mass: 0.8,
      }}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0)_20%,rgba(255,255,255,0.35)_50%,rgba(255,255,255,0)_80%)] opacity-60" />
      {children}
    </motion.div>
  );
}
