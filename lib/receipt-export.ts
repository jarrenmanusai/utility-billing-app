import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { formatLongDate } from "@/lib/date-parse";
import { formatPHP } from "@/lib/format";
import { APP_NAME } from "@/constants/app-version";

/**
 * Receipt export helper.
 *
 * Why a separate module: the BillReceipt component renders into React Native
 * Views which cannot be directly serialized to PDF. Instead we re-render the
 * same data as a small piece of HTML and hand it to expo-print, which uses
 * the native PDF renderer on iOS/Android and `window.print()` on web.
 *
 * On native we then surface the file via expo-sharing so the user can save
 * to Files / Photos / send via Messenger / email — basically anywhere their
 * OS share sheet leads.
 */

type Status = "draft" | "deployed" | "paid";

interface Person {
  name?: string | null;
  email?: string | null;
}

interface Item {
  utility?: { name: string; unit: string } | null;
  previousReading: string | number;
  currentReading: string | number;
  consumption: string | number;
  rate: string | number;
  amount: string | number;
}

interface Payment {
  proofUrl: string;
  note?: string | null;
  uploadedAt: Date | string;
}

interface Bill {
  id: number;
  status: Status;
  totalAmount: string | number;
  dueDate?: Date | string | null;
  notes?: string | null;
  deployedAt?: Date | string | null;
  paidAt?: Date | string | null;
  createdAt: Date | string;
}

export interface ReceiptExportInput {
  bill: Bill;
  items: Item[];
  landlord?: Person | null;
  tenant?: Person | null;
  payments?: Payment[];
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "—";
  return formatLongDate(d);
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a self-contained HTML document for the receipt.
 *
 * Inline styles only — expo-print PDF rendering on native does not always
 * fetch external stylesheets, and we want pixel-stable output.
 */
function buildHtml({ bill, items, landlord, tenant, payments }: ReceiptExportInput): string {
  const ref = String(bill.id).padStart(6, "0");
  const subtotal = items.reduce((sum, it) => sum + num(it.amount), 0);
  const total = num(bill.totalAmount);
  const status = bill.status.toUpperCase();
  const stampColor = bill.status === "paid" ? "#16a34a" : bill.status === "deployed" ? "#dc2626" : "#6b7280";

  const itemRows = items
    .map((it) => {
      const name = escape(it.utility?.name ?? "Utility");
      const unit = escape(it.utility?.unit ?? "");
      return `
        <tr>
          <td style="padding:6px 0;">
            <div style="font-weight:600;">${name}</div>
            <div style="color:#6b7280;font-size:11px;font-family:monospace;">
              ${num(it.previousReading)} → ${num(it.currentReading)} (${num(it.consumption)} ${unit}) × ₱${num(it.rate).toFixed(2)}
            </div>
          </td>
          <td style="text-align:right;font-family:monospace;font-weight:600;white-space:nowrap;">
            ${formatPHP(num(it.amount))}
          </td>
        </tr>`;
    })
    .join("");

  const paymentsHtml = (payments ?? [])
    .filter((p) => !!p.proofUrl)
    .map(
      (p) => `
        <div style="margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;">
          <div style="font-size:11px;color:#6b7280;">Payment proof — ${fmtDate(p.uploadedAt)}</div>
          ${p.note ? `<div style="font-size:12px;margin-top:4px;">${escape(p.note)}</div>` : ""}
        </div>`,
    )
    .join("");

  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <title>Receipt #${ref}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;margin:0;padding:24px;background:#fff;">
  <div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <div style="text-align:center;border-bottom:1px dashed #d1d5db;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:18px;font-weight:800;letter-spacing:2px;">${escape(APP_NAME).toUpperCase()}</div>
      <div style="font-family:monospace;font-size:12px;color:#6b7280;margin-top:4px;">REF #${ref}</div>
    </div>

    <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:12px;">
      <div style="flex:1;">
        <div style="font-size:10px;color:#6b7280;letter-spacing:1px;">ISSUED BY</div>
        <div style="font-weight:600;">${escape(landlord?.name ?? "—")}</div>
        ${landlord?.email ? `<div style="font-size:11px;color:#6b7280;">${escape(landlord.email)}</div>` : ""}
      </div>
      <div style="flex:1;">
        <div style="font-size:10px;color:#6b7280;letter-spacing:1px;">BILLED TO</div>
        <div style="font-weight:600;">${escape(tenant?.name ?? "—")}</div>
        ${tenant?.email ? `<div style="font-size:11px;color:#6b7280;">${escape(tenant.email)}</div>` : ""}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;font-size:12px;border-top:1px dashed #d1d5db;border-bottom:1px dashed #d1d5db;padding:8px 0;margin-bottom:12px;">
      <div><span style="color:#6b7280;">Issued </span>${fmtDate(bill.deployedAt ?? bill.createdAt)}</div>
      <div><span style="color:#6b7280;">Due </span>${fmtDate(bill.dueDate)}</div>
      ${bill.paidAt ? `<div><span style="color:#6b7280;">Paid </span>${fmtDate(bill.paidAt)}</div>` : ""}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${itemRows}
    </table>

    <div style="border-top:1px dashed #d1d5db;margin-top:12px;padding-top:8px;display:flex;justify-content:space-between;font-size:12px;color:#6b7280;">
      <div>Subtotal</div>
      <div style="font-family:monospace;">${formatPHP(subtotal)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;margin-top:6px;">
      <div>TOTAL DUE</div>
      <div style="font-family:monospace;">${formatPHP(total)}</div>
    </div>

    <div style="text-align:center;margin-top:16px;">
      <span style="display:inline-block;border:2px solid ${stampColor};color:${stampColor};padding:4px 12px;border-radius:4px;font-weight:800;letter-spacing:2px;transform:rotate(-2deg);">${status}</span>
    </div>

    ${bill.notes ? `<div style="margin-top:12px;font-size:12px;color:#374151;border-top:1px dashed #d1d5db;padding-top:8px;"><strong>Notes:</strong> ${escape(bill.notes)}</div>` : ""}
    ${paymentsHtml}

    <div style="text-align:center;font-family:monospace;font-size:11px;color:#9ca3af;margin-top:18px;">* * * END OF RECEIPT * * *</div>
  </div>
</body></html>`;
}

/**
 * Generate a PDF from the receipt and either share it (native) or open the
 * browser print dialog (web). On native, we always go through expo-sharing
 * so the user lands in their familiar share sheet, with "Save to Files",
 * "Save Image", Messenger, Mail, etc.
 */
export async function shareReceipt(input: ReceiptExportInput): Promise<void> {
  const html = buildHtml(input);

  if (Platform.OS === "web") {
    // expo-print on web opens a print dialog; the user can choose
    // "Save as PDF" or any installed printer. printAsync handles this.
    await Print.printAsync({ html });
    return;
  }

  // Native: render to a file then surface via the OS share sheet.
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Save or share receipt" });
  } else {
    // Some Android variants don't expose the Share API — fall back to
    // expo-print's print dialog which still produces a PDF.
    await Print.printAsync({ html });
  }
}
