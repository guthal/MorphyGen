"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      const message =
        signInError.message.includes("Email not confirmed") ||
        signInError.message.includes("email not confirmed")
          ? "Please verify your email before logging in."
          : signInError.message;
      setError(message);
      return;
    }

    if (data.user && !data.user.email_confirmed_at) {
      setNotice("Please verify your email before accessing the dashboard.");
      await supabase.auth.signOut();
      return;
    }

    router.push("/dashboard");
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p>Log in to manage your HTML to PDF jobs.</p>
        <form onSubmit={handleLogin}>
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
          <button type="submit">Login</button>
        </form>
        {error ? <p className="notice">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        <p>
          New here? <a href="/signup">Create an account</a>
        </p>
      </div>
    </section>
  );
}
