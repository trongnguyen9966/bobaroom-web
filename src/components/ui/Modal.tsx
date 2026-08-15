"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  const sizeClass = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
      className="backdrop:bg-black/40 bg-transparent p-0 m-0 max-h-dvh max-w-dvw w-full h-full"
    >
      {/* Mobile: bottom sheet. Desktop: centered dialog */}
      <div className="flex items-end sm:items-center justify-center min-h-full">
        <div
          className={`bg-white w-full ${sizeClass} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85dvh] flex flex-col`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle bar (mobile only) */}
          <div className="sm:hidden flex justify-center pt-3">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
          {title && (
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
          )}
          <div className="flex-1 overflow-auto px-5 pb-5">
            {children}
          </div>
        </div>
      </div>
    </dialog>
  );
}
