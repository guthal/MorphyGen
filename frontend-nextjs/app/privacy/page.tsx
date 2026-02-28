import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MorphyGen Privacy Policy — HTML to PDF API",
  description:
    "MorphyGen privacy policy for our HTML to PDF API and document conversion services.",
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

export default function PrivacyPage() {
  return (
    <section className="section">
      <h2>Privacy Policy (GDPR)</h2>
      <p><strong>Last updated:</strong> February 4, 2026</p>

      <div className="card" style={{ marginTop: "16px" }}>
        <p>
          MorphyGen (“MorphyGen”, “we”, “us”, “our”) provides document
          conversion services, including HTML‑to‑PDF and related APIs. This
          Privacy Policy explains how we collect, use, share, and protect
          personal data in accordance with the GDPR.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>1) Controller</h3>
        <p>
          MorphyGen is the data controller for personal data processed through
          our website, dashboard, and APIs.
        </p>
        <p>Contact: admin@contact.morphygen.com</p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>2) Personal data we collect</h3>
        <ul style={{ paddingLeft: "18px", display: "grid", gap: "6px" }}>
          <li>Account & identity: name, email, user ID, authentication details</li>
          <li>Billing: billing email, subscription status, invoices, payment status</li>
          <li>Usage & logs: API usage, status codes, latency, IP, user agent</li>
          <li>Content: HTML/URLs submitted and generated outputs (PDFs)</li>
          <li>Support: information you share when contacting us</li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>3) How we use personal data</h3>
        <ul style={{ paddingLeft: "18px", display: "grid", gap: "6px" }}>
          <li>Provide and operate the service</li>
          <li>Authenticate users and secure API access</li>
          <li>Process billing and subscriptions</li>
          <li>Monitor usage, prevent abuse, troubleshoot</li>
          <li>Improve reliability and performance</li>
          <li>Provide support and communicate with users</li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>4) Legal bases</h3>
        <ul style={{ paddingLeft: "18px", display: "grid", gap: "6px" }}>
          <li>Contract (Art. 6(1)(b)) to provide the service</li>
          <li>Legitimate interests (Art. 6(1)(f)) for security and performance</li>
          <li>Consent (Art. 6(1)(a)) where required (e.g., marketing)</li>
        </ul>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>5) Retention</h3>
        <p>
          Async job inputs and outputs are retained for up to 7 days. Account and
          billing data are retained while your account is active and as required
          by law. Logs are retained for security and analytics.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>6) Sharing & disclosure</h3>
        <p>
          We share data only with service providers (hosting, storage, payment
          processing), legal authorities when required, or in business transfers.
          We do not sell personal data.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>7) International transfers</h3>
        <p>
          Data may be processed outside your country. Where required, we rely on
          lawful transfer mechanisms such as Standard Contractual Clauses (SCCs).
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>8) Your rights</h3>
        <p>
          You may access, correct, delete, restrict, or object to processing, and
          request portability. To exercise these rights, contact us at
          admin@contact.morphygen.com.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>9) Cookies & tracking</h3>
        <p>
          We use cookies for authentication and analytics. Where required, we
          obtain consent for non‑essential cookies.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>10) Security</h3>
        <p>
          We use technical and organizational measures to protect data, but no
          system is 100% secure.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>11) Complaints</h3>
        <p>
          You have the right to lodge a complaint with your local supervisory
          authority.
        </p>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>12) Updates</h3>
        <p>
          We may update this policy periodically. The “Last updated” date will
          reflect changes.
        </p>
      </div>
    </section>
  );
}
