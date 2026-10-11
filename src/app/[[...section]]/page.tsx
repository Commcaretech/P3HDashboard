import DashboardApp from "@/components/app";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return (
    <DashboardApp
      section={section?.[0] ?? "dashboard"}
      recordId={section?.[1]}
    />
  );
}
