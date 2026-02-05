"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import AuthNav from "./AuthNav";

export default function HeaderNav() {
  const pathname = usePathname();
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

  const inDashboard = pathname?.startsWith("/dashboard");

  return (
    <>
      {hasSession ? null : (
        <>
          <a href="/#features">Features</a>
          <a href="/#workflow">Workflow</a>
        </>
      )}
      {inDashboard ? null : <AuthNav />}
    </>
  );
}
