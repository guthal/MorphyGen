"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type UserState = {
  email?: string | null;
} | null;

export default function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<UserState>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setUser(data.session?.user ?? null);
    };

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    loadSession();

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (!user) {
    return (
      <>
        <a href="/login">Login</a>
        <a className="cta" href="/signup">
          Get Started
        </a>
      </>
    );
  }

  return (
    <>
      <a href="/dashboard">Dashboard</a>
      <button className="cta" type="button" onClick={handleSignOut}>
        Sign out
      </button>
    </>
  );
}
