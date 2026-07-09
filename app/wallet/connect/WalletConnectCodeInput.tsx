"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from "react";

const WTS_PAYOUT_CODE_LENGTH = 6;
const WTS_PAYOUT_CODE_SLOT_NAMES = Array.from(
  { length: WTS_PAYOUT_CODE_LENGTH },
  (_, index) => `code_digit_${index + 1}`,
);

export function WalletConnectCodeInput() {
  const helpId = useId();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [digits, setDigits] = useState<string[]>(emptyCodeDigits);
  const code = digits.join("");

  function focusDigit(index: number) {
    inputRefs.current[Math.min(index, WTS_PAYOUT_CODE_LENGTH - 1)]?.focus();
  }

  function replaceCode(value: string, focusIndex = value.length) {
    const next = normalizeCode(value);
    setDigits(splitCode(next));
    if (next.length > 0) requestAnimationFrame(() => focusDigit(focusIndex));
  }

  function updateDigit(index: number, value: string) {
    const nextDigits = normalizeCode(value);
    if (nextDigits.length > 1) {
      replaceCode(nextDigits, nextDigits.length - 1);
      return;
    }
    const parts = digits.slice();
    parts[index] = nextDigits;
    setDigits(parts);
    if (nextDigits && index < WTS_PAYOUT_CODE_LENGTH - 1) {
      requestAnimationFrame(() => focusDigit(index + 1));
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Backspace" || digits[index]) return;
    if (index > 0) requestAnimationFrame(() => focusDigit(index - 1));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedCode = normalizeCode(event.clipboardData.getData("text"));
    if (!pastedCode) return;
    event.preventDefault();
    replaceCode(pastedCode, pastedCode.length - 1);
  }

  return (
    <label className="waitspin-otp-label">
      6-digit code
      <span id={helpId}>Use the latest WaitSpin payout setup code.</span>
      <input type="hidden" name="code" value={code} />
      <span className="waitspin-otp-control">
        {WTS_PAYOUT_CODE_SLOT_NAMES.map((slotName, index) => (
          <input
            ref={(node) => {
              inputRefs.current[index] = node;
            }}
            aria-describedby={helpId}
            aria-label={`Code digit ${index + 1} of ${WTS_PAYOUT_CODE_LENGTH}`}
            aria-required="true"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            className="waitspin-otp-cell"
            data-filled={digits[index] ? "true" : "false"}
            enterKeyHint="done"
            key={slotName}
            inputMode="numeric"
            maxLength={index === 0 ? WTS_PAYOUT_CODE_LENGTH : 1}
            name={slotName}
            pattern="[0-9]*"
            type="text"
            value={digits[index] ?? ""}
            onChange={(event) => updateDigit(index, event.currentTarget.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
          />
        ))}
      </span>
    </label>
  );
}

function normalizeCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, WTS_PAYOUT_CODE_LENGTH);
}

function emptyCodeDigits(): string[] {
  return Array.from({ length: WTS_PAYOUT_CODE_LENGTH }, () => "");
}

function splitCode(value: string): string[] {
  const parts = emptyCodeDigits();
  normalizeCode(value)
    .split("")
    .forEach((digit, index) => {
      parts[index] = digit;
    });
  return parts;
}
