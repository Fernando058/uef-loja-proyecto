import { useState } from 'react'

interface ConfirmButtonProps {
  label: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
  className?: string
}

export function ConfirmButton({
  label,
  confirmLabel = 'Confirmar',
  onConfirm,
  className = 'button button-danger button-small',
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      window.setTimeout(() => setConfirming(false), 3500)
      return
    }
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <button type="button" className={className} disabled={busy} onClick={handleClick}>
      {busy ? 'Procesando…' : confirming ? confirmLabel : label}
    </button>
  )
}
