import type { ClassId } from "./types";

/** The shared control language every class's combo strings are built from. */
export interface BaseInput {
  input: string;
  meaning: string;
  description: string;
}

export const BASE_INPUTS: BaseInput[] = [
  { input: "LMB", meaning: "Light Attack", description: "Main basic attack button. Used for normal combo strings." },
  { input: "RMB", meaning: "Heavy Attack", description: "Secondary attack button. Usually stronger attacks, launchers, or special properties." },
  { input: "DD", meaning: "Dash Forward", description: "Double tap right movement key. Used for dash attacks and mobility combos." },
  { input: "AA", meaning: "Dash Backward", description: "Double tap left movement key. Used for backward dash attacks." },
  { input: "WJump", meaning: "Jump", description: "Jump input (W + Space). Used for aerial attacks and air combos." },
  { input: "W (hold)", meaning: "Up Direction", description: "Holding the up direction during a combo input. Usually creates launchers or aerial follow-ups." },
  { input: "S (hold)", meaning: "Down Direction", description: "Holding down direction. Used for certain downward attacks or special inputs." },
  { input: "DD WJump", meaning: "Forward Air Movement", description: "Dash forward then jump. Used for aerial chase attacks." },
  { input: "AA WJump", meaning: "Backward Air Movement", description: "Dash backward then jump. Used for retreating aerial attacks." },
  { input: "LMB / RMB", meaning: "Standing Attack", description: "Attack without movement input." },
  { input: "DD / AA (after attack)", meaning: "Dash Cancel", description: "Used to continue combos, reset positioning, and avoid knockdown." },
  { input: "W + Attack", meaning: "Launch Attack", description: "Attack that sends the enemy upward for air combos." },
  { input: "WJump LMB/RMB", meaning: "Aerial Combo", description: "Attack performed after launching an enemy." },
  { input: "→ Repeat", meaning: "Infinite / Extended Combo", description: "Continue the combo string if the enemy remains airborne." },
  { input: "Ctrl", meaning: "Awakening Activation", description: "Activates the character's awakening state/passive ability. Used to trigger enhanced attacks, buffs, or special effects during combat." },
];

export interface ClassCombo {
  input: string;
  name: string;
  description: string;
  knockdown: boolean;
  stoic: boolean;
}

export const CLASS_COMBOS: Record<ClassId, ClassCombo[]> = {
  paragon: [
    { input: "LMB LMB LMB LMB", name: "4 Fist Combo", description: "Four fist strikes. Final hit creates a gauntlet impact that knocks the enemy down.", knockdown: true, stoic: false },
    { input: "LMB LMB LMB RMB", name: "Gauntlet Burst Finish", description: "Three fist strikes followed by a powerful gauntlet burst.", knockdown: true, stoic: false },
    { input: "RMB RMB RMB LMB", name: "Heavy Gauntlet Strike", description: "Heavy gauntlet attacks ending with an upward fist strike.", knockdown: true, stoic: false },
    { input: "RMB RMB RMB RMB", name: "Impact Combo", description: "Heavy attacks followed by a powerful gauntlet explosion.", knockdown: true, stoic: false },
    { input: "DD LMB LMB (or AA LMB LMB)", name: "Dash Fist Combo", description: "Dash forward into two quick fist strikes.", knockdown: false, stoic: false },
    { input: "DD RMB RMB (or AA RMB RMB)", name: "Dash Gauntlet Grab", description: "Dash attack followed by a heavy gauntlet strike.", knockdown: true, stoic: false },
    { input: "WJump LMB", name: "Jump Fist Strike", description: "Single aerial fist attack.", knockdown: false, stoic: false },
    { input: "WJump RMB", name: "Jump Gauntlet Smash", description: "Aerial gauntlet attack.", knockdown: false, stoic: false },
    { input: "DD WJump LMB LMB (or AA WJump LMB LMB)", name: "Dash Jump Fist Combo", description: "Air dash into two fist strikes.", knockdown: false, stoic: false },
    { input: "DD WJump RMB (or AA WJump RMB)", name: "Dash Jump Impact", description: "Air dash followed by a heavy gauntlet attack.", knockdown: false, stoic: false },
    { input: "LMB LMB LMB W+LMB", name: "Rising Fist", description: "Three fist strikes ending with an upward launcher.", knockdown: false, stoic: false },
    { input: "DD LMB LMB W+LMB (or AA LMB LMB W+LMB)", name: "Dash Rising Fist", description: "Dash combo ending in an upward launcher.", knockdown: false, stoic: false },
    { input: "LMB LMB LMB W+LMB LMB", name: "Extended Rising Gauntlet", description: "Launcher followed by aerial gauntlet strikes.", knockdown: true, stoic: false },
    { input: "DD LMB LMB W+LMB LMB (or AA LMB LMB W+LMB LMB)", name: "Dash Extended Rising Gauntlet", description: "Dash launcher followed by aerial gauntlet strikes.", knockdown: true, stoic: false },
    { input: "DD WJump LMB LMB (or AA WJump LMB LMB)", name: "Air Chase Fist Combo", description: "Air pursuit combo after launching an enemy.", knockdown: false, stoic: false },
    { input: "LMB LMB RMB", name: "Gauntlet Impact Cancel", description: "Fist combo ending with a gauntlet impact attack.", knockdown: false, stoic: false },
    { input: "LMB LMB RMB RMB", name: "Gauntlet Explosion Combo", description: "Fist attacks followed by a stronger gauntlet explosion.", knockdown: true, stoic: false },
    { input: "RMB LMB", name: "Rising Gauntlet Punch", description: "Gauntlet-powered rising attack.", knockdown: false, stoic: false },
  ],
  shedim: [
    { input: "LMB LMB LMB LMB", name: "4 Slash Combo", description: "Four sword slashes. Final hit knocks down.", knockdown: true, stoic: false },
    { input: "LMB LMB LMB RMB", name: "Fire Finish", description: "Three slashes followed by a Groundslam fire burst. Good finisher.", knockdown: true, stoic: false },
    { input: "RMB RMB RMB LMB", name: "Polearm Slash", description: "Three claw attacks ending with an upward slash that launches the enemy.", knockdown: true, stoic: false },
    { input: "RMB RMB RMB RMB", name: "Slayer Combo", description: "Two heavy strikes followed by a powerful blast.", knockdown: false, stoic: false },
    { input: "DD LMB LMB (or AA LMB LMB)", name: "Dash Slash", description: "Dash into two quick sword slashes.", knockdown: false, stoic: false },
    { input: "DD RMB RMB (or AA RMB RMB)", name: "Dash Polearm Grab", description: "Dash attack that briefly stuns/grabs.", knockdown: false, stoic: false },
    { input: "WJump LMB", name: "Jump Slash", description: "Single aerial sword slash.", knockdown: false, stoic: false },
    { input: "WJump RMB", name: "Jump Hint", description: "Single aerial claw strike with knockdown.", knockdown: false, stoic: false },
    { input: "DD WJump LMB LMB (or AA WJump LMB LMB)", name: "Dash Jump Slash", description: "Air dash into two sword slashes.", knockdown: false, stoic: false },
    { input: "DD WJump RMB (or AA WJump RMB)", name: "Dash Jump Fire", description: "Air dash followed by a heavy slam.", knockdown: false, stoic: false },
    { input: "LMB LMB LMB W+LMB", name: "Launch Combo", description: "Three slashes ending with an uppercut launcher.", knockdown: true, stoic: false },
    { input: "DD LMB LMB W+LMB (or AA LMB LMB W+LMB)", name: "Dash Launch", description: "Dash combo ending in a launcher.", knockdown: true, stoic: false },
    { input: "LMB LMB LMB W+LMB LMB", name: "Extended Launch", description: "Launcher followed by two aerial sword slashes before landing.", knockdown: false, stoic: true },
    { input: "DD LMB LMB W+LMB LMB (or AA LMB LMB W+LMB LMB)", name: "Dash Extended Launch", description: "Dash launcher with aerial follow-up.", knockdown: false, stoic: true },
    { input: "DD WJump LMB LMB (or AA WJump LMB LMB)", name: "Air Chase", description: "Improved aerial pursuit after launching an enemy.", knockdown: false, stoic: false },
    { input: "DD WJump LMB RMB", name: "Air Chase (Wave)", description: "Improved aerial pursuit, launches wave slash.", knockdown: false, stoic: false },
  ],
  kacper: [
    { input: "LMB LMB LMB LMB", name: "4 Slash Combo", description: "Standard four-hit sword combo. Final hit knocks the enemy down.", knockdown: true, stoic: false },
    { input: "LMB LMB LMB RMB", name: "Stab Finish", description: "Three slashes followed by a powerful thrust.", knockdown: true, stoic: false },
    { input: "RMB RMB RMB", name: "Heavy Slash", description: "Heavy sword combo ending in a knockdown attack.", knockdown: true, stoic: false },
    { input: "RMB RMB LMB", name: "Upper Slash", description: "Heavy attacks ending in a launcher.", knockdown: false, stoic: false },
    { input: "DD LMB LMB", name: "Dash Slash", description: "Dash into two quick slashes.", knockdown: true, stoic: false },
    { input: "AA LMB LMB", name: "Back Dash Slash", description: "Dash left into two quick slashes.", knockdown: true, stoic: false },
    { input: "DD RMB", name: "Dash Heavy Slash", description: "Powerful advancing slash.", knockdown: true, stoic: false },
    { input: "AA RMB", name: "Back Dash Heavy Slash", description: "Powerful backward advancing slash.", knockdown: true, stoic: false },
    { input: "WJump LMB", name: "Jump Slash", description: "Basic aerial slash.", knockdown: false, stoic: false },
    { input: "WJump RMB", name: "Jump Heavy Slash", description: "Heavy aerial attack.", knockdown: true, stoic: false },
    { input: "DD WJump LMB LMB", name: "Dash Jump Slash", description: "Air dash into double slash.", knockdown: false, stoic: false },
    { input: "AA WJump LMB LMB", name: "Back Dash Jump Slash", description: "Air dash backwards into double slash.", knockdown: false, stoic: false },
    { input: "LMB LMB LMB W+LMB", name: "Rising Slash", description: "Launcher attack that sends enemies upward.", knockdown: false, stoic: true },
    { input: "DD LMB LMB W+LMB", name: "Dash Rising Slash", description: "Dash launcher.", knockdown: false, stoic: false },
    { input: "AA LMB LMB W+LMB", name: "Back Dash Rising Slash", description: "Back dash launcher.", knockdown: false, stoic: false },
    { input: "LMB LMB LMB W+LMB LMB", name: "Rising Combo", description: "Launcher with aerial follow-up slash.", knockdown: true, stoic: false },
    { input: "DD LMB LMB W+LMB LMB", name: "Dash Rising Combo", description: "Dash launcher with follow-up.", knockdown: true, stoic: false },
    { input: "AA LMB LMB W+LMB LMB", name: "Back Dash Rising Combo", description: "Back dash launcher with follow-up.", knockdown: true, stoic: false },
    { input: "DD WJump LMB LMB", name: "Air Chase", description: "Air pursuit after launcher.", knockdown: false, stoic: false },
    { input: "AA WJump LMB LMB", name: "Back Air Chase", description: "Backward air pursuit.", knockdown: false, stoic: false },
    { input: "Hold RMB", name: "Stance", description: "Holds RMB for over 4 seconds to gain Stoic until you let go of RMB.", knockdown: false, stoic: true },
  ],
};
