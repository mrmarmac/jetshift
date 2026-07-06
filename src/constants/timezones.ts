export interface TZOption {
  label: string;
  value: string;
}

export const TZ_OPTIONS: readonly TZOption[] = [
  { label: 'Melbourne', value: 'Australia/Melbourne' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Berlin', value: 'Europe/Berlin' },
];

/** Sentinel value for the free-text "Other (IANA)" fallback in TZ selects. */
export const TZ_OTHER = '__other__';
