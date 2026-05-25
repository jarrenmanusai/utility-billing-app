import { Image, Platform, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { formatPHP } from "@/lib/format";
import { formatLongDate } from "@/lib/date-parse";
import { APP_NAME } from "@/constants/app-version";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Receipt-style bill view shared by landlord and tenant detail screens.
 *
 * Renders a single visually-cohesive "paper receipt" card with:
 *  - Business header (app name + bill ref)
 *  - Issued by (landlord) / Billed to (tenant)
 *  - Period + dates (issued, due, paid)
 *  - Itemized line entries with prev → curr (consumption × rate)
 *  - Subtotal & TOTAL emphasized
 *  - Status footer (PAID / UNPAID stamp), optional notes
 *  - Optional reference meter photo and any uploaded payment proofs
 *
 * Designed to look like a printed receipt: monospaced numbers, dashed
 * dividers, generous spacing. Reads cleanly on both small phone screens
 * and wider desktop previews.
 */

type Status = "draft" | "deployed" | "paid";

interface Person {
  id: number;
  name?: string | null;
  email?: string | null;
}

interface ReceiptItem {
  id: number;
  utilityId: number;
  utility?: { id: number; name: string; unit: string } | null;
  previousReading: string | number;
  currentReading: string | number;
  consumption: string | number;
  rate: string | number;
  amount: string | number;
}

interface ReceiptPayment {
  id: number;
  proofUrl: string;
  note?: string | null;
  uploadedAt: Date | string;
}

interface ReceiptBill {
  id: number;
  status: Status;
  totalAmount: string | number;
  dueDate?: Date | string | null;
  meterPhotoUrl?: string | null;
  notes?: string | null;
  deployedAt?: Date | string | null;
  paidAt?: Date | string | null;
  createdAt: Date | string;
}

export interface BillReceiptProps {
  bill: ReceiptBill;
  items: ReceiptItem[];
  landlord?: Person | null;
  tenant?: Person | null;
  payments?: ReceiptPayment[];
  /** "landlord" or "tenant" — slightly tweaks labels (e.g. "Total" vs "Total due"). */
  viewer: "landlord" | "tenant";
}

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
});

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return isNaN(d.getTime()) ? null : d;
}

function asNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function fmtNum(v: string | number, digits = 2): string {
  return asNum(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function BillReceipt({ bill, items, landlord, tenant, payments, viewer }: BillReceiptProps) {
  const colors = useColors();
  const created = asDate(bill.createdAt);
  const deployed = asDate(bill.deployedAt);
  const due = asDate(bill.dueDate);
  const paid = asDate(bill.paidAt);
  const period = deployed ?? created;

  const resolveUrl = (url?: string | null) =>
    url ? (url.startsWith("/") ? `${getApiBaseUrl()}${url}` : url) : "";

  const subtotal = items.reduce((sum, it) => sum + asNum(it.amount), 0);
  const total = asNum(bill.totalAmount) || subtotal;

  const statusText = bill.status === "paid" ? "PAID" : bill.status === "deployed" ? "UNPAID" : "DRAFT";
  const statusColor =
    bill.status === "paid"
      ? colors.success
      : bill.status === "deployed"
        ? colors.warning
        : colors.muted;

  const Dashed = () => (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        borderStyle: "dashed",
        marginVertical: 10,
      }}
    />
  );

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 12, color: colors.text, fontFamily: MONO }}>{value}</Text>
    </View>
  );

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 18,
        // subtle paper feel
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      {/* Header */}
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, letterSpacing: 1 }}>
          {APP_NAME.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>UTILITY BILL RECEIPT</Text>
        <Text
          style={{
            fontSize: 11,
            color: colors.muted,
            marginTop: 2,
            fontFamily: MONO,
          }}
        >
          REF #{String(bill.id).padStart(6, "0")}
        </Text>
      </View>

      <Dashed />

      {/* Parties */}
      <View style={{ gap: 8 }}>
        <View>
          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>ISSUED BY</Text>
          <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>
            {landlord?.name || "Landlord"}
          </Text>
          {landlord?.email ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>{landlord.email}</Text>
          ) : null}
        </View>
        <View>
          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>BILLED TO</Text>
          <Text style={{ fontSize: 14, color: colors.text, fontWeight: "600" }}>
            {tenant?.name || "Tenant"}
          </Text>
          {tenant?.email ? (
            <Text style={{ fontSize: 12, color: colors.muted }}>{tenant.email}</Text>
          ) : null}
        </View>
      </View>

      <Dashed />

      {/* Dates */}
      <View>
        {period ? (
          <Row
            label="Period"
            value={period.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          />
        ) : null}
        <Row label="Issued" value={deployed ? formatLongDate(deployed) : "—"} />
        <Row label="Due" value={due ? formatLongDate(due) : "—"} />
        {paid ? <Row label="Paid" value={formatLongDate(paid)} /> : null}
      </View>

      <Dashed />

      {/* Line items */}
      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700" }}>ITEM</Text>
          <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "700" }}>AMOUNT</Text>
        </View>
        {items.length === 0 ? (
          <Text style={{ fontSize: 12, color: colors.muted, fontStyle: "italic" }}>
            No line items.
          </Text>
        ) : (
          items.map((it) => {
            const name = it.utility?.name ?? `Utility #${it.utilityId}`;
            const unit = it.utility?.unit ?? "";
            return (
              <View key={it.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: colors.text, fontWeight: "600", flex: 1 }}>
                    {name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.text,
                      fontWeight: "600",
                      fontFamily: MONO,
                    }}
                  >
                    {formatPHP(it.amount)}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.muted,
                    fontFamily: MONO,
                    marginTop: 2,
                  }}
                >
                  {fmtNum(it.previousReading, 2)} → {fmtNum(it.currentReading, 2)}{" "}
                  ({fmtNum(it.consumption, 2)} {unit}) × {formatPHP(it.rate)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <Dashed />

      {/* Totals */}
      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>Subtotal</Text>
          <Text style={{ fontSize: 12, color: colors.text, fontFamily: MONO }}>
            {formatPHP(subtotal)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
            {viewer === "tenant" ? "TOTAL DUE" : "TOTAL"}
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: colors.tint,
              fontFamily: MONO,
            }}
          >
            {formatPHP(total)}
          </Text>
        </View>
      </View>

      <Dashed />

      {/* Status stamp */}
      <View style={{ alignItems: "center", marginTop: 4, marginBottom: 4 }}>
        <View
          style={{
            borderWidth: 2,
            borderColor: statusColor,
            borderRadius: 6,
            paddingHorizontal: 14,
            paddingVertical: 6,
            transform: [{ rotate: "-4deg" }],
          }}
        >
          <Text
            style={{
              color: statusColor,
              fontSize: 18,
              fontWeight: "800",
              letterSpacing: 3,
              fontFamily: MONO,
            }}
          >
            {statusText}
          </Text>
        </View>
        {paid ? (
          <Text style={{ fontSize: 10, color: colors.muted, marginTop: 6 }}>
            Confirmed on {formatLongDate(paid)}
          </Text>
        ) : null}
      </View>

      {bill.notes ? (
        <>
          <Dashed />
          <View>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600", marginBottom: 4 }}>
              NOTES
            </Text>
            <Text style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}>{bill.notes}</Text>
          </View>
        </>
      ) : null}

      {bill.meterPhotoUrl ? (
        <>
          <Dashed />
          <View>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600", marginBottom: 6 }}>
              METER PHOTO
            </Text>
            <Image
              source={{ uri: resolveUrl(bill.meterPhotoUrl) }}
              style={{ width: "100%", height: 200, borderRadius: 10 }}
              resizeMode="cover"
            />
          </View>
        </>
      ) : null}

      {payments && payments.length > 0 ? (
        <>
          <Dashed />
          <View>
            <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600", marginBottom: 6 }}>
              PAYMENT PROOF{payments.length > 1 ? "S" : ""}
            </Text>
            {payments.map((p) => {
              const sent = asDate(p.uploadedAt);
              return (
                <View key={p.id} style={{ marginBottom: 10 }}>
                  <Image
                    source={{ uri: resolveUrl(p.proofUrl) }}
                    style={{ width: "100%", height: 200, borderRadius: 10 }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                    Sent {sent ? formatLongDate(sent) : "—"}
                  </Text>
                  {p.note ? (
                    <Text style={{ fontSize: 12, color: colors.text, marginTop: 2 }}>{p.note}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <Dashed />

      {/* Footer */}
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: colors.muted, fontFamily: MONO }}>
          {`* * * END OF RECEIPT * * *`}
        </Text>
        <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
          Generated by {APP_NAME}
        </Text>
      </View>
    </View>
  );
}
