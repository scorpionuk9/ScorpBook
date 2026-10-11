import Decimal from "decimal.js";

// Formats an exact decimal as pounds for plain-language views, e.g. "£1,234.50" or "-£20.00".
export function formatMoney(value: Decimal.Value): string {
  const amount = new Decimal(value);
  const [whole, fraction] = amount.abs().toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const negative = amount.lt(0) && /[1-9]/.test(whole + fraction);
  return `${negative ? "-" : ""}£${grouped}.${fraction}`;
}
