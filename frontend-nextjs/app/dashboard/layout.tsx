"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Logs", href: "/dashboard/logs" },
  { label: "API Keys", href: "/dashboard/api-keys" },
  { label: "Billing", href: "/dashboard/billing" },
  { label: "Invoices", href: "/dashboard/invoices" },
  { label: "Settings", href: "/dashboard/settings" },
  { label: "Documentation", href: "/dashboard/docs" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isDocs = pathname === "/dashboard/docs";

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!data.session) {
        router.push("/login");
        return;
      }

      if (!data.session.user.email_confirmed_at) {
        await supabase.auth.signOut();
        router.push("/verify-email");
        return;
      }

      setEmail(data.session.user.email ?? null);
      setLoading(false);
    };

    loadSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <section className="section">
        <p>Loading dashboard...</p>
      </section>
    );
  }

  return (
    <div className={`dashboard-shell${isDocs ? " docs-only" : ""}`}>
      {isDocs ? null : (
        <aside className="dashboard-sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-title">MorphyGen</div>
            <div className="sidebar-subtitle">{email ?? "Signed in"}</div>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={
                  pathname === item.href ? "sidebar-link active" : "sidebar-link"
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
          <button className="sidebar-logout" type="button" onClick={handleSignOut}>
            Log out
          </button>
        </aside>
      )}
      <main className="dashboard-main">{children}</main>
    </div>
  );
}
