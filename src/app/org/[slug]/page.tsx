import { MySpacesView } from "@/components/community/my-spaces-view";
import { getMySpacesContext } from "@/lib/space-auth";

export default async function OrganizationLanding({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { mainSpace, spaces, viewer } = await getMySpacesContext(slug);

  return (
    <MySpacesView
      accessibleSpaces={spaces.map(({ space }) => space)}
      mainSpace={mainSpace}
      viewer={viewer}
    />
  );
}
