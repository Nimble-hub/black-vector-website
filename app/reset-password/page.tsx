"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") || "";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) {
      setMessage("The access keys do not match.");
      return;
    }
    setBusy(true);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setMessage(result.error ? result.error.message || "Reset failed." : "Access key updated. You may now sign in.");
    setBusy(false);
  };

  return (
    <main className="auth-shell">
      <Link className="auth-wordmark" href="/"><span>BV</span> BLACK VECTOR</Link>
      <section className="auth-panel compact-auth-panel">
        <p className="eyebrow">RECOVERY CHANNEL // TOKEN RECEIVED</p>
        <h1>SET NEW ACCESS KEY.</h1>
        <form className="auth-form" onSubmit={submit}>
          <label><span>NEW ACCESS KEY</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <label><span>CONFIRM ACCESS KEY</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <button className="primary-action auth-submit" type="submit" disabled={busy || !token}>{busy ? "UPDATING..." : "UPDATE ACCESS KEY"}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <div className="auth-switch"><Link href="/login">RETURN TO SIGN IN</Link></div>
      </section>
    </main>
  );
}
