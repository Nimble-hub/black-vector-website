"use client";

import { FormEvent, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { ProviderAvailability } from "@/lib/auth-environment";

type AccountRecord = { id: string; providerId: string; accountId: string };
type PlayerProfile = {
  callsign: string;
  preferredPlatform: string;
  strategyExperience: string;
  playtestOptIn: boolean;
  developmentUpdatesOptIn: boolean;
};

const providerLabels: Record<string, string> = {
  credential: "Manual account",
  google: "Google",
  discord: "Discord",
  steam: "Steam",
};

export function AccountSettings({
  user,
  accounts,
  providers,
  initialProfile,
  initialTab,
  initialStatus,
}: {
  user: { id: string; name: string; email: string; emailVerified: boolean; image: string | null };
  accounts: AccountRecord[];
  providers: ProviderAvailability;
  initialProfile: PlayerProfile | null;
  initialTab: "profile" | "connections" | "security";
  initialStatus: string;
}) {
  const [tab, setTab] = useState<"profile" | "connections" | "security">(initialTab);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const linked = useMemo(() => new Map(accounts.map((item) => [item.providerId, item])), [accounts]);

  const linkSocial = async (provider: "google" | "discord") => {
    setBusy(true);
    setStatus("");
    const result = await authClient.linkSocial({ provider, callbackURL: "/account?connection=linked" });
    if (result.error) setStatus(result.error.message || "Connection failed.");
    setBusy(false);
  };

  const unlink = async (record: AccountRecord) => {
    setBusy(true);
    setStatus("");
    if (record.providerId === "steam") {
      const response = await fetch("/api/steam/link", { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) setStatus(data.error || "Steam could not be disconnected.");
      else window.location.reload();
    } else {
      const result = await authClient.unlinkAccount({
        providerId: record.providerId,
        accountId: record.accountId,
      });
      if (result.error) setStatus(result.error.message || "Connection could not be removed.");
      else window.location.reload();
    }
    setBusy(false);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callsign: String(form.get("callsign") || ""),
        preferredPlatform: String(form.get("preferredPlatform") || "windows"),
        strategyExperience: String(form.get("strategyExperience") || "intermediate"),
        playtestOptIn: form.get("playtestOptIn") === "on",
        developmentUpdatesOptIn: form.get("developmentUpdatesOptIn") === "on",
      }),
    });
    const data = await response.json() as { error?: string };
    setStatus(response.ok ? "Playtest profile synchronized." : data.error || "Profile update failed.");
    setBusy(false);
  };

  const saveIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    const result = await authClient.updateUser({ name });
    setStatus(result.error ? result.error.message || "Update failed." : "Identity record updated.");
    setBusy(false);
  };

  const changeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const newEmail = String(new FormData(event.currentTarget).get("newEmail") || "").trim();
    const result = await authClient.changeEmail({ newEmail, callbackURL: "/account?email=verified" });
    setStatus(result.error
      ? result.error.message || "Email change could not be started."
      : "Verification transmitted to the new address.");
    setBusy(false);
  };

  const addPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword !== String(form.get("confirmPassword") || "")) {
      setStatus("The access keys do not match.");
      setBusy(false);
      return;
    }
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const data = await response.json() as { error?: string };
    setStatus(response.ok ? "Manual sign-in activated." : data.error || "Manual sign-in could not be activated.");
    if (response.ok) window.location.reload();
    setBusy(false);
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const result = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") || ""),
      newPassword: String(form.get("newPassword") || ""),
      revokeOtherSessions: true,
    });
    setStatus(result.error ? result.error.message || "Access key update failed." : "Access key updated. Other sessions were closed.");
    if (!result.error) event.currentTarget.reset();
    setBusy(false);
  };

  return (
    <div className="account-console">
      <aside className="account-sidebar">
        <p>ACCOUNT SETTINGS</p>
        <button className={tab === "profile" ? "is-active" : ""} onClick={() => setTab("profile")}>PROFILE &amp; PLAYTEST</button>
        <button className={tab === "connections" ? "is-active" : ""} onClick={() => setTab("connections")}>CONNECTED ACCOUNTS</button>
        <button className={tab === "security" ? "is-active" : ""} onClick={() => setTab("security")}>SECURITY</button>
        <button className="account-signout" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign("/") } })}>SIGN OUT</button>
      </aside>

      <section className="account-content">
        {tab === "profile" && (
          <div className="account-view">
            <div className="account-view-heading"><p className="eyebrow">PLAYER RECORD // PLAYTEST INTAKE</p><h1>PROFILE &amp; ACCESS.</h1><p>Choose how the development team can identify and contact you for future test waves.</p></div>
            <form className="settings-form" onSubmit={saveIdentity}>
              <h2>IDENTITY</h2>
              <label><span>DISPLAY NAME</span><input name="name" defaultValue={user.name} minLength={2} maxLength={48} required /></label>
              <label><span>PRIMARY EMAIL</span><input value={user.email.endsWith(".invalid") ? "Steam identity — add a verified email later" : user.email} disabled /></label>
              <button type="submit" disabled={busy}>UPDATE IDENTITY</button>
            </form>
            <form className="settings-form" onSubmit={changeEmail}>
              <h2>CONTACT CHANNEL</h2>
              <p>Changing this address requires confirmation at the new inbox.</p>
              <label><span>NEW EMAIL ADDRESS</span><input name="newEmail" type="email" autoComplete="email" required /></label>
              <button type="submit" disabled={busy || !providers.manual}>VERIFY NEW EMAIL</button>
            </form>
            <form className="settings-form" onSubmit={saveProfile}>
              <h2>PLAYTEST PROFILE</h2>
              <label><span>CALLSIGN</span><input name="callsign" defaultValue={initialProfile?.callsign || ""} maxLength={32} /></label>
              <div className="settings-row">
                <label><span>PRIMARY PLATFORM</span><select name="preferredPlatform" defaultValue={initialProfile?.preferredPlatform || "windows"}><option value="windows">Windows</option><option value="linux">Linux</option><option value="mac">macOS</option></select></label>
                <label><span>STRATEGY EXPERIENCE</span><select name="strategyExperience" defaultValue={initialProfile?.strategyExperience || "intermediate"}><option value="new">New commander</option><option value="intermediate">Experienced</option><option value="veteran">Veteran / competitive</option></select></label>
              </div>
              <label className="settings-check"><input name="playtestOptIn" type="checkbox" defaultChecked={initialProfile?.playtestOptIn || false} /><span>Place me in the Black Vector playtest candidate pool.</span></label>
              <label className="settings-check"><input name="developmentUpdatesOptIn" type="checkbox" defaultChecked={initialProfile?.developmentUpdatesOptIn || false} /><span>Send occasional development and release transmissions.</span></label>
              <button type="submit" disabled={busy}>{busy ? "SYNCHRONIZING..." : "SAVE PLAYTEST PROFILE"}</button>
            </form>
          </div>
        )}

        {tab === "connections" && (
          <div className="account-view">
            <div className="account-view-heading"><p className="eyebrow">IDENTITY GRAPH // EXPLICIT LINKING</p><h1>CONNECTED ACCOUNTS.</h1><p>Connections are never merged silently. Sign in to each provider here to add it to this profile.</p></div>
            <div className="linked-account-list">
              {(["steam", "google", "discord", "credential"] as const).map((provider) => {
                const record = linked.get(provider);
                const available = provider === "credential" ? providers.manual : providers[provider];
                return (
                  <article key={provider}>
                    <span className="connection-mark">{provider === "credential" ? "BV" : provider.slice(0, 2).toUpperCase()}</span>
                    <div><strong>{providerLabels[provider]}</strong><small>{record ? "CONNECTED" : available ? "AVAILABLE" : "AWAITING CONFIG"}</small></div>
                    {record ? (
                      provider !== "credential" && <button disabled={busy || accounts.length <= 1} onClick={() => void unlink(record)}>DISCONNECT</button>
                    ) : provider === "steam" && available ? (
                      <a href="/api/steam/link/start">CONNECT</a>
                    ) : (provider === "google" || provider === "discord") && available ? (
                      <button disabled={busy} onClick={() => void linkSocial(provider)}>CONNECT</button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {tab === "security" && (
          <div className="account-view">
            <div className="account-view-heading"><p className="eyebrow">SECURITY CONTROL // SESSION AUTHORITY</p><h1>SECURE THE CHANNEL.</h1><p>Connected providers remain independent. Removing one never deletes the others.</p></div>
            {linked.has("credential") ? (
              <form className="settings-form" onSubmit={changePassword}>
                <h2>CHANGE ACCESS KEY</h2>
                <label><span>CURRENT ACCESS KEY</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
                <label><span>NEW ACCESS KEY</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
                <button type="submit" disabled={busy}>UPDATE &amp; CLOSE OTHER SESSIONS</button>
              </form>
            ) : (
              <form className="settings-form" onSubmit={addPassword}>
                <h2>ADD MANUAL ACCESS KEY</h2>
                <p>Create a password as an additional sign-in method for this verified profile.</p>
                <label><span>NEW ACCESS KEY</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
                <label><span>CONFIRM ACCESS KEY</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
                <button type="submit" disabled={busy || !providers.manual || !user.emailVerified || user.email.endsWith(".invalid")}>ACTIVATE MANUAL SIGN-IN</button>
              </form>
            )}
            <div className="security-readout"><span>EMAIL VERIFICATION</span><strong>{user.emailVerified ? "VERIFIED" : "PENDING"}</strong><span>CONNECTED IDENTITIES</span><strong>{accounts.length}</strong></div>
          </div>
        )}
        {status && <p className="account-status" role="status">{status}</p>}
      </section>
    </div>
  );
}
