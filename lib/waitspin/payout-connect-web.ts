import { z } from "zod";

import { getWaitSpinBaseUrl } from "@/lib/waitspin/domain";
import { normalizePublisherConnectCountryCode } from "@/lib/waitspin/publisher-connect-countries";

const sourceSchema = z
  .enum(["vscode", "docs", "web"])
  .optional()
  .catch(undefined);
const emailSchema = z.string().trim().email().max(320).transform((value) =>
  value.toLowerCase(),
);
const installIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-z0-9_-]+$/i)
  .optional()
  .catch(undefined);
const errorSchema = z
  .enum(["request_failed", "verify_failed", "country_mismatch"])
  .optional()
  .catch(undefined);
const countrySchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const countryCode = normalizePublisherConnectCountryCode(value);
    if (!countryCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported payout country",
      });
      return z.NEVER;
    }
    return countryCode;
  });
const optionalCountrySchema = z
  .string()
  .trim()
  .optional()
  .catch(undefined)
  .transform((value) => normalizePublisherConnectCountryCode(value) ?? undefined);

export type PayoutConnectForm = {
  email: string;
  countryCode: string;
  code?: string;
  source?: string;
  installId?: string;
};

export type PayoutConnectVerifyForm = PayoutConnectForm & {
  code: string;
};

export type PayoutConnectPageState = {
  source?: string;
  installId?: string;
  countryCode?: string;
  sent: boolean;
  connectState?: "return" | "refresh";
  error?: string;
};

export type PayoutConnectRedirectContext = {
  source?: string;
  installId?: string;
  countryCode?: string;
};

export function parsePayoutConnectRequestForm(formData: FormData): PayoutConnectForm {
  return {
    email: emailSchema.parse(requiredFormString(formData, "email")),
    countryCode: countrySchema.parse(requiredFormString(formData, "country")),
    source: sourceSchema.parse(optionalFormString(formData, "source")),
    installId: installIdSchema.parse(optionalFormString(formData, "install_id")),
  };
}

export function payoutConnectRedirectContextFromFormData(
  formData: FormData,
): PayoutConnectRedirectContext {
  return {
    source: sourceSchema.parse(optionalFormString(formData, "source")),
    installId: installIdSchema.parse(optionalFormString(formData, "install_id")),
    countryCode: optionalCountrySchema.parse(optionalFormString(formData, "country")),
  };
}

export function parsePayoutConnectVerifyForm(
  formData: FormData,
): PayoutConnectVerifyForm {
  return {
    ...parsePayoutConnectRequestForm(formData),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .parse(requiredFormString(formData, "code")),
  };
}

export function payoutConnectRedirectUrl(params: {
  source?: string;
  installId?: string;
  countryCode?: string;
  sent?: boolean;
  connectState?: "return" | "refresh";
  error?: string;
}): URL {
  const url = new URL("/wallet/connect", getWaitSpinBaseUrl());
  if (params.source) url.searchParams.set("source", params.source);
  if (params.installId) url.searchParams.set("install_id", params.installId);
  if (params.countryCode) url.searchParams.set("country", params.countryCode);
  if (params.sent) url.searchParams.set("sent", "1");
  if (params.connectState) url.searchParams.set("connect", params.connectState);
  if (params.error) url.searchParams.set("error", params.error);
  return url;
}

export function payoutConnectPageState(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): PayoutConnectPageState {
  return {
    source: sourceSchema.parse(optionalSearchString(searchParams, "source")),
    installId: installIdSchema.parse(optionalSearchString(searchParams, "install_id")),
    countryCode: optionalCountrySchema.parse(
      optionalSearchString(searchParams, "country"),
    ),
    sent: optionalSearchString(searchParams, "sent") === "1",
    connectState: z
      .enum(["return", "refresh"])
      .optional()
      .catch(undefined)
      .parse(optionalSearchString(searchParams, "connect")),
    error: errorSchema.parse(optionalSearchString(searchParams, "error")),
  };
}

export function allowsBrowserFormPost(fetchSite: string | null): boolean {
  return (
    fetchSite === null || fetchSite === "same-origin" || fetchSite === "none"
  );
}

function requiredFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return z.string().trim().min(1).max(320).parse(value);
}

function optionalFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalSearchString(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
}
