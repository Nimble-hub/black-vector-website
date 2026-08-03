"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const email = String(new FormData(event.currentTarget).get("email") || "");
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setMessage("If that address has an account, reset instructions are in transit.");
    setBusy(false);
  };

  return (
    <main className="auth-shell">
      <Link className="auth-wordmark" href="/"><span>BV</span> BLACK VECTOR</Link>
      <section className="auth-panel compact-auth-panel">
        <p className="eyebrow">RECOVERY CHANNEL // ENCRYPTED</p>
        <h1>RESET ACCESS KEY.</h1>
        <p>Enter the verified email attached to your profile.</p>
        <form className="auth-form" onSubmit={submit}>
          <label><span>EMAIL ADDRESS</span><input name="email" type="email" autoComplete="email" required /></label>
          <button className="primary-action auth-submit" type="submit" disabled={busy}>{busy ? "TRANSMITTING..." : "SEND RESET LINK"}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <div className="auth-switch"><Link href="/login">RETURN TO SIGN IN</Link></div>
      </section>
    </main>
  );
}
