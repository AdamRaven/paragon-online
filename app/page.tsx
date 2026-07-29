import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClassPortrait } from "@/components/ClassPortrait";
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
        <header className="hero">
          <div className="hero-text">
            <span className="eyebrow">Pixel-art platformer fighter</span>
            <h1 className="title">PARAGON</h1>
            <p className="tagline">
              Chain basic attacks into knockdowns, break combos with
              Manastop, dash through the arena and level up through three
              stages of enemies.
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <Image
              src="/art/paragon.webp"
              alt=""
              width={360}
              height={360}
              className="hero-art-img left"
              priority
            />
            <Image
              src="/art/shaedim.webp"
              alt=""
              width={360}
              height={360}
              className="hero-art-img right"
              priority
            />
          </div>
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

        <section className="card">
          <h2 className="section-title">Classes</h2>
          <div className="class-grid">
            {[PARAGON, SHEDIM, KACPER].map((c) => (
              <div
                key={c.id}
                className="class-card"
                style={{ "--aura": c.colors.aura } as React.CSSProperties}
              >
                <ClassPortrait classId={c.id} aura={c.colors.aura} size={104} />
                <div className="class-card-body">
                  <div className="class-card-head">
                    <strong>{c.name}</strong>
                    <span className="class-weapon">{c.weapon}</span>
                  </div>
                  <small>
                    {c.maxHp} HP · {c.maxMana} {c.manaLabel} · {c.attackPower} AP ·
                    range {c.rangeLevel}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 16 }}>
            Reach comes in four levels: Paragon&apos;s fists are level 1,
            Shedim&apos;s scythe level 2 and Kacper&apos;s greatsword level 3.
            Every class converts dashes and dash-jumps into combos.
          </p>
        </section>

        <section className="card">
          <h2 className="section-title">Controls</h2>
          <ul className="key-list key-list-grid">
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
      </div>
    </main>
  );
}
