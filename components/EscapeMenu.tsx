"use client";

import Link from "next/link";
import { useState } from "react";
import { getVolume, isMuted, playSound, setMuted, setVolume } from "@/lib/arena/sound";

export function EscapeMenu({
  onResume,
  onShowTutorial,
}: {
  onResume: () => void;
  onShowTutorial?: () => void;
}) {
  const [volume, setVolumeState] = useState(getVolume());
  const [muted, setMutedState] = useState(isMuted());

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
            <span>Volume</span>
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
        </div>

        <Link
          href="/"
          className="btn btn-danger"
          style={{ width: "100%", marginTop: 18, textAlign: "center" }}
          onClick={() => playSound("uiClick")}
        >
          Leave to Main Menu
        </Link>
      </div>
    </div>
  );
}
