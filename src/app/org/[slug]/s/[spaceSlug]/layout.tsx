import { SpaceShell } from "@/components/layout/space-shell";
import { getSpaceViewerContext } from "@/lib/space-auth";

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; spaceSlug: string }>;
}) {
  const { slug, spaceSlug } = await params;
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
  });

  if (!context) return null;

  return (
    <SpaceShell
      canInteract={context.canInteract}
      currentSpace={context.space}
      spaces={context.accessibleSpaces.map(({ space }) => space)}
      viewer={context.viewer}
    >
      {children}
    </SpaceShell>
  );
}
