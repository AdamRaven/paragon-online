"use client";

import type { AdventureSave } from "@/lib/arena/progression";

/** A one-time congratulatory screen for the two hardest, most open-ended
 *  completion goals the save tracks — every unique found, and a deep
 *  Ascension rank. There's no further content past this, so it's the
 *  closest thing the campaign has to a "you've beaten it" moment. */
export function RunCompleteModal({
  save,
  onClose,
}: {
  save: AdventureSave;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet run-complete" onClick={(e) => e.stopPropagation()}>
        <h2 className="run-complete-title">Legend</h2>
        <p>
          Every named relic in the realm sits in your vault, and {save.ascension} Ascensions
          have remade you that many times over. There's no boss left that hasn't fallen to you,
          no throne left uncontested.
        </p>
        <p className="hint">
          The road doesn't end here — Boss Rush, the Crucible and the Survival Fields are always
          ready for another attempt, and there's always a faster time or a longer streak to chase.
          But this is the moment worth marking.
        </p>
        <div className="run-complete-stats">
          <span>Level {save.level}</span>
          <span>Ascension {save.ascension}</span>
          <span>{save.kills} kills</span>
          <span>{(save.achievements ?? []).length} achievements</span>
        </div>
        <button className="btn" style={{ width: "100%", marginTop: 16 }} onClick={onClose}>
          Keep playing
        </button>
      </div>
    </div>
  );
}
