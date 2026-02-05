const CodeBlock = ({ children }: { children: string }) => (
  <pre className="docs-code">
    <code>{children}</code>
  </pre>
);

const InlineCode = ({ children }: { children: string }) => (
  <code className="docs-inline-code">{children}</code>
);

export default function DocsPage() {
  return (
    <section className="section">
      <h2>Documentation</h2>
      <p>
        API references and examples for converting HTML or URLs into PDFs. Use
        the sidebar to jump between sections.
      </p>

      <div className="docs-shell">
        <aside className="docs-sidebar">
          <a href="/dashboard" className="button" style={{ marginBottom: "16px" }}>
            ← Back to dashboard
          </a>
          <div className="docs-search">
            <label htmlFor="docs-search">Search docs</label>
            <input
              id="docs-search"
              type="text"
              placeholder="Search endpoints, fields, examples"
            />
          </div>
          <nav className="docs-nav">
            <h4>Getting started</h4>
            <a href="#quickstart">Quick start</a>
            <a href="#auth">Authentication</a>
            <a href="#sync">Sync rendering</a>
            <h4>Jobs</h4>
            <a href="#create-job">Create job</a>
            <a href="#html-inline">HTML inline</a>
            <a href="#job-status">Job status</a>
            <a href="#download">Download PDF</a>
            <a href="#protected">Protected pages</a>
            <h4>Account</h4>
            <a href="#usage">Usage</a>
            <a href="#logs">Logs</a>
            <h4>Limits</h4>
            <a href="#limits">Limits & retention</a>
          </nav>
        </aside>

        <div className="docs-content">
          <div className="docs-hero" id="quickstart">
            <span className="badge">Quick start</span>
            <h3>Convert your first URL</h3>
            <p>
              Create an API key in <InlineCode>/dashboard/api-keys</InlineCode>{" "}
              and pass it in the <InlineCode>x-api-key</InlineCode> header. This
              endpoint queues a render and returns a job id.
            </p>
            <CodeBlock>{`curl -s -X POST http://localhost:3000/api/jobs \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <API_KEY>" \\
  -d '{
    "inputType": "URL",
    "inputRef": "https://example.com"
  }'`}</CodeBlock>
          </div>

          <section className="docs-section" id="auth">
            <h3>Authentication</h3>
            <p>
              All <InlineCode>/api/jobs/*</InlineCode> endpoints require an API
              key. Use the <InlineCode>x-api-key</InlineCode> header for every
              request so the API can associate usage with your account.
            </p>
            <CodeBlock>{`x-api-key: <YOUR_API_KEY>`}</CodeBlock>
          </section>

          <section className="docs-section" id="sync">
            <h3>Sync rendering (default)</h3>
            <p>
              <InlineCode>POST /api/jobs</InlineCode> returns PDF bytes by
              default. Use this when you want a single request that saves
              directly to a local file with <InlineCode>-o</InlineCode>.
            </p>
            <CodeBlock>{`curl -s -X POST "http://localhost:3000/api/jobs" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <API_KEY>" \\
  -d '{
    "inputType": "URL",
    "inputRef": "https://example.com"
  }' \\
  -o output.pdf`}</CodeBlock>
          </section>

          <section className="docs-section" id="create-job">
            <h3>Create job (async)</h3>
            <p>
              Add <InlineCode>?async=1</InlineCode> to queue a background job.
              Use this for large renders and batch workloads. The response
              includes a <InlineCode>job.id</InlineCode> for status polling.
            </p>
            <CodeBlock>{`POST /api/jobs?async=1
Content-Type: application/json
x-api-key: <API_KEY>

{
  "inputType": "URL",
  "inputRef": "https://example.com"
}`}</CodeBlock>
          </section>

          <section className="docs-section" id="html-inline">
            <h3>HTML input (inline)</h3>
            <p>
              Set <InlineCode>inputRef</InlineCode> to{" "}
              <InlineCode>INLINE</InlineCode> and pass{" "}
              <InlineCode>inputHtml</InlineCode> to render raw HTML without a
              public URL.
            </p>
            <CodeBlock>{`{
  "inputType": "HTML",
  "inputRef": "INLINE",
  "inputHtml": "<html><body><h1>Hello</h1></body></html>"
}`}</CodeBlock>
          </section>

          <section className="docs-section" id="job-status">
            <h3>Job status</h3>
            <p>
              Poll until <InlineCode>SUCCEEDED</InlineCode> to get{" "}
              <InlineCode>downloadUrl</InlineCode>. The status response also
              includes the job metadata.
            </p>
            <CodeBlock>{`GET /api/jobs/<JOB_ID>
x-api-key: <API_KEY>`}</CodeBlock>
          </section>

          <section className="docs-section" id="download">
            <h3>Download PDF</h3>
            <p>
              Use <InlineCode>/api/jobs/:id/pdf</InlineCode> to retrieve a signed
              download URL. This endpoint redirects to S3, so use{" "}
              <InlineCode>-L</InlineCode> in curl to follow redirects.
            </p>
            <CodeBlock>{`curl -L http://localhost:3000/api/jobs/<JOB_ID>/pdf \\
  -H "x-api-key: <API_KEY>" \\
  -o output.pdf`}</CodeBlock>
          </section>

          <section className="docs-section" id="usage">
            <h3>Usage</h3>
            <p>
              Returns month-to-date usage totals for each API key on your
              account. Useful for monitoring consumption.
            </p>
            <CodeBlock>{`GET /api/api-keys/usage`}</CodeBlock>
          </section>

          <section className="docs-section" id="logs">
            <h3>Logs</h3>
            <p>
              Fetches recent API request logs for your account, including status
              codes and latency.
            </p>
            <CodeBlock>{`GET /api/logs?limit=200`}</CodeBlock>
          </section>

          <section className="docs-section" id="limits">
            <h3>Limits & retention</h3>
            <div className="docs-grid">
              <div>
                <p>
                  Per-minute rate limit is enforced on{" "}
                  <InlineCode>/api/jobs/*</InlineCode> to protect the service.
                </p>
              </div>
              <div>
                <p>
                  Daily quota is enforced when configured in environment
                  variables. Exceeding it returns a 429 error.
                </p>
              </div>
              <div>
                <p>
                  Async job inputs and outputs are stored in S3 and expire after
                  7 days. This retention keeps storage usage predictable.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
