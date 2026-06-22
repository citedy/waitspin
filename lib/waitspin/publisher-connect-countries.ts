export const WTS_PUBLISHER_CONNECT_COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "PT", label: "Portugal" },
  { code: "AU", label: "Australia" },
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Belgium" },
  { code: "BG", label: "Bulgaria" },
  { code: "CA", label: "Canada" },
  { code: "HR", label: "Croatia" },
  { code: "CY", label: "Cyprus" },
  { code: "CZ", label: "Czech Republic" },
  { code: "DK", label: "Denmark" },
  { code: "EE", label: "Estonia" },
  { code: "FI", label: "Finland" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "GI", label: "Gibraltar" },
  { code: "GR", label: "Greece" },
  { code: "HK", label: "Hong Kong SAR China" },
  { code: "HU", label: "Hungary" },
  { code: "IE", label: "Ireland" },
  { code: "IT", label: "Italy" },
  { code: "JP", label: "Japan" },
  { code: "LV", label: "Latvia" },
  { code: "LI", label: "Liechtenstein" },
  { code: "LT", label: "Lithuania" },
  { code: "LU", label: "Luxembourg" },
  { code: "MT", label: "Malta" },
  { code: "MX", label: "Mexico" },
  { code: "NL", label: "Netherlands" },
  { code: "NZ", label: "New Zealand" },
  { code: "NO", label: "Norway" },
  { code: "PL", label: "Poland" },
  { code: "RO", label: "Romania" },
  { code: "SG", label: "Singapore" },
  { code: "SK", label: "Slovakia" },
  { code: "SI", label: "Slovenia" },
  { code: "ES", label: "Spain" },
  { code: "SE", label: "Sweden" },
  { code: "CH", label: "Switzerland" },
  { code: "TH", label: "Thailand" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "GB", label: "United Kingdom" },
] as const;

export type WaitSpinPublisherConnectCountryCode =
  (typeof WTS_PUBLISHER_CONNECT_COUNTRIES)[number]["code"];

const WTS_PUBLISHER_CONNECT_COUNTRY_CODES = new Set<string>(
  WTS_PUBLISHER_CONNECT_COUNTRIES.map((country) => country.code),
);

export function normalizePublisherConnectCountryCode(
  value: unknown,
): WaitSpinPublisherConnectCountryCode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return WTS_PUBLISHER_CONNECT_COUNTRY_CODES.has(normalized)
    ? (normalized as WaitSpinPublisherConnectCountryCode)
    : null;
}

export function publisherConnectCountryLabel(
  code: string | null | undefined,
): string | null {
  const normalized = normalizePublisherConnectCountryCode(code);
  if (!normalized) return null;
  return (
    WTS_PUBLISHER_CONNECT_COUNTRIES.find((country) => country.code === normalized)
      ?.label ?? null
  );
}
