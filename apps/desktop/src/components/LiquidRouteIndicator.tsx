import { motion } from "motion/react";
import type { ReactNode } from "react";

export interface LiquidRouteIndicatorProps {
  layoutId?: string;
  className?: string;
  variant?: "glass" | "subtle" | "dark";
  children?: ReactNode;
}

export function LiquidRouteIndicator({
  layoutId = "sidebar-active-indicator",
  className = "",
  variant = "glass",
  children,
}: LiquidRouteIndicatorProps) {
  return (
    <motion.div
      layoutId={layoutId}
      className={`liquid-route-indicator liquid-route-indicator--${variant} ${className}`}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 30,
        mass: 0.8,
      }}
      aria-hidden="true"
    >
      <div className="liquid-route-shimmer" />
      {children}
    </motion.div>
  );
}
