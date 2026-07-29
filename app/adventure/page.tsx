import type { Metadata } from "next";
import { AdventureClient } from "@/components/AdventureClient";

export const metadata: Metadata = {
  title: "Campaign — 2D Arena with EXP",
  description:
    "The 2D arena as a levelling campaign: fight mobs, earn experience and spend stat points.",
};

export default function AdventurePage() {
  return <AdventureClient />;
}
