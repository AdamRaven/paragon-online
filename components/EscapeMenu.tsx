"use client";

import Link from "next/link";
import { useState } from "react";
import { KeybindsPanel } from "@/components/KeybindsPanel";
import { loginRewardForStreak } from "@/lib/arena/streak";
import type { AdventureSave } from "@/lib/arena/progression";
import {
  getMusicVolume,
  getVolume,
  isMuted,
  playSound,
  setMuted,
  setMusicVolume,
  setVolume,
} from "@/lib/arena/sound";
import {
  getColorblindMode,
  getScreenShakeEnabled,
  setColorblindMode,
  setScreenShakeEnabled,
} from "@/lib/arena/settings";
import { WEEKLY_MILESTONES, weeklyProgress } from "@/lib/arena/weekly";

/** What's waiting if you come back tomorrow — shown once, on the way out,
 *  rather than nagging every session. Purely informational: no countdown,
 *  no "you'll lose X if you leave," just an honest preview. */
function tomorrowTeaser(save: AdventureSave | undefined): string[] {
  if (!save) return [];
  const lines: string[] = [];
  if (save.dailyBounty?.claimed) {
    lines.push("A new bounty will be posted tomorrow.");
  } else if (save.dailyBounty) {
    lines.push("Today's bounty is still open if you want to finish it first.");
  }
  const streak = save.loginStreak ?? 0;
  if (streak > 0) {
    const next = loginRewardForStreak(streak + 1);
    lines.push(`Come back tomorrow to keep your ${streak}-day streak (day ${streak + 1}: +${next.gold}g).`);
  }
  const weekKills = weeklyProgress(save);
  const nextMilestone = WEEKLY_MILESTONES.find(
    (m, i) => !(save.weeklyClaimed ?? []).includes(i) && weekKills < m.goal
  );
  if (nextMilestone) {
    lines.push(`${nextMilestone.goal - weekKills} more kills this week for the next weekly reward.`);
  }
  return lines;
}

export function EscapeMenu({
  onResume,
  onShowTutorial,
  save,
}: {
  onResume: () => void;
  onShowTutorial?: () => void;
  /** Campaign only — powers the "what's waiting tomorrow" preview on leave. */
  save?: AdventureSave;
}) {
  const [volume, setVolumeState] = useState(getVolume());
  const [musicVolume, setMusicVolumeState] = useState(getMusicVolume());
  const [muted, setMutedState] = useState(isMuted());
  const [shake, setShakeState] = useState(getScreenShakeEnabled());
  const [colorblind, setColorblindState] = useState(getColorblindMode());
  const [showControls, setShowControls] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  if (showControls) {
    return <KeybindsPanel onClose={() => setShowControls(false)} />;
  }

  if (showLeaveConfirm) {
    const teaser = tomorrowTeaser(save);
    return (
      <div className="overlay" onClick={() => setShowLeaveConfirm(false)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <h2>Leaving already?</h2>
          </div>
          {teaser.length > 0 ? (
            <ul className="leave-teaser">
              {teaser.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">Your progress is saved — see you next time.</p>
          )}
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 14 }}
            onClick={() => setShowLeaveConfirm(false)}
          >
            Keep Playing
          </button>
          <Link
            href="/"
            className="btn btn-danger"
            style={{ width: "100%", marginTop: 8, textAlign: "center" }}
            onClick={() => playSound("uiClick")}
          >
            Leave to Main Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onResume}>
      <div className="sheet escape-menu" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Paused</h2>
        </div>

        <button className="btn" style={{ width: "100%" }} onClick={onResume}>
          Resume
        </button>

        {onShowTutorial && (
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 8 }}
            onClick={onShowTutorial}
          >
            How to Play
          </button>
        )}

        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: 8 }}
          onClick={() => setShowControls(true)}
        >
          Edit Controls
        </button>

        <div className="escape-settings">
          <h3 className="section-title">Settings</h3>

          <div className="settings-row">
            <span>Sound</span>
            <button
              className="btn btn-ghost tiny"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                setMutedState(next);
                if (!next) playSound("uiClick");
              }}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          </div>

          <div className="settings-row">
            <span>SFX Volume</span>
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              disabled={muted}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolumeState(v);
                setVolume(v);
              }}
              onMouseUp={() => playSound("uiClick")}
            />
          </div>

          <div className="settings-row">
            <span>Music Volume</span>
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              disabled={muted}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMusicVolumeState(v);
                setMusicVolume(v);
              }}
            />
          </div>

          <div className="settings-row">
            <span>Screen shake</span>
            <button
              className="btn btn-ghost tiny"
              onClick={() => {
                const next = !shake;
                setScreenShakeEnabled(next);
                setShakeState(next);
                playSound("uiClick");
              }}
            >
              {shake ? "On" : "Off"}
            </button>
          </div>

          <div className="settings-row">
            <span>Colorblind-safe colors</span>
            <button
              className="btn btn-ghost tiny"
              onClick={() => {
                const next = !colorblind;
                setColorblindMode(next);
                setColorblindState(next);
                playSound("uiClick");
              }}
            >
              {colorblind ? "On" : "Off"}
            </button>
          </div>
        </div>

        <button
          className="btn btn-danger"
          style={{ width: "100%", marginTop: 18 }}
          onClick={() => setShowLeaveConfirm(true)}
        >
          Leave to Main Menu
        </button>
      </div>
    </div>
  );
}
