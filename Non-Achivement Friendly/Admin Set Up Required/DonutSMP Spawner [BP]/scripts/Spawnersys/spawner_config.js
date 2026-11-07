/**
 * spawner_config.js
 *
 * Toggle between the two loot systems, and tune the numbers each one uses.
 * Only ONE system is ever active — "legacy" or "new" — there is no
 * dual-flag setup, so there's no way to leave this in a contradictory state.
 */

export const LOOT_SYSTEM = {
	// "legacy": every spawner rolls off its OWN count only
	//           (spawner_state.computeEffectiveRolls(state.count)).
	//           This is the original behavior — scattering unstacked
	//           spawners produces far more loot than stacking the same
	//           number into one block.
	//
	// "new":    an owner's spawners are judged by their TOTAL count across
	//           every block they own, stacked or scattered. Splitting a
	//           stack into separate blocks no longer produces more loot.
	active: "new",

	// Owners at or below this total spawner count always use the LEGACY
	// system, regardless of the "active" setting above. Keeps new/small
	// players on simple, predictable, generous behavior while the
	// fairness curve only kicks in once someone is playing at real scale.
	newbieProtectionThreshold: 10,
};

// Whether the plugin touches spawners it did NOT place itself — natural
// dungeon/vanilla-generated spawner blocks the player just finds in the
// world. When false (the default), those are left 100% vanilla:
//   - no watching what mob type they produce
//   - no special item when Silk Touch mined (vanilla's own rules apply,
//     which normally means it just doesn't drop at all)
//   - a spawn egg used on one does nothing special; plain vanilla egg
//     behavior applies instead
// The ONLY way to get a tracked spawner is to place one of the plugin's
// own spawner items (crafted/obtained through your economy/shop/admin
// tools) — never by finding and converting a wild one.
export const ALLOW_WILD_SPAWNER_INTERACTION = false;

// true = every spawner drops cooked food (cooked_beef, cooked_porkchop, cooked_mutton,
// cooked_chicken, cooked_cod, baked_potato). false = raw drops.
export const COOKED_DROPS = true;

export default { LOOT_SYSTEM, ALLOW_WILD_SPAWNER_INTERACTION, COOKED_DROPS };
