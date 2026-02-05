export default function AboutPage() {
  return (
    <section className="section">
      <h2>About MorphyGen</h2>
      <p>
        MorphyGen helps teams transform documents at scale with a fast,
        developer-friendly API and predictable usage-based pricing.
      </p>

      <div className="grid" style={{ marginTop: "24px" }}>
        <div className="card">
          <span className="badge">Mission</span>
          <h3>Transform documents at scale</h3>
          <p>
            We build infrastructure that turns HTML, URLs, and structured data
            into production-grade documents with minimal friction.
          </p>
        </div>
        <div className="card">
          <span className="badge">What we value</span>
          <h3>Reliable by design</h3>
          <p>
            Our platform is designed for throughput, clarity, and predictable
            outcomes—so your pipelines keep moving without surprises.
          </p>
        </div>
        <div className="card">
          <span className="badge">Who we serve</span>
          <h3>Builders & product teams</h3>
          <p>
            From small teams to enterprise workflows, MorphyGen scales with your
            document volume and complexity.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>What we do</h3>
        <p>
          We provide unified credits across HTML → PDF, OCR, and upcoming
          document services. You get clean APIs, usage visibility, and a billing
          model that grows with you.
        </p>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Want to talk?</h3>
        <p>
          We love working with teams building at scale. Reach out to discuss
          throughput needs or custom plans.
        </p>
        <div style={{ marginTop: "16px" }}>
          <a className="button primary" href="mailto:masuvi1970@gmail.com">
            Contact us
          </a>
        </div>
      </div>
    </section>
  );
}
