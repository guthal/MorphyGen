"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type Invoice = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  issued_at?: number;
  short_url?: string;
};

const formatAmount = (amount: number, currency: string) => {
  const value = amount / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInvoices = async () => {
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("No active session found.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/billing/razorpay/invoices", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Failed to load invoices.");
        setLoading(false);
        return;
      }

      const body = (await response.json()) as { invoices: Invoice[] };
      setInvoices(body.invoices ?? []);
      setLoading(false);
    };

    loadInvoices();
  }, []);

  return (
    <section className="section">
      <h2>Invoices</h2>
      <p>Your Razorpay invoices will appear here once generated.</p>

      {loading ? <p>Loading invoices...</p> : null}
      {error ? <p className="notice">{error}</p> : null}

      {!loading && !error ? (
        <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
          {invoices.length ? (
            invoices.map((invoice) => (
              <div key={invoice.id} className="card">
                <div className="usage-meta" style={{ marginBottom: "8px" }}>
                  <span>Invoice {invoice.id}</span>
                  <span>{invoice.status}</span>
                </div>
                <div className="usage-meta">
                  <span>
                    {invoice.issued_at
                      ? new Date(invoice.issued_at * 1000).toLocaleDateString()
                      : "—"}
                  </span>
                  <span>
                    {formatAmount(invoice.amount, invoice.currency)}
                  </span>
                </div>
                {invoice.short_url ? (
                  <div style={{ marginTop: "12px" }}>
                    <a className="button" href={invoice.short_url} target="_blank">
                      View invoice
                    </a>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="card">
              <p>No invoices found yet.</p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
