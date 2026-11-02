import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function WidgetFrame({
  title,
  href,
  action,
  children,
  className,
}: {
  title: string
  href?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex h-full min-h-[240px] flex-col rounded-xl border border-border bg-card",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        {href ? (
          <Link href={href} className="text-sm font-medium tracking-tight hover:underline">
            {title}
          </Link>
        ) : (
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        )}
        {action}
      </header>
      <div className="flex-1 px-4 pb-4">{children}</div>
    </section>
  )
}
