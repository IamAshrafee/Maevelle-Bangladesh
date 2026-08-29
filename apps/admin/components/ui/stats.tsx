import * as React from "react"
import { cn } from "@/lib/utils"

const Stats = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <section
    ref={ref}
    className={cn(
      "grid grid-cols-2 md:grid-cols-4 rounded-[0.55rem] border bg-border gap-px overflow-hidden shadow-[0_1px_2px_rgb(16_42_34_/_4%)]",
      className
    )}
    {...props}
  />
))
Stats.displayName = "Stats"

const StatsCard = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <article
    ref={ref}
    className={cn(
      "min-w-0 py-[0.85rem] px-[1rem] bg-card",
      className
    )}
    {...props}
  />
))
StatsCard.displayName = "StatsCard"

const StatsTitle = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("block text-[0.65rem] text-muted-foreground", className)}
    {...props}
  />
))
StatsTitle.displayName = "StatsTitle"

const StatsValue = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <strong
    ref={ref}
    className={cn("block mt-[0.2rem] mb-[0.12rem] text-[clamp(1.05rem,2vw,1.42rem)] tracking-[-0.035em] font-bold truncate", className)}
    {...props}
  />
))
StatsValue.displayName = "StatsValue"

const StatsDescription = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <small
    ref={ref}
    className={cn("block text-[0.65rem] text-muted-foreground", className)}
    {...props}
  />
))
StatsDescription.displayName = "StatsDescription"

export { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription }
