"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type ApiKeyRow = {
  id: string;
  name: string;
  key: string;
};

type LogRow = {
  id: string;
  api_key: string;
  method: string;
  endpoint: string;
  status_code: number;
  latency_ms: number;
  input_type?: string | null;
  job_id?: string | null;
  error_message?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: string;
};

const getStatusMeta = (statusCode: number) => {
  if (statusCode >= 200 && statusCode < 300) {
    return { label: "Success", color: "#1f8f4d", bg: "#e6f6ed" };
  }
  if (statusCode >= 300 && statusCode < 400) {
    return { label: "Redirect", color: "#1d6fa5", bg: "#e6f1fb" };
  }
  if (statusCode >= 400 && statusCode < 500) {
    return { label: "Client Error", color: "#b45309", bg: "#fff4e6" };
  }
  return { label: "Server Error", color: "#b42318", bg: "#feeceb" };
};

const maskKey = (value: string) => {
  if (!value) return "";
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const keyNameByValue = useMemo(() => {
    const map = new Map<string, string>();
    keys.forEach((key) => {
      map.set(key.key, key.name);
    });
    return map;
  }, [keys]);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const loadLogs = async () => {
    setError(null);
    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setLoading(false);
      return;
    }

    const [logsRes, keysRes] = await Promise.all([
      fetch("/api/logs?limit=200", { headers }),
      fetch("/api/api-keys", { headers }),
    ]);

    if (!logsRes.ok) {
      const body = await logsRes.json().catch(() => ({}));
      setError(body.error || "Failed to load logs.");
      setLoading(false);
      return;
    }

    if (!keysRes.ok) {
      const body = await keysRes.json().catch(() => ({}));
      setError(body.error || "Failed to load API keys.");
      setLoading(false);
      return;
    }

    const logsBody = (await logsRes.json()) as { logs: LogRow[] };
    const keysBody = (await keysRes.json()) as { keys: ApiKeyRow[] };

    setLogs(logsBody.logs ?? []);
    setKeys(keysBody.keys ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <section className="section">
      <h2>API Logs</h2>
      <p>Audit history for API usage across /api/jobs/* endpoints.</p>
      {loading ? <p>Loading logs...</p> : null}
      {error ? <p className="notice">{error}</p> : null}
      {!loading && !error ? (
        <div
          style={{
            marginTop: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {logs.length ? (
            logs.map((log) => {
              const keyName = keyNameByValue.get(log.api_key);
              const displayName =
                keyName ?? `${log.method} ${log.endpoint}`;
              const statusMeta = getStatusMeta(log.status_code);
              return (
                <details key={log.id} className="card">
                  <summary style={{ listStyle: "none", cursor: "pointer" }}>
                    <div className="usage-meta">
                      <span>{displayName}</span>
                      <span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "2px 10px",
                            borderRadius: "999px",
                            background: statusMeta.bg,
                            color: statusMeta.color,
                            fontWeight: 600,
                          }}
                          title={`HTTP ${log.status_code}: ${statusMeta.label}`}
                        >
                          {log.status_code} {statusMeta.label}
                        </span>{" "}
                        ·{" "}
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  </summary>
                  <div style={{ marginTop: "12px" }}>
                    <div className="usage-meta" style={{ marginBottom: "8px" }}>
                      <span>
                        Key:{" "}
                        {keyName
                          ? `${keyName} (${maskKey(log.api_key)})`
                          : maskKey(log.api_key)}
                      </span>
                      <span>Latency: {log.latency_ms}ms</span>
                    </div>
                    <div className="usage-meta" style={{ marginBottom: "8px" }}>
                      <span>Input: {log.input_type ?? "N/A"}</span>
                      <span>Job: {log.job_id ?? "N/A"}</span>
                    </div>
                    {log.error_message ? (
                      <p className="notice">Error: {log.error_message}</p>
                    ) : null}
                    <div className="usage-meta" style={{ marginTop: "8px" }}>
                      <span>IP: {log.ip ?? "N/A"}</span>
                      <span>
                        UA:{" "}
                        {log.user_agent ? log.user_agent.slice(0, 96) : "N/A"}
                      </span>
                    </div>
                  </div>
                </details>
              );
            })
          ) : (
            <div className="card">
              <p>No API logs recorded yet.</p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
