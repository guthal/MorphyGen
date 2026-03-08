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
    fullName: "",
    companyName: "",
    vatNumber: "",
    companyAddress: "",
    country: "",
    billingEmail: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [currentEmail, setCurrentEmail] = useState("");
  const [emailForm, setEmailForm] = useState({ nextEmail: "" });
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [showEmailHelpModal, setShowEmailHelpModal] = useState(false);
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
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingPlanCode, setBillingPlanCode] = useState<string>("free");
  const [billingStatus, setBillingStatus] = useState<string>("FREE");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

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
        const nextEmail = ((user as unknown as { new_email?: string }).new_email ?? null) || null;
        setFormState((prev) => ({
          ...prev,
          fullName: profile?.full_name ?? prev.fullName ?? "",
          companyName: profile?.company_name ?? "",
          vatNumber: profile?.vat_number ?? "",
          companyAddress: profile?.company_address ?? "",
          country: profile?.country ?? "",
          billingEmail: profile?.billing_email ?? "",
        }));
        setCurrentEmail(user.email ?? "");
        setPendingEmail(nextEmail);
        setLoading(false);
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const nextEmail = ((user as unknown as { new_email?: string }).new_email ?? null) || null;
      setCurrentEmail(user.email ?? "");
      setPendingEmail(nextEmail);
    });

    return () => {
      subscription.unsubscribe();
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

    const loadBilling = async () => {
      setCancelError(null);
      const headers = await getAuthHeaders();
      if (!headers) {
        if (isMounted) {
          setBillingPlanCode("free");
          setBillingStatus("FREE");
          setBillingLoading(false);
        }
        return;
      }

      const response = await fetch("/api/billing/usage", { headers });
      if (!response.ok) {
        if (isMounted) {
          setBillingPlanCode("free");
          setBillingStatus("FREE");
          setBillingLoading(false);
        }
        return;
      }

      const body = (await response.json()) as { planCode?: string; status?: string };
      if (isMounted) {
        setBillingPlanCode(body.planCode || "free");
        setBillingStatus(String(body.status || "FREE").toUpperCase());
        setBillingLoading(false);
      }
    };

    loadBilling();

    return () => {
      isMounted = false;
    };
  }, []);

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

    setNotice("Profile updated.");
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(null);
    setEmailNotice(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      setEmailError("No active session found.");
      return;
    }

    const nextEmail = emailForm.nextEmail.trim().toLowerCase();
    if (!nextEmail) {
      setEmailError("Enter a new email address.");
      return;
    }

    if (nextEmail === (user.email ?? "").toLowerCase()) {
      setEmailError("New email must be different from your current email.");
      return;
    }

    setEmailSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({
      email: nextEmail,
    });

    if (updateError) {
      setEmailError(updateError.message);
      setEmailSubmitting(false);
      return;
    }

    setPendingEmail(nextEmail);
    setEmailForm({ nextEmail: "" });
    setEmailNotice(
      "Verification link sent to your new email address. Your account email updates after verification."
    );
    setEmailSubmitting(false);
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

  const handleCancelSubscription = async () => {
    setCancelError(null);
    setCancelNotice(null);

    const confirmed = window.confirm(
      "Cancel your PayPal subscription now? Access remains until the current billing period ends if PayPal applies period-end cancellation."
    );
    if (!confirmed) return;

    const headers = await getAuthHeaders();
    if (!headers) {
      setCancelError("No active session found.");
      return;
    }

    setCancelLoading(true);
    const response = await fetch("/api/billing/paypal/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ reason: "Cancelled by customer from settings" }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setCancelError(body.error || "Failed to cancel subscription.");
      setCancelLoading(false);
      return;
    }

    setBillingStatus("CANCELLED");
    setCancelNotice("Subscription cancellation requested successfully.");
    setCancelLoading(false);
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

        <form className="settings-card" onSubmit={handleEmailSubmit}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <h3 style={{ margin: 0 }}>Email address</h3>
            <button
              className="button"
              type="button"
              aria-label="Show email change procedure"
              title="How email change works"
              onClick={() => setShowEmailHelpModal(true)}
              style={{
                width: "20px",
                height: "20px",
                padding: 0,
                borderRadius: "999px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              i
            </button>
          </div>
          <p>Send a verification link to your new email address.</p>
          <div className="settings-grid">
            <div className="settings-field">
              <label>Current email</label>
              <input type="email" value={currentEmail} disabled />
            </div>
            <div className="settings-field">
              <label htmlFor="nextEmail">New email</label>
              <input
                id="nextEmail"
                type="email"
                placeholder="name@example.com"
                value={emailForm.nextEmail}
                onChange={(event) =>
                  setEmailForm((prev) => ({ ...prev, nextEmail: event.target.value }))
                }
              />
            </div>
          </div>
          {pendingEmail ? (
            <p className="notice">
              Pending email change: {pendingEmail}. Verification is required to complete the update.
            </p>
          ) : null}
          {emailNotice ? <p className="notice">{emailNotice}</p> : null}
          {emailError ? <p className="notice">{emailError}</p> : null}
          <div className="settings-actions">
            <button className="button primary" type="submit" disabled={emailSubmitting}>
              {emailSubmitting ? "Sending..." : "Send verification link"}
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

        <div className="settings-card">
          <h3>Subscription</h3>
          {billingLoading ? (
            <p>Loading subscription status...</p>
          ) : (
            <>
              <p>
                Current plan: <strong>{billingPlanCode}</strong> · Status:{" "}
                <strong>{billingStatus}</strong>
              </p>
              {cancelNotice ? <p className="notice">{cancelNotice}</p> : null}
              {cancelError ? <p className="notice">{cancelError}</p> : null}
              <div className="settings-actions">
                <button
                  className="button"
                  type="button"
                  disabled={
                    cancelLoading ||
                    billingPlanCode === "free" ||
                    ["FREE", "CANCELLED", "CANCELED", "EXPIRED"].includes(billingStatus)
                  }
                  onClick={handleCancelSubscription}
                >
                  {cancelLoading ? "Cancelling..." : "Cancel PayPal subscription"}
                </button>
              </div>
            </>
          )}
        </div>

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
      {showEmailHelpModal ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>Email Change Procedure</h3>
                <p className="modal-subtitle">How to complete the update</p>
              </div>
              <button
                className="button"
                type="button"
                onClick={() => setShowEmailHelpModal(false)}
              >
                Close
              </button>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              <p>1. Enter your new email and click Send verification link.</p>
              <p>2. Open the confirmation email in your new inbox and click the link.</p>
              <p>
                3. If secure email change is enabled, also confirm from your current email inbox.
              </p>
              <p>4. Return to MorphyGen and refresh or sign in again.</p>
              <p>
                5. Email is updated only after all required confirmations are completed.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
