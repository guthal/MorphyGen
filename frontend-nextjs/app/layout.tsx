import "./globals.css";
import type { Metadata } from "next";
import AuthNav from "../components/AuthNav";
import HeaderNav from "../components/HeaderNav";
import FooterLinks from "../components/FooterLinks";

export const metadata: Metadata = {
  title: "MorphyGen — Transform documents at scale.",
  description:
    "Transform documents at scale. Reliable API for single and bulk conversions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="app-shell">
          <header className="site-header">
            <div className="brand">MorphyGen</div>
            <nav className="site-nav">
              <HeaderNav />
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <div>© 2026 MorphyGen. All rights reserved.</div>
            <div className="footer-links">
              <FooterLinks />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
