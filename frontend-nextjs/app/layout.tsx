import "./globals.css";
import type { Metadata } from "next";
import AuthNav from "../components/AuthNav";
import HeaderNav from "../components/HeaderNav";
import FooterLinks from "../components/FooterLinks";

export const metadata: Metadata = {
  title: "MorphyGen — Transform documents at scale.",
  description:
    "Transform documents at scale. Reliable API for single and bulk conversions.",
  keywords: [
    "html to pdf api",
    "html to pdf java library",
    "html to pdf converter api",
    "convert html to pdf api",
    "api html to pdf",
    "html2pdf api",
    "html to pdf api free",
    "pdf to html api",
    "api to convert html to pdf",
    "html to pdf api open source",
    "adobe html to pdf api",
    "html to pdf online api",
    "online html to pdf converter api",
    "free html to pdf api",
    "aspose html to pdf java",
    "apache poi html to pdf",
    "api pdf to html",
    "best html to pdf api",
    "convert html to pdf api free",
    "convert html to pdf java api",
    "convert pdf to html api",
    "html to pdf api php",
    "html to pdf rest api",
    "html to pdf service api",
    "java api html to pdf",
  ],
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
