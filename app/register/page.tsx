import type { Metadata } from "next";
import { AuthScreen } from "@/app/auth-screen";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; intent?: string }> }) {
  const query = await searchParams;
  const returnTo = query.returnTo || (query.intent === "playtest" ? "/account?tab=playtest" : "/account");
  return <AuthScreen mode="register" returnTo={returnTo} />;
}
