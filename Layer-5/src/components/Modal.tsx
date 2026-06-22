import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** id of the element labelling the dialog (for aria-labelledby). */
  labelledBy?: string;
  closeLabel?: string;
}

/**
 * Lightweight accessible modal: portals to <body>, closes on backdrop click
 * and Escape, locks background scroll while open, and stops propagation so
 * clicks inside the card don't dismiss it.
 */
export function Modal({ onClose, children, labelledBy, closeLabel = "Close" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
