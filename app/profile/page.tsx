import { PageHeader } from "@/components/PageHeader";

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile"
        description="This page will store the runner profile used to create safe and realistic training plans."
      />
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium">Runner details</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Placeholder: experience level, recent mileage, available training
          days, injury notes, and preferences will eventually live here.
        </p>
      </div>
    </>
  );
}
