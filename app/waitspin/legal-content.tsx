import type { ReactNode } from "react";

import { WaitSpinFooter, WaitSpinTextNav } from "./public-chrome";

export function WaitSpinLegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="waitspin-page waitspin-text-page">
      <WaitSpinTextNav />
      <article className="waitspin-text-article">
        <header className="waitspin-text-hero">
          <p className="waitspin-kicker">WaitSpin public contract</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="waitspin-text-status">
            Last updated: June 17, 2026. The public launch surface is CLI, REST
            API, verified publisher surfaces for VS Code, Claude Code, MiMo
            Code, OpenCode, and Grok Code CLI, public market, and guarded
            wallet/ledger/Connect/payout routes.
          </div>
        </header>
        <div className="waitspin-text-content">{children}</div>
      </article>
      <WaitSpinFooter />
    </main>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="waitspin-text-section">
      <h2>{title}</h2>
      <div className="waitspin-text-section-body">{children}</div>
    </section>
  );
}
