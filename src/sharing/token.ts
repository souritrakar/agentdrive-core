/**
 * Share tokens: the credential a public link carries.
 *
 * Entropy budget and rationale:
 * docs/architecture/sharing/02-public-access-security.md §2.
 */

import { InvalidShareInputError } from "./errors";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * 22 base62 characters ≈ 131 bits, comfortably past the 128-bit budget.
 *
 * The length is fixed rather than variable so a malformed token is rejected by
 * shape before it ever reaches the database — one fewer indexed lookup for a
 * scanner to spend our capacity on.
 */
export const SHARE_TOKEN_LENGTH = 22;

/**
 * The largest multiple of 62 that fits in a byte.
 *
 * Bytes at or above this are discarded rather than folded in with `% 62`, which
 * would make the first eight characters of the alphabet ~1.6% more likely than
 * the rest. That bias is far too small to matter against a 131-bit search and
 * exactly the kind of thing that is free to get right and awkward to explain
 * later, so we get it right.
 */
const UNBIASED_CEILING = 248;

/**
 * Mints a new token.
 *
 * `crypto.getRandomValues` and not `node:crypto`: this module runs in `workerd`
 * and in Node from the same source, like every other module here
 * (backend-principles §8), and Web Crypto is the one CSPRNG both expose under
 * the same name. `Math.random` is not a CSPRNG and must never appear on this
 * path.
 */
export function mintShareToken(): string {
  let token = "";

  while (token.length < SHARE_TOKEN_LENGTH) {
    // Over-draw: at a ~3% rejection rate one draw almost always suffices, and
    // the loop is correct however many it takes.
    const bytes = new Uint8Array(SHARE_TOKEN_LENGTH);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= UNBIASED_CEILING) continue;
      token += ALPHABET[byte % ALPHABET.length];
      if (token.length === SHARE_TOKEN_LENGTH) break;
    }
  }

  return token;
}

/** True for a string shaped like a token this module would have minted. */
export function isShareTokenShape(value: string): boolean {
  if (value.length !== SHARE_TOKEN_LENGTH) return false;
  for (const char of value) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}

/**
 * Guards the public face's one untrusted input.
 *
 * Deliberately throws `InvalidShareInputError` rather than `ShareNotFoundError`:
 * this fires on a request that is malformed, not on one that is unauthorized,
 * and the two are worth separating in logs. It leaks nothing either way — a
 * scanner learns only that its input was not 22 base62 characters, which it can
 * see for itself.
 */
export function requireShareTokenShape(value: string): string {
  if (!isShareTokenShape(value)) {
    throw new InvalidShareInputError("That is not a valid share link.");
  }
  return value;
}
