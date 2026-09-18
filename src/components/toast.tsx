"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 2600);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div
      className={`app-toast ${message.kind}`}
      role={message.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <b>{message.title}</b>
      {message.detail && <span>{message.detail}</span>}
    </div>
  );
}
