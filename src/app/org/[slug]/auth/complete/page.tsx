import { AuthCompleteClient } from "@/components/auth/auth-complete-client";

export default async function AuthCompletePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <AuthCompleteClient slug={slug} />;
}
