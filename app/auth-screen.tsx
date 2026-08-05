"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { ProviderAvailability } from "@/lib/auth-environment";
import { safeInternalReturnTo } from "@/lib/account-email";

type AuthScreenProps = {
  mode: "login" | "register";
  returnTo?: string;
};

function messageFromError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "The access request could not be completed.";
}

export function AuthScreen({ mode, returnTo }: AuthScreenProps) {
  const callbackURL = useMemo(
    () => safeInternalReturnTo(returnTo),
    [returnTo],
  );
  const providerCallbackURL = useMemo(
    () => `/auth/continue?returnTo=${encodeURIComponent(callbackURL)}`,
    [callbackURL],
  );
  const [providers, setProviders] = useState<ProviderAvailability | null>(null);
  const [systemReady, setSystemReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

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

  const confirmPolicyAcceptance = () => {
    if (mode !== "register" || acceptedPolicies) return true;
    setMessage("Review and accept the Terms of Service and Privacy Notice before creating an account.");
    return false;
  };

  const startSocial = async (provider: "google" | "discord") => {
    if (!confirmPolicyAcceptance()) return;
    setBusy(provider);
    setMessage("");
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: providerCallbackURL,
        requestSignUp: mode === "register",
      });
      if (result.error) setMessage(result.error.message || "Connection failed.");
    } catch (error) {
      setMessage(messageFromError(error));
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmPolicyAcceptance()) return;
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
        const registration = {
          name,
          email,
          password,
          callbackURL,
          displayNameSet: true,
        } as Parameters<typeof authClient.signUp.email>[0] & {
          displayNameSet: boolean;
        };
        const result = await authClient.signUp.email(registration);
        if (result.error) throw new Error(result.error.message);
        setMessage("Verification transmitted. Check your email to activate the account.");
        event.currentTarget.reset();
        setAcceptedPolicies(false);
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
    busy !== null || !systemReady || providers?.[provider] !== true ||
    (mode === "register" && !acceptedPolicies)
  );

  return (
    <main className="auth-shell">
      <Link className="auth-wordmark" href="/" aria-label="Return to Black Vector">
        <span>BV</span> BLACK VECTOR<sup className="trademark-symbol">™</sup>
      </Link>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel-heading">
          <p className="eyebrow">IDENTITY UPLINK // SECURE CHANNEL</p>
          <h1 id="auth-title">{mode === "register" ? "CREATE ACCESS PROFILE." : "REOPEN YOUR CHANNEL."}</h1>
          <p>
            {mode === "register"
              ? "Create one Black Vector profile, then connect every other identity from Account Settings."
              : "Continue only with an identity already connected to your profile. New commanders should create an account first."}
          </p>
        </div>

        {mode === "register" && (
          <div className="auth-policy-consent">
            <label htmlFor="accept-policies">
              <input
                id="accept-policies"
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(event) => {
                  setAcceptedPolicies(event.target.checked);
                  if (event.target.checked) setMessage("");
                }}
              />
              <span aria-hidden="true" />
            </label>
            <p>
              I agree to the <Link href="/terms" target="_blank">Terms of Service</Link>
              {" "}and acknowledge the{" "}
              <Link href="/privacy" target="_blank">Privacy Notice</Link>.
            </p>
          </div>
        )}

        <div className="connection-grid" aria-label="Connected sign-in options">
          <button type="button" disabled={providerDisabled("steam")} onClick={() => {
            if (!confirmPolicyAcceptance()) return;
            setBusy("steam");
            // Steam OpenID must leave the app as a full-document navigation.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign(`/api/auth/steam/login?callbackURL=${encodeURIComponent(providerCallbackURL)}&errorCallbackURL=${encodeURIComponent("/login?error=steam")}`);
          }}>
            <span className="connection-mark">ST</span>
            <strong>CONTINUE WITH STEAM</strong>
            <small>{providers?.steam ? "OPENID SECURE" : "CURRENTLY UNAVAILABLE"}</small>
          </button>
          <button type="button" disabled={providerDisabled("google")} onClick={() => void startSocial("google")}>
            <span className="connection-mark">G</span>
            <strong>CONTINUE WITH GOOGLE</strong>
            <small>{providers?.google ? "OAUTH 2.0" : "CURRENTLY UNAVAILABLE"}</small>
          </button>
          <button type="button" disabled={providerDisabled("discord")} onClick={() => void startSocial("discord")}>
            <span className="connection-mark">DC</span>
            <strong>CONTINUE WITH DISCORD</strong>
            <small>{providers?.discord ? "OAUTH 2.0" : "CURRENTLY UNAVAILABLE"}</small>
          </button>
        </div>

        {mode === "register" && (
          <p className="auth-contact-note">
            A verified contact email is required for every account. Steam
            commanders complete this immediately after identity confirmation. If that
            email already has a profile, Black Vector will send a secure approval link
            to combine the identities.
          </p>
        )}
        {mode === "login" && (
          <p className="auth-contact-note">
            Steam reopens an existing profile only after that Steam identity has been
            connected. If you originally joined with Google, Discord, or email, sign in
            that way and connect Steam from Account Settings.
          </p>
        )}

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
          <p className="auth-message is-notice">Sign-in is temporarily unavailable. Please try again shortly.</p>
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
      <div className="auth-security-note">
        <p>Passwords are hashed server-side. External credentials never pass through Black Vector.</p>
        <nav aria-label="Account policies">
          <Link href="/terms">TERMS OF SERVICE</Link>
          <Link href="/privacy">PRIVACY NOTICE</Link>
          <Link href="/legal">LEGAL NOTICES</Link>
        </nav>
      </div>
    </main>
  );
}
