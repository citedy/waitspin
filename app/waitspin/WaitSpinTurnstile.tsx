"use client";

import { useEffect, useRef, useState } from "react";

const turnstileSiteKey =
  process.env.NEXT_PUBLIC_WAITSPIN_TURNSTILE_SITE_KEY?.trim() || "";
const WAITSPIN_TURNSTILE_SILENT_TIMEOUT_MS = 180_000;
const TURNSTILE_SCRIPT_WAIT_TIMEOUT_MS = 15_000;

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          "timeout-callback": () => void;
          theme: "light";
          appearance: "interaction-only";
          execution: "execute";
        },
      ) => string;
      execute: (widgetId?: string) => void;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export function useWaitSpinTurnstile() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const challengeRef = useRef<{
    timeoutId: number;
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const [token, setToken] = useState("");
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);

  function settleChallenge(error?: Error, nextToken = "") {
    const pending = challengeRef.current;
    challengeRef.current = null;
    if (pending) window.clearTimeout(pending.timeoutId);
    setActive(false);
    if (error) {
      pending?.reject(error);
      return;
    }
    if (nextToken) {
      pending?.resolve(nextToken);
      return;
    }
    pending?.reject(new Error("Security verification was dismissed."));
  }

  useEffect(() => {
    if (!turnstileSiteKey) {
      if (process.env.NODE_ENV === "development") setToken("dev-test-token");
      return;
    }

    let cancelled = false;

    function cleanupTurnstile() {
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = undefined;
      setReady(false);
      setActive(false);
      setToken("");
      settleChallenge(new Error("Security verification was cancelled."));
      if (widgetId) window.turnstile?.remove(widgetId);
    }

    function renderTurnstile() {
      if (
        cancelled ||
        !window.turnstile ||
        !containerRef.current ||
        widgetIdRef.current
      ) {
        return;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: turnstileSiteKey,
        callback: (nextToken) => {
          setToken(nextToken);
          settleChallenge(undefined, nextToken);
        },
        "expired-callback": () => {
          setToken("");
          settleChallenge(new Error("Security verification expired."));
        },
        "error-callback": () => {
          setToken("");
          settleChallenge(new Error("Security verification failed."));
        },
        "timeout-callback": () => {
          setToken("");
          settleChallenge(new Error("Security verification timed out."));
        },
        theme: "light",
        appearance: "interaction-only",
        execution: "execute",
      });
      setReady(true);
    }

    const scriptSrc =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptSrc}"]`,
    );
    if (existing) {
      const startedAt = Date.now();
      const interval = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(interval);
          renderTurnstile();
          return;
        }
        if (Date.now() - startedAt > TURNSTILE_SCRIPT_WAIT_TIMEOUT_MS) {
          window.clearInterval(interval);
          setReady(false);
        }
      }, 50);
      return () => {
        cancelled = true;
        window.clearInterval(interval);
        cleanupTurnstile();
      };
    }

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.onload = renderTurnstile;
    script.onerror = () => setReady(false);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      cleanupTurnstile();
    };
  }, []);

  function reset() {
    setToken("");
    window.turnstile?.reset(widgetIdRef.current);
  }

  function execute() {
    if (!turnstileSiteKey) return Promise.resolve("dev-test-token");
    if (!window.turnstile || !widgetIdRef.current) {
      return Promise.reject(new Error("Security check is still loading."));
    }

    return new Promise<string>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        settleChallenge(new Error("Security verification timed out."));
      }, WAITSPIN_TURNSTILE_SILENT_TIMEOUT_MS);
      challengeRef.current = { timeoutId, resolve, reject };
      setActive(true);
      setToken("");
      try {
        window.turnstile?.reset(widgetIdRef.current);
        window.turnstile?.execute(widgetIdRef.current);
      } catch {
        window.clearTimeout(timeoutId);
        setActive(false);
        challengeRef.current = null;
        reject(new Error("Security verification failed."));
      }
    });
  }

  const node = turnstileSiteKey ? (
    <div className={`waitspin-support-turnstile${active ? " is-active" : ""}`}>
      <div ref={containerRef} />
    </div>
  ) : null;

  return {
    active,
    execute,
    node,
    ready,
    required: Boolean(turnstileSiteKey),
    reset,
    token,
  };
}
