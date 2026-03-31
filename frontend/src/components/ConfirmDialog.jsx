import { useCallback, useEffect, useRef } from 'react'
import './ConfirmDialog.css'

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [open])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onCancel?.()
  }, [onCancel])

  if (!open) return null

  return (
    <dialog ref={dialogRef} className="confirm-dialog" onKeyDown={handleKeyDown} onClose={onCancel}>
      <div className="confirm-dialog-content">
        <h3 className="confirm-dialog-title">{title}</h3>
        {message && <p className="confirm-dialog-message">{message}</p>}
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onCancel}>{cancelLabel}</button>
          <button className={`confirm-dialog-btn ${variant}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
