"use client";

import { useState } from "react";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleResend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setSending(true);

    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to resend verification email.");
      }
      setNotice("Verification email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>Verify your email</h1>
        <p>
          We sent a confirmation link to your inbox. Click the link to activate
          your account.
        </p>
        <p className="notice">Didn’t receive it? Resend below.</p>
        <form onSubmit={handleResend}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {notice ? <p className="notice">{notice}</p> : null}
          {error ? <p className="notice">{error}</p> : null}
          <button className="button primary" type="submit" disabled={sending}>
            {sending ? "Sending..." : "Resend verification email"}
          </button>
        </form>
        <p>
          After confirming, return here and log in. <a href="/login">Login</a>
        </p>
      </div>
    </section>
  );
}
