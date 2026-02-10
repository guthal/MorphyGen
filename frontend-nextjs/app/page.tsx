import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MorphyGen — HTML to PDF API",
  description:
    "HTML to PDF API for deterministic, high-volume conversions with webhooks and audit-ready logs.",
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

export default function HomePage() {
  return (
    <div>
      <section className="hero">
        <div>
          <span className="badge">HTML to PDF API</span>
          <h1>Ship pixel-perfect PDFs without shipping a PDF team.</h1>
          <p>
            MorphyGen transforms HTML to PDF for single or bulk jobs with
            deterministic output, webhooks, and a clean audit trail.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="/signup">
              Start Free
            </a>
            <a className="button" href="#workflow">
              See Workflow
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div>
            <strong>Batch Conversion</strong>
            <p>Upload 10 or 10,000 HTML files with retries and status checks.</p>
          </div>
          <div>
            <strong>Render Fidelity</strong>
            <p>CSS3, fonts, and responsive layouts—captured consistently.</p>
          </div>
          <div className="stat">
            <span>Avg. render time</span>
            <span>1.6s</span>
          </div>
          <div className="stat">
            <span>Success rate</span>
            <span>99.8%</span>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <h2>Built for production PDF workloads</h2>
        <div className="grid">
          <div className="card">
            <h3>Async by default</h3>
            <p>Every job is tracked with rich metadata and webhook callbacks.</p>
          </div>
          <div className="card">
            <h3>Secure multi-tenant</h3>
            <p>Per-account API keys, scoped access, and usage quotas.</p>
          </div>
          <div className="card">
            <h3>Bulk orchestration</h3>
            <p>Queue large batches with retries, partials, and resumable runs.</p>
          </div>
          <div className="card">
            <h3>Developer-first</h3>
            <p>Clear docs, SDKs, and detailed logs for every render.</p>
          </div>
        </div>
      </section>

      <section id="workflow" className="section">
        <h2>How it works</h2>
        <div className="workflow">
          <div className="grid">
            <div className="card">
              <h3>1. Upload</h3>
              <p>Send HTML or a zip bundle using the API or dashboard.</p>
            </div>
            <div className="card">
              <h3>2. Render</h3>
              <p>Lambda workers render PDFs with consistent settings.</p>
            </div>
            <div className="card">
              <h3>3. Deliver</h3>
              <p>Download results from S3 or receive a webhook callback.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
