"use client";

import { useState } from "react";
import { ACHIEVEMENTS } from "@/lib/arena/achievements";
import { todayKey } from "@/lib/arena/bounties";
import { totalUniqueCount } from "@/lib/arena/items";
import { importAdventureSave, type AdventureSave } from "@/lib/arena/progression";

function fmtTime(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  return `${seconds.toFixed(1)}s`;
}

/** Only today's record is meaningful — yesterday's roster is gone. */
function dailyBest(save: AdventureSave): number | undefined {
  return save.dailyChallengeRecord?.date === todayKey()
    ? save.dailyChallengeRecord.bestTime
    : undefined;
}

/** Higher is better for every one of these rows, so "who's ahead" is always
 *  a simple max() — bestBossRushTime is the one exception (lower is
 *  faster), handled separately below. */
function rowsFor(save: AdventureSave): Array<{ label: string; value: number; display: string }> {
  return [
    { label: "Character level", value: save.level, display: `${save.level}` },
    { label: "Ascension rank", value: save.ascension ?? 0, display: `${save.ascension ?? 0}` },
    { label: "Lifetime kills", value: save.kills, display: `${save.kills}` },
    {
      label: "Best Survival Fields wave",
      value: save.bestSurvivalWave ?? 0,
      display: `${save.bestSurvivalWave ?? 0}`,
    },
    {
      label: "Best Sundered Crucible wave",
      value: save.bestCrucibleWave ?? 0,
      display: `${save.bestCrucibleWave ?? 0}`,
    },
    {
      label: "Mythics found",
      value: (save.uniquesFound ?? []).length,
      display: `${(save.uniquesFound ?? []).length} / ${totalUniqueCount()}`,
    },
    {
      label: "Achievements",
      value: (save.achievements ?? []).length,
      display: `${(save.achievements ?? []).length} / ${ACHIEVEMENTS.length}`,
    },
    { label: "Gold on hand", value: save.gold, display: `${save.gold}` },
  ];
}

/** Every "best" the save already tracks, in one read-only screen. There's no
 *  server here, so there's no live leaderboard — but you can load a friend's
 *  previously-imported save file to compare side by side without touching
 *  your own active save. */
export function HallOfRecordsPanel({
  save,
  onClose,
}: {
  save: AdventureSave;
  onClose: () => void;
}) {
  const [friend, setFriend] = useState<AdventureSave | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mine = rowsFor(save);
  const theirs = friend ? rowsFor(friend) : null;

  const loadFriend = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = importAdventureSave(String(reader.result));
      if (!parsed) {
        setError("That doesn't look like a valid Paragon save file.");
        return;
      }
      setFriend(parsed);
      setError(null);
    };
    reader.readAsText(file);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Hall of Records</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          Your own best, kept locally — there's no server here to rank these against anyone
          else's automatically. Load a friend's exported save file to compare by hand instead.
        </p>

        <div className="records-list">
          <div className="records-row records-head">
            <span>Record</span>
            <span>You</span>
            {theirs && <span>{friend?.classId ?? "Friend"}</span>}
          </div>
          {mine.map((r, i) => {
            const theirRow = theirs?.[i];
            const mineWins = theirRow ? r.value >= theirRow.value : true;
            return (
              <div className="records-row" key={r.label}>
                <span>{r.label}</span>
                <strong className={theirRow && mineWins ? "records-ahead" : ""}>{r.display}</strong>
                {theirRow && (
                  <strong className={!mineWins ? "records-ahead" : ""}>{theirRow.display}</strong>
                )}
              </div>
            );
          })}
          <div className="records-row">
            <span>Fastest Boss Rush clear</span>
            <strong>{fmtTime(save.bestBossRushTime)}</strong>
            {friend && <strong>{fmtTime(friend.bestBossRushTime)}</strong>}
          </div>
          <div className="records-row">
            <span>Today&apos;s Daily Rift best</span>
            <strong>{fmtTime(dailyBest(save))}</strong>
            {friend && <strong>{fmtTime(dailyBest(friend))}</strong>}
          </div>
        </div>

        {error && <p className="hint" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}

        <label className="btn btn-ghost" style={{ width: "100%", marginTop: 14, display: "block", textAlign: "center", cursor: "pointer" }}>
          {friend ? "Load a different friend's save" : "Compare a friend's save"}
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) loadFriend(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
