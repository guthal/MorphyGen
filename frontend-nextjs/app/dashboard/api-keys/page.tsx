"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type ApiKeyRow = {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used_at?: string | null;
};

const maskKey = (value: string) => {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const hasKeys = useMemo(() => keys.length > 0, [keys.length]);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const loadKeys = async () => {
    setError(null);
    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/api-keys", {
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Failed to load API keys.");
      setLoading(false);
      return;
    }

    const body = (await response.json()) as { keys: ApiKeyRow[] };
    setKeys(body.keys ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async () => {
    setError(null);
    setNotice(null);
    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      return;
    }

    const response = await fetch("/api/api-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ name: `Key ${keys.length + 1}` }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Failed to create API key.");
      return;
    }

    const body = (await response.json()) as { key: ApiKeyRow };
    setKeys((prev) => [...prev, body.key]);
    setNotice("New API key created.");
  };

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setNotice("API key copied to clipboard.");
  };

  const startEdit = (item: ApiKeyRow) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setNotice(null);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (id: string) => {
    setError(null);
    setNotice(null);

    const trimmed = editingName.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      return;
    }

    const response = await fetch(`/api/api-keys/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ name: trimmed }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Failed to update API key.");
      return;
    }

    const body = (await response.json()) as { key: ApiKeyRow };
    setKeys((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: body.key.name } : item))
    );
    setNotice("API key name updated.");
    cancelEdit();
  };

  const revokeKey = async (id: string) => {
    setError(null);
    setNotice(null);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      return;
    }

    const response = await fetch(`/api/api-keys/${id}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || "Failed to revoke API key.");
      return;
    }

    setKeys((prev) => prev.filter((item) => item.id !== id));
    setNotice("API key revoked.");
  };

  if (loading) {
    return (
      <section className="section">
        <h2>API Keys</h2>
        <p>Loading keys...</p>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>API Keys</h2>
      <p>
        Manage your keys for single and bulk HTML to PDF conversions. Each
        account always has at least one active key.
      </p>
      <div className="api-key-actions">
        <button className="button primary" onClick={handleCreateKey}>
          Create new key
        </button>
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="notice">{error}</p> : null}
      <div className="api-key-grid">
        {hasKeys ? (
          keys.map((item) => (
            <div key={item.id} className="card api-key-card">
              <div className="api-key-header">
                {editingId === item.id ? (
                  <div className="api-key-edit">
                    <input
                      className="api-key-input"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                    <div className="api-key-edit-actions">
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => saveEdit(item.id)}
                      >
                        Save
                      </button>
                      <button className="button" type="button" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="api-key-title">
                      <h3>{item.name}</h3>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => startEdit(item)}
                        title="Edit name"
                        aria-label="Edit name"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    </div>
                    <div className="api-key-actions-row">
                      <button
                        className="button"
                        type="button"
                        onClick={() => handleCopy(item.key)}
                      >
                        Copy
                      </button>
                      <button
                        className="button danger"
                        type="button"
                        onClick={() => revokeKey(item.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </>
                )}
              </div>
              <p className="api-key-value">{maskKey(item.key)}</p>
              <div className="api-key-meta">
                <span>Created {new Date(item.created_at).toDateString()}</span>
                <span>
                  Last used{" "}
                  {item.last_used_at
                    ? new Date(item.last_used_at).toDateString()
                    : "Never"}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="card">
            <p>No API keys found. A default key will be created automatically.</p>
          </div>
        )}
      </div>
    </section>
  );
}
