import { notFound } from "next/navigation";
import ScheduleScreen from "@/components/schedule-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ publicId: string; section?: string[] }>;
}) {
  const { publicId, section = [] } = await params;
  if (
    section.length > 1 ||
    (section[0] &&
      ![
        "availability",
        "results",
        "vote",
        "members",
        "discussion",
        "more",
        "manage",
        "confirmed",
      ].includes(section[0]))
  )
    notFound();
  return <ScheduleScreen id={publicId} section={section[0] ?? "overview"} />;
}
