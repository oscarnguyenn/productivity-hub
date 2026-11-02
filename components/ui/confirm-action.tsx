"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ConfirmAction({
  children,
  title,
  description,
  confirmLabel = "Delete",
  confirmationText,
  onConfirm,
}: {
  children: (openConfirmation: () => void) => ReactNode
  title: string
  description: string
  confirmLabel?: string
  confirmationText?: string
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const [typedText, setTypedText] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const confirm = () => {
    if (confirmationText && typedText !== confirmationText) return
    onConfirm()
    setOpen(false)
  }

  return (
    <>
      {children(() => {
        setTypedText("")
        setOpen(true)
      })}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
        onCancel={(event) => {
          event.preventDefault()
          setOpen(false)
        }}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4 p-5">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
            <p id={`${id}-description`} className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          {confirmationText && (
            <label className="block space-y-1.5 text-sm">
              <span>Type <strong>{confirmationText}</strong> to continue</span>
              <Input
                autoComplete="off"
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={Boolean(confirmationText && typedText !== confirmationText)}
              onClick={confirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
