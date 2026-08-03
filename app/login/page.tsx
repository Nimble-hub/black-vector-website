import type { Metadata } from "next";
import { AuthScreen } from "@/app/auth-screen";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const query = await searchParams;
  return <AuthScreen mode="login" returnTo={query.returnTo} />;
}
