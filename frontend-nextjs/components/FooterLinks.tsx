"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function FooterLinks() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setHasSession(Boolean(data.session));
    };

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setHasSession(Boolean(session));
      }
    );

    loadSession();

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      <a href="mailto:admin@contact.morphygen.com">Support</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      {hasSession ? null : <a href="/signup">Start Free</a>}
    </>
  );
}
