"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing sign in...");

  useEffect(() => {
    const handleCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );

        if (!error) {
          router.push("/dashboard");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();

      if (data.session?.user?.email_confirmed_at) {
        router.push("/dashboard");
        return;
      }

      setMessage("Verification complete. Please log in to continue.");
    };

    handleCallback();
  }, [router]);

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>Finishing up</h1>
        <p className="notice">{message}</p>
      </div>
    </section>
  );
}
