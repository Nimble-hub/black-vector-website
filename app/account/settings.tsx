"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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

async function prepareAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Select an image file.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Source image must be under 12 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");
  const crop = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, 256, 256);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) throw new Error("Image conversion failed.");
  return blob;
}

export function AccountSettings({
  user,
  accounts,
  providers,
  initialProfile,
  initialTab,
  initialStatus,
  emailRequired,
  displayNameRequired,
  returnTo,
}: {
  user: { id: string; name: string; email: string; emailVerified: boolean; image: string | null };
  accounts: AccountRecord[];
  providers: ProviderAvailability;
  initialProfile: PlayerProfile | null;
  initialTab: "profile" | "connections" | "security";
  initialStatus: string;
  emailRequired: boolean;
  displayNameRequired: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"profile" | "connections" | "security">(initialTab);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(user.image);
  const [needsDisplayName, setNeedsDisplayName] = useState(displayNameRequired);
  const [pendingContactEmail, setPendingContactEmail] = useState("");
  const linked = useMemo(() => new Map(accounts.map((item) => [item.providerId, item])), [accounts]);
  const verificationCallbackURL = `/auth/continue?returnTo=${encodeURIComponent(returnTo)}`;
  const hasSyntheticEmail = user.email.toLowerCase().endsWith(".invalid");

  const uploadAvatar = async (file: File) => {
    setBusy(true);
    setStatus("Preparing profile image...");
    try {
      const blob = await prepareAvatar(file);
      const body = new FormData();
      body.set("avatar", new File([blob], "avatar.webp", { type: "image/webp" }));
      const response = await fetch("/api/account/avatar", { method: "POST", body });
      const data = await response.json() as { image?: string; error?: string };
      if (!response.ok || !data.image) throw new Error(data.error || "Profile image upload failed.");
      setAvatar(data.image);
      setStatus("Profile image synchronized.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile image upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = async () => {
    setBusy(true);
    const response = await fetch("/api/account/avatar", { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (response.ok) {
      setAvatar(null);
      setStatus("Profile image removed.");
    } else setStatus(data.error || "Profile image could not be removed.");
    setBusy(false);
  };

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
    const update = { name, displayNameSet: true } as Parameters<
      typeof authClient.updateUser
    >[0] & { displayNameSet: boolean };
    const result = await authClient.updateUser(update);
    if (result.error) {
      setStatus(result.error.message || "Update failed.");
    } else {
      const shouldReturn = needsDisplayName && returnTo !== "/";
      setNeedsDisplayName(false);
      setStatus("Public display name updated.");
      if (shouldReturn) router.push(returnTo);
      else router.refresh();
    }
    setBusy(false);
  };

  const changeEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const newEmail = String(new FormData(event.currentTarget).get("newEmail") || "").trim();
    if (hasSyntheticEmail) {
      const response = await fetch("/api/account/contact-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, callbackURL: verificationCallbackURL }),
      });
      const data = await response.json() as { error?: string; requiresMerge?: boolean };
      if (!response.ok) {
        setStatus(data.error || "Verification could not be transmitted.");
      } else {
        setPendingContactEmail(newEmail);
        setStatus(data.requiresMerge
          ? "This email already has a Black Vector profile. We sent it a secure approval link to combine that profile with this Steam identity."
          : "Verification accepted by the mail provider. Check your inbox and spam folder.");
      }
      setBusy(false);
      return;
    }
    const result = await authClient.changeEmail({
      newEmail,
      callbackURL: verificationCallbackURL,
    });
    if (result.error) {
      setStatus(result.error.message || "Email change could not be started.");
    } else {
      setPendingContactEmail(newEmail);
      setStatus("Verification transmitted to the new address.");
    }
    setBusy(false);
  };

  const resendPendingEmail = async () => {
    if (!pendingContactEmail) return;
    setBusy(true);
    setStatus("");
    if (hasSyntheticEmail) {
      const response = await fetch("/api/account/contact-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: pendingContactEmail,
          callbackURL: verificationCallbackURL,
        }),
      });
      const data = await response.json() as { error?: string; requiresMerge?: boolean };
      setStatus(
        response.ok
          ? data.requiresMerge
            ? "Steam connection approval sent again. Check that inbox and its spam folder."
            : "Verification accepted again. Check your inbox and spam folder."
          : data.error || "Verification could not be retransmitted.",
      );
      setBusy(false);
      return;
    }
    const result = await authClient.changeEmail({
      newEmail: pendingContactEmail,
      callbackURL: verificationCallbackURL,
    });
    setStatus(
      result.error
        ? result.error.message || "Verification could not be retransmitted."
        : "Verification retransmitted. Check your inbox and spam folder.",
    );
    setBusy(false);
  };

  const verifyCurrentEmail = async () => {
    setBusy(true);
    setStatus("");
    const result = await authClient.sendVerificationEmail({
      email: user.email,
      callbackURL: verificationCallbackURL,
    });
    setStatus(
      result.error
        ? result.error.message || "Verification could not be transmitted."
        : "Verification transmitted. Check your inbox.",
    );
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
        <button className="account-signout" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => { router.push("/"); router.refresh(); } } })}>SIGN OUT</button>
      </aside>

      <section className="account-content">
        {tab === "profile" && (
          <div className="account-view">
            <div className="account-view-heading"><p className="eyebrow">PLAYER RECORD // PLAYTEST INTAKE</p><h1>PROFILE &amp; ACCESS.</h1><p>Choose how the development team can identify and contact you for future test waves.</p></div>
            {emailRequired && (
              <section className="account-email-required" role="alert">
                <div>
                  <small>ACCOUNT SETUP // ACTION REQUIRED</small>
                  <h2>{hasSyntheticEmail ? "ADD AND VERIFY YOUR EMAIL." : "VERIFY YOUR CONTACT CHANNEL."}</h2>
                  <p>
                    {hasSyntheticEmail
                      ? "Steam does not share your email with Black Vector. Enter the inbox where you want playtest invitations, access windows, and account notices sent."
                      : "Confirm this inbox for playtest invitations, access windows, security notices, and major account updates."}
                  </p>
                </div>
                <strong>{hasSyntheticEmail ? "EMAIL ADDRESS REQUIRED" : "EMAIL VERIFICATION REQUIRED"}</strong>
              </section>
            )}
            {emailRequired && hasSyntheticEmail && (pendingContactEmail ? (
              <section className="settings-form contact-channel-required" aria-live="polite">
                <h2>CHECK YOUR INBOX</h2>
                <p>
                  We sent a verification link to <strong>{pendingContactEmail}</strong>.
                  If it does not arrive, check spam or retransmit it below.
                </p>
                <div className="contact-channel-actions">
                  <button type="button" disabled={busy || !providers.manual} onClick={() => void resendPendingEmail()}>RESEND VERIFICATION</button>
                  <button type="button" disabled={busy} onClick={() => { setPendingContactEmail(""); setStatus(""); }}>USE A DIFFERENT EMAIL</button>
                </div>
              </section>
            ) : (
              <form className="settings-form contact-channel-required" onSubmit={changeEmail}>
                <h2>ENTER YOUR EMAIL</h2>
                <p>We will send a verification link before replacing the private Steam placeholder.</p>
                <label><span>EMAIL ADDRESS</span><input name="newEmail" type="email" autoComplete="email" required autoFocus /></label>
                <button type="submit" disabled={busy || !providers.manual}>SEND VERIFICATION</button>
              </form>
            ))}
            {emailRequired && !hasSyntheticEmail && (
              <section className="settings-form contact-channel-required">
                <h2>CHECK YOUR INBOX</h2>
                <p>{user.email} is waiting for confirmation. If it did not arrive, check spam or send another link.</p>
                <button type="button" disabled={busy || !providers.manual} onClick={() => void verifyCurrentEmail()}>RESEND VERIFICATION</button>
              </section>
            )}
            {needsDisplayName && (
              <section className="account-email-required account-display-required" role="alert">
                <div>
                  <small>PUBLIC IDENTITY // ACTION REQUIRED</small>
                  <h2>CHOOSE YOUR DISPLAY NAME.</h2>
                  <p>
                    Your provider name stays private. We assigned a neutral
                    callsign for community chat, forums, friends, and clans.
                    Replace it below with any public name you want to use.
                  </p>
                </div>
                <strong>DISPLAY NAME REQUIRED</strong>
              </section>
            )}
            <section className="settings-form avatar-settings" aria-labelledby="avatar-settings-title">
              <div className="avatar-preview">
                {avatar ? <Image src={avatar} alt="Current profile" width={112} height={112} unoptimized /> : <span>{user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
              </div>
              <div>
                <h2 id="avatar-settings-title">PROFILE IMAGE</h2>
                <p>Square images work best. Your source is cropped and compressed locally before upload.</p>
                <div className="avatar-actions">
                  <label className={busy ? "is-disabled" : ""}>UPLOAD IMAGE<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = ""; }} /></label>
                  {avatar && <button type="button" disabled={busy} onClick={() => void removeAvatar()}>REMOVE</button>}
                </div>
              </div>
            </section>
            <form className="settings-form" onSubmit={saveIdentity}>
              <h2>IDENTITY</h2>
              <label><span>DISPLAY NAME</span><input name="name" defaultValue={user.name} minLength={2} maxLength={48} required /></label>
              <label><span>PRIMARY EMAIL</span><input value={hasSyntheticEmail ? "Steam identity — verified email required" : user.email} disabled /></label>
              <button type="submit" disabled={busy}>UPDATE IDENTITY</button>
            </form>
            {!hasSyntheticEmail && user.emailVerified && (
              <form className="settings-form" onSubmit={changeEmail}>
                <h2>CONTACT CHANNEL</h2>
                <p>Changing this address requires confirmation at the new inbox.</p>
                <label><span>NEW EMAIL ADDRESS</span><input name="newEmail" type="email" autoComplete="email" required /></label>
                <button type="submit" disabled={busy || !providers.manual}>VERIFY NEW EMAIL</button>
              </form>
            )}
            <form className="settings-form" onSubmit={saveProfile}>
              <h2>PLAYTEST PROFILE</h2>
              <label><span>CALLSIGN</span><input name="callsign" defaultValue={initialProfile?.callsign || ""} maxLength={32} /></label>
              <div className="settings-row">
                <label><span>PRIMARY PLATFORM</span><select name="preferredPlatform" defaultValue={initialProfile?.preferredPlatform || "windows"}><option value="windows">Windows</option><option value="linux">Linux</option><option value="mac">macOS</option></select></label>
                <label><span>STRATEGY EXPERIENCE</span><select name="strategyExperience" defaultValue={initialProfile?.strategyExperience || "intermediate"}><option value="new">New commander</option><option value="intermediate">Experienced</option><option value="veteran">Veteran / competitive</option></select></label>
              </div>
              <label className="settings-check"><input name="playtestOptIn" type="checkbox" defaultChecked={initialProfile?.playtestOptIn || false} /><span>Place me in the Black Vector playtest candidate pool.</span></label>
              <label className="settings-check"><input name="developmentUpdatesOptIn" type="checkbox" defaultChecked={initialProfile?.developmentUpdatesOptIn || false} /><span>Send optional development news, release announcements, and studio updates. Account and enrolled-playtest notices are sent separately.</span></label>
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
