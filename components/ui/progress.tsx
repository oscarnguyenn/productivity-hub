import { cn } from "@/lib/utils"

function Progress({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-foreground/80 transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { Progress }
