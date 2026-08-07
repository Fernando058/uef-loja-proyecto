import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, title, onClose, children, width = 'md' }: ModalProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-card modal-${width}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  )
}
