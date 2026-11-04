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
    "liquid-glass-fx border border-white/90 bg-[linear-gradient(165deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.68)_52%,rgba(248,250,252,0.86)_100%)] backdrop-blur-md backdrop-saturate-180 shadow-[0_0_0_0.5px_rgba(15,23,42,0.07),0_3px_8px_-1.5px_rgba(15,23,42,0.10),0_1px_2px_rgba(15,23,42,0.05),inset_0_1.5px_1px_rgba(255,255,255,1),inset_0_-1px_1.5px_rgba(255,255,255,0.85)]",
  subtle: "bg-surface-subtle",
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
      <div className="liquid-glass-sheen pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_25%_10%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.35)_42%,rgba(148,163,184,0.08)_72%,rgba(255,255,255,0.45)_100%)] opacity-85" />
      <div className="liquid-glass-sheen pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0)_22%,rgba(255,255,255,0.75)_48%,rgba(255,255,255,0)_74%)] opacity-70" />
      {children}
    </motion.div>
  );
}
