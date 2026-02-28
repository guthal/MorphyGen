"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type PaymentItem = {
  id: string;
  provider: "paypal" | "razorpay";
  status: string;
  amount: string;
  currency: string;
  time: string;
  receiptId?: string;
  invoiceUrl?: string | null;
};

const formatAmount = (amount: string, currency: string) => {
  const value = Number(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
};

export default function InvoicesPage() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [emailingReceiptId, setEmailingReceiptId] = useState<string | null>(null);

  const getAuthToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? null;
  };

  useEffect(() => {
    const loadPayments = async () => {
      setError(null);
      const token = await getAuthToken();
      if (!token) {
        setError("No active session found.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/billing/payments", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Failed to load payments.");
        setLoading(false);
        return;
      }

      const body = (await response.json()) as { payments: PaymentItem[] };
      setPayments(body.payments ?? []);
      setLoading(false);
    };

    loadPayments();
  }, []);

  const formatDateUtc = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });

  const downloadReceipt = async (receiptId: string) => {
    setNotice(null);
    setDownloadingReceiptId(receiptId);
    try {
      const token = await getAuthToken();
      if (!token) {
        setNotice("Please sign in again to download receipts.");
        return;
      }

      const response = await fetch(
        `/api/billing/paypal/receipts/${encodeURIComponent(receiptId)}/pdf`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to download receipt.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${receiptId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to download receipt.");
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const emailReceipt = async (receiptId: string) => {
    setNotice(null);
    setEmailingReceiptId(receiptId);
    try {
      const token = await getAuthToken();
      if (!token) {
        setNotice("Please sign in again to email receipts.");
        return;
      }

      const response = await fetch(
        `/api/billing/paypal/receipts/${encodeURIComponent(receiptId)}/email`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to email receipt.");
      }

      setNotice("Receipt emailed successfully.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to email receipt.");
    } finally {
      setEmailingReceiptId(null);
    }
  };

  return (
    <section className="section">
      <h2>Invoices</h2>
      <p>Track your subscription transactions and invoice history.</p>
      {notice ? <p className="notice">{notice}</p> : null}
      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Payment history</h3>
        <p>All subscription transactions across payment providers.</p>
        {loading ? <p>Loading payments...</p> : null}
        {error ? <p className="notice">{error}</p> : null}
        {!loading && !error ? (
          <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
            {payments.length ? (
              payments.map((payment) => (
                <div key={`${payment.provider}-${payment.id}`} className="card">
                  <div className="usage-meta" style={{ marginBottom: "8px" }}>
                    <span>
                      {payment.provider === "paypal" ? "PayPal" : "Razorpay"} ·{" "}
                      {payment.id}
                    </span>
                    <span>{payment.status}</span>
                  </div>
                  <div className="usage-meta">
                    <span>{payment.time ? formatDateUtc(payment.time) : "—"}</span>
                    <span>{formatAmount(payment.amount, payment.currency)}</span>
                  </div>
                  <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {payment.provider === "paypal" ? (
                      <>
                        <button
                          className="button"
                          type="button"
                          disabled={downloadingReceiptId === payment.id}
                          onClick={() => downloadReceipt(payment.id)}
                        >
                          {downloadingReceiptId === payment.id ? "Downloading..." : "Download PDF"}
                        </button>
                        <button
                          className="button"
                          type="button"
                          disabled={emailingReceiptId === payment.id}
                          onClick={() => emailReceipt(payment.id)}
                        >
                          {emailingReceiptId === payment.id ? "Sending..." : "Email receipt"}
                        </button>
                      </>
                    ) : payment.invoiceUrl ? (
                      <a className="button" href={payment.invoiceUrl} target="_blank">
                        View invoice
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="card">
                <p>No transactions found yet.</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
