"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type UsageItem = {
  id: string;
  name: string;
  key: string;
  count: number;
};

export default function DashboardPage() {
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const maxCount = useMemo(
    () => usage.reduce((max, item) => Math.max(max, item.count), 0),
    [usage]
  );

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const loadUsage = async () => {
    setError(null);
    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/api-keys/usage", {
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Failed to load API usage.");
      setLoading(false);
      return;
    }

    const body = (await response.json()) as { usage: UsageItem[] };
    setUsage(body.usage ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadUsage();
  }, []);

  return (
    <section className="section">
      <h2>Dashboard</h2>
      <p>Overview of your HTML to PDF activity.</p>
      <div className="card" style={{ marginTop: "24px" }}>
        <h3>API consumption</h3>
        <p>Monthly usage by API key.</p>
        {loading ? <p>Loading usage...</p> : null}
        {error ? <p className="notice">{error}</p> : null}
        {!loading && !error ? (
          <div className="usage-chart">
            {usage.length ? (
              usage.map((item) => {
                const percent = maxCount ? Math.round((item.count / maxCount) * 100) : 0;
                return (
                  <div key={item.id} className="usage-row">
                    <div className="usage-meta">
                      <span>{item.name}</span>
                      <span>{item.count} calls</span>
                    </div>
                    <div className="usage-track">
                      <div
                        className="usage-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p>No API usage recorded yet.</p>
            )}
          </div>
        ) : null}
      </div>
      <div className="grid" style={{ marginTop: "24px" }}>
        <div className="card">
          <h3>New conversion</h3>
          <p>Upload HTML or a zip for bulk conversions.</p>
        </div>
        <div className="card">
          <h3>Recent jobs</h3>
          <p>Track status, download PDFs, or retry failed items.</p>
        </div>
        <div className="card">
          <h3>API keys</h3>
          <p>Rotate keys and set webhook endpoints.</p>
        </div>
      </div>
    </section>
  );
}
