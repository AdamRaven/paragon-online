"use client";

import { bountyComplete, bountyMobName, bountyProgress, bountyReward } from "@/lib/arena/bounties";
import type { AdventureSave } from "@/lib/arena/progression";
import { WEEKLY_MILESTONES, weeklyProgress } from "@/lib/arena/weekly";

export function BountyBoard({
  save,
  onClaim,
  onClaimWeekly,
  onClose,
}: {
  save: AdventureSave;
  onClaim: () => void;
  onClaimWeekly: (index: number) => void;
  onClose: () => void;
}) {
  const bounty = save.dailyBounty;
  const progress = bountyProgress(save);
  const complete = bountyComplete(save);
  const reward = bountyReward(save);
  const weekProgress = weeklyProgress(save);
  const weeklyClaimed = save.weeklyClaimed ?? [];
  const nextWeekly = WEEKLY_MILESTONES.findIndex((_, i) => !weeklyClaimed.includes(i));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Bounty Board</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <h3 className="section-title">Daily</h3>
        {!bounty ? (
          <p className="hint">Nothing posted right now — check back soon.</p>
        ) : bounty.claimed ? (
          <p className="hint">
            Today&apos;s bounty is done. A new one is posted every day — come back tomorrow.
          </p>
        ) : (
          <>
            <div className="bounty-row">
              <strong>Defeat {bounty.goal}× {bountyMobName(bounty.typeId)}</strong>
              <div className="bar hpbar" style={{ marginTop: 8 }}>
                <div
                  className="bar-fill"
                  style={{ width: `${Math.min(100, (progress / bounty.goal) * 100)}%` }}
                />
                <div className="bar-text">
                  {Math.min(progress, bounty.goal)} / {bounty.goal}
                </div>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Reward: {reward.gold}g, {reward.stones} enhancement stones
              </p>
            </div>
            <button
              className="btn"
              style={{ width: "100%", marginTop: 12 }}
              disabled={!complete}
              onClick={onClaim}
            >
              {complete ? "Claim Reward" : "Not complete yet"}
            </button>
          </>
        )}

        <h3 className="section-title" style={{ marginTop: 20 }}>
          This Week — {weekProgress} kills
        </h3>
        <div className="weekly-track">
          {WEEKLY_MILESTONES.map((m, i) => {
            const claimed = weeklyClaimed.includes(i);
            const ready = !claimed && weekProgress >= m.goal;
            return (
              <div
                key={i}
                className={`weekly-row${claimed ? " done" : ""}${ready ? " ready" : ""}`}
              >
                <span>
                  {m.goal} kills — {m.gold}g, {m.stones} stones
                </span>
                {claimed ? (
                  <span className="weekly-claimed">✓ Claimed</span>
                ) : (
                  <button
                    className="btn tiny"
                    disabled={!ready}
                    onClick={() => onClaimWeekly(i)}
                  >
                    {ready ? "Claim" : "Locked"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {nextWeekly === -1 && (
          <p className="hint" style={{ marginTop: 8 }}>
            Full track cleared for this week — a fresh one starts Monday.
          </p>
        )}
      </div>
    </div>
  );
}
