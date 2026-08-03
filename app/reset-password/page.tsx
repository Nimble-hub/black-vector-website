"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const invalidToken = !token || searchParams.get("error") === "INVALID_TOKEN";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) {
      setMessage("The access keys do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message || "Reset failed.");
      setComplete(true);
      setMessage("Access key updated. All previous sessions have been secured. You may now sign in.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This recovery link is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <Link className="auth-wordmark" href="/"><span>BV</span> BLACK VECTOR</Link>
      <section className="auth-panel compact-auth-panel">
        <p className="eyebrow">RECOVERY CHANNEL // TOKEN RECEIVED</p>
        <h1>SET NEW ACCESS KEY.</h1>
        {invalidToken ? (
          <>
            <p className="auth-message is-notice" role="alert">This recovery link is invalid or has expired. Request a new secure link.</p>
            <div className="auth-switch"><Link href="/forgot-password">REQUEST NEW RESET LINK</Link></div>
          </>
        ) : complete ? (
          <>
            <p className="auth-message" role="status" aria-live="polite">{message}</p>
            <div className="auth-switch"><Link href="/login">RETURN TO SIGN IN</Link></div>
          </>
        ) : (
          <>
            <form className="auth-form" onSubmit={submit}>
              <label><span>NEW ACCESS KEY</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
              <label><span>CONFIRM ACCESS KEY</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
              <button className="primary-action auth-submit" type="submit" disabled={busy}>{busy ? "UPDATING..." : "UPDATE ACCESS KEY"}</button>
            </form>
            {message && <p className="auth-message" role="status" aria-live="polite">{message}</p>}
            <div className="auth-switch"><Link href="/login">RETURN TO SIGN IN</Link></div>
          </>
        )}
      </section>
    </main>
  );
}
