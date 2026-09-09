import { randomInt } from 'node:crypto';

// Excludes 0/O and 1/I — the whole point of a shareable code is that someone
// reads it off one screen and types it into another, and those four
// characters are the ones people actually mistype against each other.
const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[randomInt(CHARSET.length)];
  }
  return out;
}

/**
 * A permanent, unique handle for the account itself ("Your Amora ID") —
 * generated once at onboarding and never reused or invalidated. 8 chars
 * over a 32-symbol alphabet is ~1.1e12 combinations, comfortably collision-
 * free at any scale this app will hit before a rewrite is warranted anyway.
 */
export function generateUsername(): string {
  return randomCode(8);
}

/**
 * A short code meant to be read aloud or typed on the spot to link two
 * accounts as partners — shorter than the username on purpose, since it's
 * consumed once and discarded (see `pairingCode` cleared in profile.ts)
 * rather than living on the account forever.
 */
export function generatePairingCode(): string {
  return randomCode(6);
}
