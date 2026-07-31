"use client";

import { useState } from "react";
import { Keycap } from "@/components/KeyList";
import { playSound } from "@/lib/arena/sound";

interface Step {
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Move & jump",
    body: (
      <>
        <p>
          <Keycap>A</Keycap> <Keycap>D</Keycap> to move, <Keycap>W</Keycap>{" "}
          <Keycap>S</Keycap> to aim up or down. Jump needs both{" "}
          <Keycap>Space</Keycap> and <Keycap>W</Keycap> together — hold either one to
          keep rising, release both for a short hop.
        </p>
        <p>
          <Keycap>Space</Keycap> + <Keycap>S</Keycap> drops you through a one-way
          platform instead.
        </p>
      </>
    ),
  },
  {
    title: "Dash",
    body: (
      <p>
        Tap <Keycap>D</Keycap>
        <Keycap>D</Keycap> and hold to sprint at double speed — you'll need it to clear
        the gap in the middle of the arena, and some skills only work while sprinting.
      </p>
    ),
  },
  {
    title: "Attacks",
    body: (
      <p>
        <Keycap wide>LMB</Keycap> is your fast basic attack — three in a row ends in a
        knockdown. <Keycap wide>RMB</Keycap> is slower and hits harder. Chain them to
        build toward a finisher.
      </p>
    ),
  },
  {
    title: "Skills",
    body: (
      <>
        <p>
          <Keycap>Q</Keycap> <Keycap>E</Keycap> <Keycap>R</Keycap> <Keycap>F</Keycap>{" "}
          and <Keycap>C</Keycap> are your class's five skills, shown along the
          bottom of the screen with their cooldowns. Every class plays differently —
          press <Keycap>Tab</Keycap> any time during a fight to see the full move list
          for whoever you're playing.
        </p>
      </>
    ),
  },
  {
    title: "Manastop",
    body: (
      <p>
        Getting comboed? Hold <Keycap wide>LMB</Keycap>+<Keycap wide>RMB</Keycap>{" "}
        together for 0.5s once you have 70 mana to break free of the combo instantly —
        it costs the mana either way, so save it for when you're actually stuck.
      </p>
    ),
  },
];

const SEEN_KEY = "paragon-arena:tutorial-seen:v1";

export function hasSeenTutorial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTutorialSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  const finish = () => {
    markTutorialSeen();
    playSound("uiClick");
    onClose();
  };

  return (
    <div className="overlay">
      <div className="sheet tutorial-sheet">
        <div className="sheet-head">
          <div>
            <h2>How to Play</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={finish}>
            Skip
          </button>
        </div>

        <div className="tutorial-step">
          <h3 className="section-title">{s.title}</h3>
          <div className="tutorial-body">{s.body}</div>
        </div>

        <div className="tutorial-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`tutorial-dot${i === step ? " active" : ""}`} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {step > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                playSound("uiClick");
                setStep((n) => n - 1);
              }}
            >
              Back
            </button>
          )}
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => {
              if (last) {
                finish();
              } else {
                playSound("uiClick");
                setStep((n) => n + 1);
              }
            }}
          >
            {last ? "Let's go" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
