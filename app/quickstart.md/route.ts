import { waitSpinQuickstartMarkdownResponse } from "@/lib/waitspin/agent-docs";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return waitSpinQuickstartMarkdownResponse();
}
