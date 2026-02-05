"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const redirectUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${redirectUrl}/auth-callback`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setNotice(
      "Thanks! Check your email to confirm your account before logging in."
    );
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p>Start sending HTML to PDF jobs in minutes.</p>
        <form onSubmit={handleSignup}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit">Sign up</button>
        </form>
        {error ? <p className="notice">{error}</p> : null}
        {notice ? (
          <p className="notice">
            {notice} <a href="/verify-email">Need help?</a>
          </p>
        ) : null}
        <p>
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </section>
  );
}
