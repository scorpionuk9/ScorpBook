// UK VAT registration numbers: 9 digits, optionally written with a "GB"
// prefix and spaces. The check digits (last two) use HMRC's weighted
// modulus 97 rule, or its "modulus 9755" variant for newer numbers.

export function normaliseVatNumber(input: string): string {
  return input.toUpperCase().replace(/^GB/, "").replace(/[\s-]/g, "");
}

export function isValidVatNumber(vrn: string): boolean {
  if (!/^\d{9}$/.test(vrn)) return false;
  const digits = vrn.split("").map(Number);
  const weighted = digits.slice(0, 7).reduce((sum, digit, index) => sum + digit * (8 - index), 0);
  const check = digits[7] * 10 + digits[8];
  return (weighted + check) % 97 === 0 || (weighted + check + 55) % 97 === 0;
}

export function formatVatNumber(vrn: string): string {
  return `GB ${vrn.slice(0, 3)} ${vrn.slice(3, 7)} ${vrn.slice(7)}`;
}
