"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

type ProfileRow = {
  full_name: string | null;
  company_name: string | null;
  vat_number: string | null;
  company_address: string | null;
  country: string | null;
  billing_email: string | null;
};

const WEBHOOK_EVENT_TYPES = [
  "job.started",
  "job.succeeded",
  "job.failed",
];

export default function SettingsPage() {
  const [formState, setFormState] = useState({
    fullName: "Vishveshwara Guthal Gowda",
    email: "vishveshwaraguthal@gmail.com",
    companyName: "",
    vatNumber: "",
    companyAddress: "",
    country: "",
    billingEmail: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(true);
  const [webhookNotice, setWebhookNotice] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookHasSecret, setWebhookHasSecret] = useState(false);
  const [rotateSecret, setRotateSecret] = useState(false);
  const [enabledEventTypes, setEnabledEventTypes] = useState<string[]>([
    "job.succeeded",
    "job.failed",
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "full_name,company_name,vat_number,company_address,country,billing_email"
        )
        .eq("user_id", user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        if (isMounted) {
          setError(profileError.message);
          setLoading(false);
        }
        return;
      }

      if (!profile) {
        await supabase.from("profiles").insert({
          user_id: user.id,
          full_name: user.user_metadata?.full_name ?? null,
        });
      }

      if (isMounted) {
        setFormState((prev) => ({
          ...prev,
          fullName: profile?.full_name ?? prev.fullName ?? "",
          email: user.email ?? prev.email ?? "",
          companyName: profile?.company_name ?? "",
          vatNumber: profile?.vat_number ?? "",
          companyAddress: profile?.company_address ?? "",
          country: profile?.country ?? "",
          billingEmail: profile?.billing_email ?? "",
        }));
        setLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  useEffect(() => {
    let isMounted = true;

    const loadWebhookConfig = async () => {
      setWebhookError(null);
      const headers = await getAuthHeaders();
      if (!headers) {
        if (isMounted) {
          setWebhookError("No active session found.");
          setWebhookLoading(false);
        }
        return;
      }

      const response = await fetch("/api/webhooks", { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (isMounted) {
          setWebhookError(body.error || "Failed to load webhooks.");
          setWebhookLoading(false);
        }
        return;
      }

      const body = (await response.json()) as {
        webhookUrl: string | null;
        enabledEventTypes: string[];
        hasWebhookSecret: boolean;
      };

      if (isMounted) {
        setWebhookUrl(body.webhookUrl ?? "");
        setEnabledEventTypes(body.enabledEventTypes ?? []);
        setWebhookHasSecret(Boolean(body.hasWebhookSecret));
        setWebhookLoading(false);
      }
    };

    loadWebhookConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (field: keyof typeof formState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleProfileSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setError("No active session found.");
      return;
    }

    const updates: ProfileRow = {
      full_name: formState.fullName.trim() || null,
      company_name: formState.companyName.trim() || null,
      vat_number: formState.vatNumber.trim() || null,
      company_address: formState.companyAddress.trim() || null,
      country: formState.country.trim() || null,
      billing_email: formState.billingEmail.trim() || null,
    };

    const { error: profileError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    if (formState.email && formState.email !== user.email) {
      const { error: emailError } = await supabase.auth.updateUser({
        email: formState.email,
      });
      if (emailError) {
        setError(emailError.message);
        return;
      }
      setNotice(
        "Profile updated. Please confirm your new email to finish the change."
      );
    } else {
      setNotice("Profile updated.");
    }
  };

  const handlePasswordSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (formState.newPassword || formState.confirmPassword) {
      if (formState.newPassword !== formState.confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (formState.newPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      const { error: passwordError } = await supabase.auth.updateUser({
        password: formState.newPassword,
      });
      if (passwordError) {
        setError(passwordError.message);
        return;
      }
      setFormState((prev) => ({
        ...prev,
        newPassword: "",
        confirmPassword: "",
      }));
      setNotice("Password updated.");
    } else {
      setError("Enter a new password to update.");
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    setNotice(null);

    const confirmed = window.confirm(
      "Are you sure? This will permanently delete your account."
    );
    if (!confirmed) return;

    const { error: deleteError } = await supabase.rpc("delete_user");
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const toggleEventType = (value: string) => {
    setEnabledEventTypes((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const handleWebhookSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWebhookError(null);
    setWebhookNotice(null);

    const headers = await getAuthHeaders();
    if (!headers) {
      setWebhookError("No active session found.");
      return;
    }

    const payload: {
      webhookUrl: string | null;
      enabledEventTypes: string[];
      webhookSecret?: string | null;
    } = {
      webhookUrl: webhookUrl.trim() || null,
      enabledEventTypes,
    };

    if (rotateSecret) {
      payload.webhookSecret = webhookSecret.trim() || null;
    }

    const response = await fetch("/api/webhooks", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setWebhookError(body.error || "Failed to update webhooks.");
      return;
    }

    const body = (await response.json()) as {
      hasWebhookSecret: boolean;
      webhookUrl: string | null;
      enabledEventTypes: string[];
    };

    setWebhookUrl(body.webhookUrl ?? "");
    setEnabledEventTypes(body.enabledEventTypes ?? []);
    setWebhookHasSecret(Boolean(body.hasWebhookSecret));
    setWebhookSecret("");
    setRotateSecret(false);
    setWebhookNotice("Webhook settings updated.");
  };

  const handleWebhookTest = async () => {
    setWebhookError(null);
    setWebhookNotice(null);

    const headers = await getAuthHeaders();
    if (!headers) {
      setWebhookError("No active session found.");
      return;
    }

    const response = await fetch("/api/webhooks/test", {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setWebhookError(body.error || "Webhook test failed.");
      return;
    }

    setWebhookNotice("Webhook test succeeded.");
  };

  if (loading) {
    return (
      <section className="section">
        <h2>Update your account</h2>
        <p>Loading settings...</p>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>Update your account</h2>
      <div className="settings-stack">
        <form className="settings-card" onSubmit={handleProfileSubmit}>
          <h3>Profile details</h3>
          <div className="settings-grid">
            <div className="settings-field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                value={formState.fullName}
                onChange={(event) => handleChange("fullName", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={formState.email}
                onChange={(event) => handleChange("email", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="companyName">Company name</label>
              <input
                id="companyName"
                type="text"
                placeholder="Company name"
                value={formState.companyName}
                onChange={(event) =>
                  handleChange("companyName", event.target.value)
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="vatNumber">EU VAT number</label>
              <input
                id="vatNumber"
                type="text"
                placeholder="Your European VAT number"
                value={formState.vatNumber}
                onChange={(event) => handleChange("vatNumber", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="companyAddress">Company address</label>
              <input
                id="companyAddress"
                type="text"
                placeholder="Your company address, city and zipcode."
                value={formState.companyAddress}
                onChange={(event) =>
                  handleChange("companyAddress", event.target.value)
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="country">Country</label>
              <input
                id="country"
                type="text"
                value={formState.country}
                onChange={(event) => handleChange("country", event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="billingEmail">Billing email (if different)</label>
              <input
                id="billingEmail"
                type="email"
                placeholder="Your billing email"
                value={formState.billingEmail}
                onChange={(event) =>
                  handleChange("billingEmail", event.target.value)
                }
              />
            </div>
          </div>

          {notice ? <p className="notice">{notice}</p> : null}
          {error ? <p className="notice">{error}</p> : null}

          <div className="settings-actions">
            <button className="button primary" type="submit">
              Update your details
            </button>
          </div>
        </form>

        <form className="settings-card" onSubmit={handlePasswordSubmit}>
          <h3>Change your password</h3>
          <div className="settings-grid">
            <div className="settings-field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                placeholder="Your new password"
                value={formState.newPassword}
                onChange={(event) =>
                  handleChange("newPassword", event.target.value)
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="confirmPassword">Confirm your new password</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                value={formState.confirmPassword}
                onChange={(event) =>
                  handleChange("confirmPassword", event.target.value)
                }
              />
            </div>
          </div>

          <div className="settings-actions">
            <button className="button primary" type="submit">
              Update password
            </button>
          </div>
        </form>

        <form className="settings-card" onSubmit={handleWebhookSave}>
          <h3>Webhooks</h3>
          <p>Send events to your endpoint when jobs complete or fail.</p>
          {webhookLoading ? (
            <p>Loading webhook settings...</p>
          ) : (
            <>
              <div className="settings-grid">
                <div className="settings-field">
                  <label htmlFor="webhookUrl">Webhook URL (HTTPS)</label>
                  <input
                    id="webhookUrl"
                    type="url"
                    placeholder="https://example.com/webhook"
                    value={webhookUrl}
                    onChange={(event) => setWebhookUrl(event.target.value)}
                  />
                </div>
                <div className="settings-field">
                  <label>Event types</label>
                  <div className="settings-checkbox-row">
                    {WEBHOOK_EVENT_TYPES.map((eventType) => (
                      <label key={eventType} className="settings-checkbox">
                        <input
                          type="checkbox"
                          checked={enabledEventTypes.includes(eventType)}
                          onChange={() => toggleEventType(eventType)}
                        />
                        <span>{eventType}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="settings-field">
                  <label>Webhook secret</label>
                  <div className="settings-checkbox-row">
                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={rotateSecret}
                        onChange={(event) => setRotateSecret(event.target.checked)}
                      />
                      <span>{webhookHasSecret ? "Rotate secret" : "Set secret"}</span>
                    </label>
                  </div>
                  {rotateSecret ? (
                    <input
                      type="text"
                      placeholder="whsec_..."
                      value={webhookSecret}
                      onChange={(event) => setWebhookSecret(event.target.value)}
                    />
                  ) : (
                    <p className="field-hint">
                      {webhookHasSecret
                        ? "A secret is already set."
                        : "No secret set yet."}
                    </p>
                  )}
                </div>
              </div>
              {webhookNotice ? <p className="notice">{webhookNotice}</p> : null}
              {webhookError ? <p className="notice">{webhookError}</p> : null}
              <div className="settings-actions">
                <button className="button primary" type="submit">
                  Save webhook settings
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={handleWebhookTest}
                >
                  Send test webhook
                </button>
              </div>
            </>
          )}
        </form>

        <div className="settings-card danger-card">
          <h3>Delete my account</h3>
          <p>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <button className="danger-button" type="button" onClick={handleDeleteAccount}>
            Delete my account
          </button>
        </div>
      </div>
    </section>
  );
}
