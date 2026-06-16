import { TaskChooseOrganization } from "@clerk/nextjs";

export default function ChooseOrganizationTaskPage() {
  return <TaskChooseOrganization redirectUrlComplete="/org/wavespark/onboarding" />;
}
