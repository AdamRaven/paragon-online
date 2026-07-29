import type { Metadata } from "next";
import Link from "next/link";
import { KACPER, PARAGON, SHEDIM } from "@/lib/arena/classes";
import { STAGES } from "@/lib/arena/mobs";

export const metadata: Metadata = {
  title: "Paragon — 2D Platformer Fighter",
  description:
    "A 2D pixel-art platformer fighting game. Three classes, frame-accurate combos, knockdowns and a levelling campaign.",
};

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <header>
          <h1 className="title">PARAGON</h1>
          <p className="tagline">
            A 2D pixel-art platformer fighter. Chain basic attacks into
            knockdowns, break combos with Manastop, dash through the arena and
            level up through three stages of enemies.
          </p>
        </header>

        <section className="card">
          <h2 className="section-title">Play</h2>
          <div className="zone-list">
            <Link className="zone-option" href="/adventure">
              <span>
                <strong>Campaign</strong>
                <small>
                  Fight through {STAGES.length} stages of mobs for experience,
                  levels and stat points. Progress is saved.
                </small>
              </span>
              <span className="badge">START</span>
            </Link>
            <Link className="zone-option" href="/arena">
              <span>
                <strong>Duel</strong>
                <small>
                  One-on-one against a rival of another class. Same
                  movement, combos and skills.
                </small>
              </span>
              <span className="badge">START</span>
            </Link>
          </div>
        </section>

        <div className="grid-2">
          <section className="card">
            <h2 className="section-title">Controls</h2>
            <ul className="key-list">
              <li>
                <span>Move</span>
                <span>
                  <kbd>A</kbd> <kbd>D</kbd>
                </span>
              </li>
              <li>
                <span>Up / down</span>
                <span>
                  <kbd>W</kbd> <kbd>S</kbd>
                </span>
              </li>
              <li>
                <span>Jump</span>
                <span>
                  <kbd>Space</kbd> + <kbd>W</kbd>
                </span>
              </li>
              <li>
                <span>Drop through platform</span>
                <span>
                  <kbd>Space</kbd> + <kbd>S</kbd>
                </span>
              </li>
              <li>
                <span>Dash (×2 speed)</span>
                <span>
                  tap <kbd>D</kbd><kbd>D</kbd> and hold
                </span>
              </li>
              <li>
                <span>Normal attack</span>
                <kbd>LMB</kbd>
              </li>
              <li>
                <span>Heavy attack</span>
                <kbd>RMB</kbd>
              </li>
              <li>
                <span>Skills</span>
                <span>
                  <kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>F</kbd>
                </span>
              </li>
              <li>
                <span>Dash / special</span>
                <kbd>Shift</kbd>
              </li>
              <li>
                <span>Manastop (70 mana)</span>
                <span>
                  hold <kbd>LMB</kbd>+<kbd>RMB</kbd>
                </span>
              </li>
            </ul>
          </section>

          <section className="card">
            <h2 className="section-title">Classes</h2>
            {[PARAGON, SHEDIM, KACPER].map((c) => (
              <div key={c.id} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <strong>{c.name}</strong>
                  <span style={{ color: "var(--muted)", fontSize: 11 }}>
                    {c.weapon}
                  </span>
                </div>
                <small
                  style={{
                    color: "var(--muted)",
                    fontSize: 11,
                    display: "block",
                    marginTop: 3,
                  }}
                >
                  {c.maxHp} HP · {c.maxMana} {c.manaLabel} · {c.attackPower} AP ·
                  range {c.rangeLevel}
                </small>
              </div>
            ))}
            <p className="hint">
              Reach comes in four levels: Paragon&apos;s fists are level 1,
              Shedim&apos;s scythe level 2 and Kacper&apos;s greatsword level 3.
              Every class converts dashes and dash-jumps into combos.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
