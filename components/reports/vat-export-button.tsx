"use client";

import type { VatBoxes } from "@/lib/accounting/service";

export function VatExportButton({ boxes, start, end }: { boxes: VatBoxes; start: string; end: string }) {
  function download() {
    const rows = [["Box", "Amount (GBP)"], ...Object.entries(boxes).map(([box, value]) => [box.replace("box", "Box "), value])];
    const csv = [`VAT return ${start} to ${end}`, ...rows.map((row) => row.join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `vat-return-${start}-to-${end}.csv` });
    link.click();
    URL.revokeObjectURL(url);
  }
  return <button type="button" className="button-secondary" onClick={download}>Download CSV</button>;
}
