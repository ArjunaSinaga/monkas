"use client";

import { useEffect, useRef } from "react";

/**
 * Popup: modal di desktop, bottom sheet di HP (lewat CSS .popup-kartu).
 * - ESC menutup
 * - klik scrim menutup
 * - fokus pindah ke elemen pertama saat buka, balik ke pemanggil saat tutup
 * - aria-modal + aria-labelledby
 */
export function Popup({ open, judul, lebar, onClose, children, footer }) {
  const ref = useRef(null);
  const pemanggil = useRef(null);
  const sebelumnya = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    sebelumnya.current = document.activeElement;
    const t = setTimeout(() => {
      const fokus = ref.current?.querySelector(
        "input:not([type=hidden]), select, textarea, button"
      );
      fokus?.focus();
    }, 40);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
      if (sebelumnya.current && sebelumnya.current.focus) sebelumnya.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll(
          "a[href], button:not([disabled]), input:not([type=hidden]), select, textarea"
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="popup-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"popup-kartu" + (lebar ? " popup-kartu-lebar" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="popup-judul"
        ref={ref}
      >
        <div className="popup-kepala">
          <h2 className="popup-judul" id="popup-judul">
            {judul}
          </h2>
          <button
            type="button"
            className="btn btn-icon"
            onClick={onClose}
            aria-label="Tutup"
            title="Tutup"
          >
            x
          </button>
        </div>
        <div className="stack">{children}</div>
        {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/** Kotak shortcut di homepage admin. */
export function Kotak({ judul, deskripsi, meta, ikon, onClick }) {
  return (
    <button type="button" className="kotak" onClick={onClick}>
      <span className="kotak-ikon" aria-hidden="true">
        {ikon}
      </span>
      <span className="kotak-judul">{judul}</span>
      <span className="kotak-desc">{deskripsi}</span>
      <span className="kotak-meta">
        <span>{meta}</span>
        <span aria-hidden="true">&rsaquo;</span>
      </span>
    </button>
  );
}
