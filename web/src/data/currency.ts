// Currency formatter. App is ZAR-only at MVP — kept centralised so swapping
// later is a one-file change.
export const APP_CURRENCY = 'ZAR' as const;
export const APP_LOCALE = 'en-ZA';

const formatter = new Intl.NumberFormat(APP_LOCALE, {
  style: 'currency',
  currency: APP_CURRENCY,
});

export function formatMoney(amount: number): string {
  return formatter.format(amount);
}
