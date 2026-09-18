"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function DesktopIdentity({ name, role }: { name: string; role: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById("desktop-identity-slot")); }, []);
  if (!target) return null;
  return createPortal(
    <div className="desktop-identity">
      <button className="desktop-avatar" aria-label="目前排程身分" aria-describedby="desktop-identity-tooltip">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      </button>
      <div id="desktop-identity-tooltip" role="tooltip"><strong>{name}</strong><span>{role}</span></div>
    </div>, target,
  );
}
