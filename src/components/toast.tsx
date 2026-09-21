"use client";

import { useEffect, useRef } from "react";

export type ToastMessage = {
  id: number;
  kind: "success" | "error";
  title: string;
  detail?: string;
};

export default function Toast({
  message,
  onDismiss,
}: {
  message: ToastMessage | null;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismissRef.current(), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div
      className={`app-toast ${message.kind}`}
      role={message.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <button type="button" className="toast-close" aria-label="關閉提示" onClick={onDismiss}>×</button>
      <b>{message.title}</b>
      {message.detail && <span>{message.detail}</span>}
    </div>
  );
}
