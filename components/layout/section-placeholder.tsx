export function SectionPlaceholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="max-w-xl space-y-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Coming next
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  )
}
