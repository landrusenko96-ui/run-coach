import { ProfileForm } from "@/app/profile/ProfileForm";
import { PageHeader } from "@/components/PageHeader";

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile"
        description="Save the runner details that will later guide race goals and training plans."
      />
      <ProfileForm />
    </>
  );
}
