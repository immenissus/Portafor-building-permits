import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import MarketingPage from "./marketing/page";

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    // Redirect to pricing (subscription gate in dashboard will handle the rest)
    redirect("/pricing");
  }

  return <MarketingPage />;
}
