# Paragon

A 2D pixel-art platformer fighting game for the browser, built with Next.js and
the Canvas 2D API. Two classes with frame-accurate combo chains, knockdowns and
ki skills, playable as a one-on-one duel or as a levelling campaign.

Everything is drawn procedurally — there are no image assets. The canvas
backing store *is* the low-resolution art buffer, stretched to fit by CSS with
`image-rendering: pixelated`, so the GPU does exactly one nearest-neighbour
upscale and every art pixel lands on the same block of screen pixels. Text uses
a hand-built 5x7 bitmap font rather than `fillText`, which would be antialiased.

## Running locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Deploying to Vercel

```bash
npm i -g vercel
vercel
```

Or import the repo at [vercel.com/new](https://vercel.com/new). No build
configuration or environment variables are needed — the whole game runs in the
browser.

## Modes

| Route | Mode | |
| --- | --- | --- |
| `/adventure` | **Campaign** | Three stages of mobs, experience, levels and stat points. Saved to `localStorage`. |
| `/arena` | **Duel** | One-on-one against an AI rival of the opposite class. |

Both run on the same engine: `AdventureEngine` extends `ArenaEngine`, so the
physics, combos, knockdowns and skills cannot drift apart between modes.

## Controls

| Action | Key |
| --- | --- |
| Move | `A` `D` |
| Up / down | `W` `S` |
| Jump | `Space` + `W` |
| Drop through a platform | `Space` + `S` |
| Sprint (×2 speed) | double-tap `D` or `A`, then hold |
| Normal attack | `LMB` |
| Heavy attack | `RMB` |
| Skills | `Q` `E` `R` `F` |
| Dash / special | `Shift` |
| Manaflow | hold `LMB`+`RMB` for 0.5s (costs 70 mana) |
| Inventory | `I` *(campaign)* |
| Talk to the merchant | `E` *(next to the stall)* |
| Character sheet / stages | `C` / `M` *(campaign)* |

## Classes

|  | Paragon | Shedim |
| --- | --- | --- |
| Weapon | Fists (crimson gauntlet) | Scythe |
| Health | 500 | 600 |
| Mana | 200 | 240 (Manapool) |
| Attack power | 25 | 20 |
| Mana per basic hit | 5 | 6 |
| Reach | 10% shorter | reference |
| `Q` | Reflect | Shadow Slash |
| `E` | Skyward Fist | Crescent Rend |
| `R` | ArmorBreak | Blade Flurry |
| `F` | Titan Slam (200 mana, 300%) | Black Hole (200 mana) |
| `Shift` | **Iron Dash** | **Shadow Dash** (phases through terrain) |

## Combat rules

Timings are stored in seconds and compared against a fixed 1/60s timestep, so
the numbers below are exact rather than rounded into frames. They live in
[lib/arena/constants.ts](lib/arena/constants.ts).

- **Basic attacks** — Paragon LMB 0.220s / RMB 0.350s; Shedim LMB 0.220s /
  RMB 0.390s.
- **Hitstun** — 0.200s from a single hit, 0.235s once a second lands while you
  are still staggered. You cannot move during it.
- **Knockdown** — 2.5s, fully immune to damage and CC, plus a 0.05s immunity
  window on standing up. *Mobs* get a shorter 0.7s knockdown; giving trash mobs
  the full 2.5s of immunity every third jab made the campaign crawl.
- **Combo finishers** — `LMB ×3` knocks down. `RMB ×4` knocks down as Paragon.
  Shedim launches instead if `W` is held on the third slash, stuns for 1.5s
  from a sprinting `RMB ×2`, and detonates a Void Blast on the fourth `RMB`
  above 180 mana.
- **Manaflow** — holding both mouse buttons for 0.5s with 70+ mana forces a
  self-knockdown, breaking whatever combo is being run on you.
- **Combokiller** *(Paragon)* — +5% skill damage per landed attack within 3s,
  up to 20 stacks.
- **Attack power** was raised from the original spec's 10 / 8 to 25 / 20 (the
  1.25 : 1 ratio is unchanged). At 10, a basic hit landed for 6 after armour and
  a level-1 mob took twelve hits; it now takes four.
- The follow-up window runs from the **end** of a swing. Paragon's 0.350s heavy
  exactly equals the 0.350s combo window, so measuring from the start made an
  `RMB` chain impossible.

## Progression (campaign)

Killing a mob grants experience on a `70·level^1.42 + 45·level` curve. Each
level gives 3 stat points:

| Stat | Effect |
| --- | --- |
| **STR** | Attack power |
| **AGI** | Move speed and attack animation speed |
| **VIT** | Maximum health |
| **FOC** | Maximum mana |

The starting 5 in each stat is the baseline, so a level-1 Paragon has exactly
500 HP / 200 mana / 25 AP and plays identically to the duel. Enemies more than
two levels below you give reduced experience.

## Loot, town and enhancement

Every kill rolls on a drop table: trash loot is common, gear is rarer, and
bosses roll four times with far better odds. Gear never drops above the mob's
tier, and rarity (Common → Epic) multiplies its stats and value.

Gear fills three slots — **weapon**, **armour**, **trinket** — and feeds
straight into the fighter: attack power, health, mana and move speed. Open the
bag with `I`.

**Emberhold** is a safe town stage with no mobs. Walk to the merchant's stall
and press `E` to open the shop:

- **Sell** trash loot for gold. Trash has no stats; that is its whole purpose.
- **Buy** enhancement stones at 45 gold each.
- **Enhance** any weapon or equipped item, one stone per attempt.

Each enhancement level adds 14% of the item's base stats, up to **+10**. The
success chance falls steeply as the level climbs (95% → 20%) and takes an extra
penalty from the weapon's **weight**, so pushing a Warden's Maul is a far worse
gamble than a pair of knuckles. Below **+4** a failure is safe; at +4 and above
it costs you a level. The chance shown in the shop is the real number the roll
uses — verified against 6,000 simulated attempts.

## Rendering

- [lib/arena/pixel.ts](lib/arena/pixel.ts) — drawing primitives (`px`,
  `pxCircle`, `pxDither`, `pxGlow`, `pxText`). `PIXEL_SCALE` controls how chunky
  the pixels are; `WORLD_PER_PIXEL` controls the camera zoom.
- [lib/arena/font.ts](lib/arena/font.ts) — the 5x7 bitmap font.
- Four biomes — town, outskirts, undercity and keep — each with their own sky
  bands, parallax silhouettes (houses, conifers, sewer arches, battlements),
  ground colour and ambience (stars and a moon, or drifting embers).
- Each mob species gets a flourish over the shared rig: the Husk's glowing eyes
  and torn cloth, the Brawler's broad shoulders and wraps, the Wraith's hover
  glow and violet blade, the Colossus's stone slabs and molten core, the
  Warden's crown and burning aura.
- Shedim's sprite is modelled on `shaedim.webp`: black plate with gold filigree,
  a closed great helm with a lit visor slit, and a scythe with a glowing cyan
  orb. His weapon is a scythe rather than a katana to match the art.
- Paragon's sprite is modelled on `paragon.webp`: masked face, bare chest, gold
  pauldron and ice crystal on the trailing side, crimson clawed gauntlet on the
  punching arm. The palette in `KIT` was sampled from that image.
- [lib/arena/render.ts](lib/arena/render.ts) — sky, parallax towers, tiled
  terrain and the character sprites. Every fighter is assembled from integer
  `fillRect` calls posed from its combat state, so the arm extends on the
  active frames of an attack and the silhouette changes when knocked down.

### Using your own art

The renderer is the only thing that would need to change. Drop a sprite sheet
in `public/sprites/` (Aseprite or TexturePacker JSON both work) with animations
named after the fighter states — `idle`, `walk`, `sprint`, `air`, `attack`,
`hitstun`, `knockdown`, `getup`, `dash` — and frames get mapped onto the
existing cast times, leaving all combat timing untouched.

## Layout

```
app/
  page.tsx            landing and mode select
  arena/page.tsx      duel
  adventure/page.tsx  campaign
components/
  ArenaClient.tsx     duel host: canvas, loop, input
  AdventureClient.tsx campaign host: plus EXP bar, stat sheet, stages
  ArenaHud.tsx        shared HUD
  InventoryPanel.tsx  bag and equipment (I)
  MerchantPanel.tsx   sell / buy stones / enhance
lib/arena/
  engine.ts           physics, combat, combos, knockdowns
  adventure.ts        campaign layer: mobs, EXP, levelling
  classes.ts          Paragon and Shedim
  constants.ts        every tunable timing
  mobs.ts             enemy types and the three stages
  progression.ts      EXP curve, stats, gear bonuses, save/load
  items.ts            loot tables, rarity, gear stats, enhancement
  input.ts            keyboard + mouse, double-tap sprint
  map.ts              the duel arena
  pixel.ts            pixel-art primitives and sizing
  font.ts             5x7 bitmap font
  render.ts           all drawing
  ai.ts               duel opponent
```

## Tuning

- **Feel** — acceleration, coyote time, jump buffering and jump-cut are at the
  bottom of [constants.ts](lib/arena/constants.ts).
- **Balance** — mob stats and stage layouts are plain data in
  [mobs.ts](lib/arena/mobs.ts); class numbers are in
  [classes.ts](lib/arena/classes.ts).
- **Look** — `PIXEL_SCALE` and `WORLD_PER_PIXEL` in
  [pixel.ts](lib/arena/pixel.ts), and the `PAL` palette in
  [render.ts](lib/arena/render.ts).
