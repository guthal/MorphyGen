export default function VerifyEmailPage() {
  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1>Verify your email</h1>
        <p>
          We sent a confirmation link to your inbox. Click the link to activate
          your account.
        </p>
        <p className="notice">
          Didn’t receive it? Check spam or resend from the Supabase auth panel.
        </p>
        <p>
          After confirming, return here and log in. <a href="/login">Login</a>
        </p>
      </div>
    </section>
  );
}
