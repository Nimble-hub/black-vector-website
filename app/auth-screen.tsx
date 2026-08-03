"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { ProviderAvailability } from "@/lib/auth-environment";

type AuthScreenProps = {
  mode: "login" | "register";
  returnTo?: string;
};

function safeReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}

function messageFromError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "The access request could not be completed.";
}

export function AuthScreen({ mode, returnTo }: AuthScreenProps) {
  const callbackURL = useMemo(() => safeReturnTo(returnTo), [returnTo]);
  const [providers, setProviders] = useState<ProviderAvailability | null>(null);
  const [systemReady, setSystemReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    void fetch("/api/auth/providers", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        const data = payload as { providers: ProviderAvailability; ready: boolean };
        setProviders(data.providers);
        setSystemReady(Boolean(data.ready));
      })
      .catch(() => setProviders({ manual: false, google: false, discord: false, steam: false }));
  }, []);

  const startSocial = async (provider: "google" | "discord") => {
    setBusy(provider);
    setMessage("");
    try {
      const result = await authClient.signIn.social({ provider, callbackURL });
      if (result.error) setMessage(result.error.message || "Connection failed.");
    } catch (error) {
      setMessage(messageFromError(error));
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("manual");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    try {
      if (mode === "register") {
        const name = String(form.get("name") || "").trim();
        const confirmPassword = String(form.get("confirmPassword") || "");
        if (password !== confirmPassword) throw new Error("The access keys do not match.");
        const result = await authClient.signUp.email({ name, email, password, callbackURL });
        if (result.error) throw new Error(result.error.message);
        setMessage("Verification transmitted. Check your email to activate the account.");
        event.currentTarget.reset();
      } else {
        const result = await authClient.signIn.email({ email, password, callbackURL });
        if (result.error) throw new Error(result.error.message);
        window.location.assign(callbackURL);
      }
    } catch (error) {
      setMessage(messageFromError(error));
    } finally {
      setBusy(null);
    }
  };

  const providerDisabled = (provider: keyof ProviderAvailability) => (
    busy !== null || !systemReady || providers?.[provider] !== true
  );

  return (
    <main className="auth-shell">
      <Link className="auth-wordmark" href="/" aria-label="Return to Black Vector">
        <span>BV</span> BLACK VECTOR
      </Link>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel-heading">
          <p className="eyebrow">IDENTITY UPLINK // SECURE CHANNEL</p>
          <h1 id="auth-title">{mode === "register" ? "CREATE ACCESS PROFILE." : "REOPEN YOUR CHANNEL."}</h1>
          <p>
            {mode === "register"
              ? "One Black Vector account can hold every identity you choose to connect."
              : "Continue with a connected identity or your manual access key."}
          </p>
        </div>

        <div className="connection-grid" aria-label="Connected sign-in options">
          <button type="button" disabled={providerDisabled("steam")} onClick={() => {
            setBusy("steam");
            window.location.assign(`/api/auth/steam/login?callbackURL=${encodeURIComponent(callbackURL)}&errorCallbackURL=${encodeURIComponent("/login?error=steam")}`);
          }}>
            <span className="connection-mark">ST</span>
            <strong>CONTINUE WITH STEAM</strong>
            <small>{providers?.steam ? "OPENID SECURE" : "AWAITING CONFIG"}</small>
          </button>
          <button type="button" disabled={providerDisabled("google")} onClick={() => void startSocial("google")}>
            <span className="connection-mark">G</span>
            <strong>CONTINUE WITH GOOGLE</strong>
            <small>{providers?.google ? "OAUTH 2.0" : "AWAITING CONFIG"}</small>
          </button>
          <button type="button" disabled={providerDisabled("discord")} onClick={() => void startSocial("discord")}>
            <span className="connection-mark">DC</span>
            <strong>CONTINUE WITH DISCORD</strong>
            <small>{providers?.discord ? "OAUTH 2.0" : "AWAITING CONFIG"}</small>
          </button>
        </div>

        <div className="auth-divider"><span>OR MANUAL ACCOUNT</span></div>

        <form className="auth-form" onSubmit={submitManual}>
          {mode === "register" && (
            <label>
              <span>DISPLAY NAME</span>
              <input name="name" autoComplete="name" minLength={2} maxLength={48} required />
            </label>
          )}
          <label>
            <span>EMAIL ADDRESS</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>ACCESS KEY</span>
            <input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={12} maxLength={128} required />
          </label>
          {mode === "register" && (
            <label>
              <span>CONFIRM ACCESS KEY</span>
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            </label>
          )}
          <button className="primary-action auth-submit" type="submit" disabled={providerDisabled("manual")}>
            {busy === "manual" ? "TRANSMITTING..." : mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
          </button>
        </form>

        {message && <p className="auth-message" role="status">{message}</p>}
        {!systemReady && providers && (
          <p className="auth-message is-notice">Account services are staged but are not live until production credentials are connected.</p>
        )}

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              <Link href="/forgot-password">RESET ACCESS KEY</Link>
              <span>NO PROFILE?</span>
              <Link href={`/register?returnTo=${encodeURIComponent(callbackURL)}`}>CREATE ACCOUNT</Link>
            </>
          ) : (
            <>
              <span>ALREADY ENLISTED?</span>
              <Link href={`/login?returnTo=${encodeURIComponent(callbackURL)}`}>SIGN IN</Link>
            </>
          )}
        </div>
      </section>
      <p className="auth-security-note">Passwords are hashed server-side. External credentials never pass through Black Vector.</p>
    </main>
  );
}
