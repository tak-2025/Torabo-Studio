/**
 * The i18n seam — see this directory's other files (transports.tsx,
 * layout.ts) for the general pattern src/platform/ follows, and
 * PLAN-translators.md §2.5 ("源流 main の純粋性ルール") for the rule this file
 * exists to satisfy: strings that only make sense on a derivative target
 * never live in Studio's own dictionaries (src/i18n/messages.ts,
 * src/i18n/panels/*).
 *
 * A derivative target built by its own translator from this repo (see
 * PLAN-translators.md; e.g. the Android/Capacitor shell's
 * scripts/translate-from-studio.mjs) may need i18n keys that only make
 * sense on that target — a permission prompt, a platform-specific error
 * message. Those keys belong here, in the target's PROTECTED override of
 * this exact path (src/platform/messages.ts), never mixed into Studio's
 * dictionaries above.
 *
 * Torabo Studio is not any particular derivative, so both dictionaries
 * below are empty — this file's whole job on Studio's own main is to exist
 * as the socket a derivative plugs into.
 *
 * Merge order (see src/i18n/messages.ts): panel dictionaries, then this
 * app's own `ja`/`en`, then `platformMessages` last. Last means a target's
 * override could in principle also override a shared key, not just add new
 * ones — not expected to be needed in practice, but documented here so the
 * merge order makes sense on inspection rather than looking arbitrary.
 */
type Dict = Record<string, string>;

const ja: Dict = {};

const en: Dict = {};

export const platformMessages: { ja: Dict; en: Dict } = { ja, en };
