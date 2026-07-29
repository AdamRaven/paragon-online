import type { Metadata } from "next";
import { ArenaClient } from "@/components/ArenaClient";

export const metadata: Metadata = {
  title: "Arena — 2D Platformer Duel",
  description:
    "A 2D platformer fighting game. Paragon and Shedim duel with combo chains, knockdowns and ki techniques.",
};

export default function ArenaPage() {
  return <ArenaClient />;
}
