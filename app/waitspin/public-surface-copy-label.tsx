"use client";

import { useEffect, useRef, useState } from "react";

export function PublicSurfaceCopyLabel({
  command,
  label,
}: {
  command: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  async function copyCommand() {
    try {
      let copiedWithClipboard = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(command);
          copiedWithClipboard = true;
        } catch {
          copiedWithClipboard = false;
        }
      }
      if (!copiedWithClipboard) {
        copiedWithClipboard = copyWithTextarea(command);
      }
      if (!copiedWithClipboard) {
        throw new Error("Copy command failed.");
      }
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      setCopied(true);
      resetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimeoutRef.current = null;
      }, 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className="waitspin-copy-label"
      title={`Copy install command: ${command}`}
      type="button"
      onClick={copyCommand}
    >
      <strong>{copied ? "Copied" : label}</strong>
    </button>
  );
}

function copyWithTextarea(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}
