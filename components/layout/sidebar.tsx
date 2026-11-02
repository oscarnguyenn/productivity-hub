"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { brand, primaryNav, secondaryNav, type NavItem } from "@/lib/navigation"
import { cn } from "@/lib/utils"

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  )
}

export function Sidebar({
  onNavigate,
  className,
}: {
  onNavigate?: () => void
  className?: string
}) {
  const Mark = brand.mark

  return (
    <aside
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
        className
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="flex size-7 items-center justify-center rounded-md border border-sidebar-border bg-background">
          <Mark className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{brand.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">Personal OS</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-6 px-3 py-2">
        <div className="space-y-0.5">
          {primaryNav.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="mt-auto space-y-0.5 pb-3">
          {secondaryNav.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>
    </aside>
  )
}
