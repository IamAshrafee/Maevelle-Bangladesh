import * as React from "react"
import { cn } from "@/lib/utils"

const Stats = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <section
    ref={ref}
    className={cn(
      "grid grid-cols-2 md:grid-cols-4 rounded-2xl border border-slate-200/80 bg-slate-200/60 gap-px overflow-hidden backdrop-blur-md shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.95),0_1px_3px_0_rgba(15,23,42,0.04)]",
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
      "min-w-0 py-4 px-5 bg-white/85 hover:bg-white/95 transition-all duration-150 relative group",
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
    className={cn("block text-[0.68rem] font-semibold text-muted-foreground uppercase tracking-wider", className)}
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
    className={cn("block mt-1 mb-1 text-[clamp(1.25rem,2.2vw,1.6rem)] tracking-tight font-bold text-foreground font-mono tabular-nums truncate", className)}
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
    className={cn("block text-[0.72rem] text-muted-foreground/90 font-normal", className)}
    {...props}
  />
))
StatsDescription.displayName = "StatsDescription"

export { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription }
