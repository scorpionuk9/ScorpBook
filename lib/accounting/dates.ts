export function accountingToday(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

// First day of the financial year containing `today`, given the year-end day and month.
export function financialYearStart(today: string, yearEndMonth: number, yearEndDay: number): string {
  const year = Number(today.slice(0, 4));
  const endThisYear = new Date(Date.UTC(year, yearEndMonth - 1, yearEndDay)).toISOString().slice(0, 10);
  const lastEnd = today > endThisYear ? endThisYear : new Date(Date.UTC(year - 1, yearEndMonth - 1, yearEndDay)).toISOString().slice(0, 10);
  return new Date(Date.parse(`${lastEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
