/**
 * spawner_loot.js
 *
 * Virtual loot tables — what a spawner produces per intercepted real
 * spawn event, PER MOB TYPE. No entity is ever left alive to generate
 * these drops (spawner_vanilla.js kills the real spawned entity the
 * same tick and calls rollLoot() instead) — this is a direct,
 * hand-authored approximation of that mob's vanilla drops. Tune freely.
 *
 * Format per mob:
 *   "minecraft:zombie": [
 *     { item: "minecraft:rotten_flesh", min: 0, max: 2, chance: 1.0 },
 *     { item: "minecraft:iron_ingot",   min: 1, max: 1, chance: 0.02 },
 *   ]
 *
 * Optional per-entry flag:  pity: false   -> never use pity for this entry.
 *
 * FAIRNESS FEATURES
 *  1. Pity system: every (player, mob, item) combo has its own miss
 *     counter. Each miss slightly raises the chance of the next roll, and
 *     after a hard limit the drop is guaranteed. A hit resets the counter.
 *     Nobody has extreme bad luck, and one player's luck never affects
 *     another's.
 *  2. Shared rolls: rollLootForPlayers() splits rolls round-robin between
 *     several players so everyone nearby gets an equal share.
 *  3. Fixed item IDs that don't exist in Bedrock and removed made-up drops.
 *
 * rollLoot(mobType, rolls, playerId) makes `rolls` independent passes
 * through the table and merges results — `rolls` comes from
 * spawner_state.computeEffectiveRolls(state.count). Keep a hard cap and
 * diminishing returns in that function so big stacks aren't pay-to-win.
 */

// ── Pity settings ────────────────────────────────────────────────────
export const PITY_CONFIG = {
	// Each miss adds (baseChance * MULTIPLIER) to the chance.
	// 0.02 keeps the average drop rate close to vanilla while cutting
	// the worst-case waits. 0.1 is much stronger (~3x more rare drops).
	MULTIPLIER: 0.02,

	// Drop is guaranteed after ceil(GUARANTEE_FACTOR / baseChance) misses.
	// 3 = guaranteed at 3x the expected number of tries.
	// Use 5 for items you want to stay very rare.
	GUARANTEE_FACTOR: 5,

	// Master switch. Set false to get pure random behaviour.
	ENABLED: true,
};

// ── Loot tables ──────────────────────────────────────────────────────
// Add a new mob by adding a new key here — nothing else needs editing.

export const LOOT_TABLES = {
	"minecraft:zombie": [
		{ item: "minecraft:rotten_flesh", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:iron_ingot", min: 1, max: 1, chance: 0.025 },
		{ item: "minecraft:carrot", min: 1, max: 1, chance: 0.025 },
		{ item: "minecraft:potato", min: 1, max: 1, chance: 0.025 },
	],
	"minecraft:husk": [
		{ item: "minecraft:rotten_flesh", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:iron_ingot", min: 1, max: 1, chance: 0.025 },
	],
	"minecraft:drowned": [
		{ item: "minecraft:rotten_flesh", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:copper_ingot", min: 1, max: 1, chance: 0.11 },
		{ item: "minecraft:trident", min: 1, max: 1, chance: 0.006 },
		{ item: "minecraft:nautilus_shell", min: 1, max: 1, chance: 0.03 },
	],
	"minecraft:skeleton": [
		{ item: "minecraft:bone", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:arrow", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:bow", min: 1, max: 1, chance: 0.085 },
	],
	"minecraft:stray": [
		{ item: "minecraft:bone", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:arrow", min: 0, max: 2, chance: 1.0 },
	],
	"minecraft:wither_skeleton": [
		{ item: "minecraft:bone", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:coal", min: 1, max: 1, chance: 0.33 },
		// NOTE: depending on your game version this ID may need to be
		// "minecraft:skull" with data value 1. Test it in-game.
		{ item: "minecraft:wither_skeleton_skull", min: 1, max: 1, chance: 0.025 },
	],
	"minecraft:spider": [
		{ item: "minecraft:string", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:spider_eye", min: 1, max: 1, chance: 0.33 },
	],
	"minecraft:cave_spider": [
		{ item: "minecraft:string", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:spider_eye", min: 1, max: 1, chance: 0.33 },
	],
	"minecraft:creeper": [{ item: "minecraft:gunpowder", min: 0, max: 2, chance: 1.0 }],
	"minecraft:enderman": [{ item: "minecraft:ender_pearl", min: 0, max: 1, chance: 0.5 }],
	"minecraft:blaze": [{ item: "minecraft:blaze_rod", min: 0, max: 1, chance: 0.5 }],
	"minecraft:breeze": [{ item: "minecraft:breeze_rod", min: 1, max: 2, chance: 1.0 }],
	// Vanilla silverfish drop nothing, so the old experience_bottle bonus
	// was removed to keep spawner types comparable.
	"minecraft:silverfish": [],
	"minecraft:magma_cube": [{ item: "minecraft:magma_cream", min: 0, max: 1, chance: 0.25 }],
	"minecraft:slime": [{ item: "minecraft:slime_ball", min: 0, max: 2, chance: 1.0 }],
	"minecraft:witch": [
		{ item: "minecraft:glowstone_dust", min: 0, max: 2, chance: 0.4 },
		{ item: "minecraft:redstone", min: 0, max: 3, chance: 0.5 },
		{ item: "minecraft:spider_eye", min: 0, max: 1, chance: 0.4 },
		{ item: "minecraft:sugar", min: 0, max: 2, chance: 0.4 },
		{ item: "minecraft:gunpowder", min: 0, max: 1, chance: 0.4 },
	],
	"minecraft:phantom": [{ item: "minecraft:phantom_membrane", min: 0, max: 1, chance: 0.5 }],
	"minecraft:shulker": [{ item: "minecraft:shulker_shell", min: 0, max: 1, chance: 0.5 }],
	"minecraft:guardian": [
		{ item: "minecraft:prismarine_shard", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:prismarine_crystals", min: 0, max: 1, chance: 0.5 },
		{ item: "minecraft:cod", min: 0, max: 1, chance: 0.5 },
	],
	"minecraft:evoker": [
		{ item: "minecraft:emerald", min: 0, max: 1, chance: 0.5 },
		// Vanilla evoker ALWAYS drops a totem. Lowered here on purpose so
		// spawners can't flood the server with them — raise it if you
		// want it closer to vanilla.
		{ item: "minecraft:totem_of_undying", min: 1, max: 1, chance: 0.1 },
	],
	"minecraft:ghast": [
		{ item: "minecraft:ghast_tear", min: 0, max: 1, chance: 0.5 },
		{ item: "minecraft:gunpowder", min: 0, max: 2, chance: 1.0 },
	],
	"minecraft:bogged": [
		{ item: "minecraft:bone", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:arrow", min: 0, max: 2, chance: 1.0 },
		// tipped_arrow needs potion data and silently fails as a plain
		// item ID, so it was dropped from the table.
	],
	"minecraft:elder_guardian": [
		{ item: "minecraft:prismarine_shard", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:prismarine_crystals", min: 0, max: 1, chance: 0.5 },
		{ item: "minecraft:wet_sponge", min: 1, max: 1, chance: 0.4 },
	],
	"minecraft:piglin": [
		{ item: "minecraft:gold_nugget", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:ender_pearl", min: 0, max: 1, chance: 0.05 },
	],
	"minecraft:piglin_brute": [{ item: "minecraft:gold_ingot", min: 0, max: 1, chance: 0.3 }],
	"minecraft:pig": [
		{ item: "minecraft:porkchop", min: 1, max: 3, chance: 1.0 },
		{ item: "minecraft:saddle", min: 1, max: 1, chance: 0.05 },
	],
	"minecraft:hoglin": [
		{ item: "minecraft:porkchop", min: 2, max: 4, chance: 1.0 },
		{ item: "minecraft:leather", min: 0, max: 1, chance: 0.3 },
	],
	"minecraft:zombified_piglin": [
		{ item: "minecraft:rotten_flesh", min: 0, max: 1, chance: 1.0 },
		{ item: "minecraft:gold_nugget", min: 0, max: 1, chance: 0.5 },
		{ item: "minecraft:gold_ingot", min: 0, max: 1, chance: 0.03 },
	],
	"minecraft:cow": [
		{ item: "minecraft:beef", min: 1, max: 3, chance: 1.0 },
		{ item: "minecraft:leather", min: 0, max: 2, chance: 0.8 },
	],
	"minecraft:sheep": [
		{ item: "minecraft:mutton", min: 1, max: 2, chance: 1.0 },
		{ item: "minecraft:white_wool", min: 1, max: 1, chance: 1.0 },
	],
	"minecraft:chicken": [
		{ item: "minecraft:chicken", min: 1, max: 1, chance: 1.0 },
		{ item: "minecraft:feather", min: 0, max: 2, chance: 1.0 },
		{ item: "minecraft:egg", min: 1, max: 1, chance: 0.2 },
	],
	"minecraft:iron_golem": [
		{ item: "minecraft:iron_ingot", min: 2, max: 3, chance: 1.0 },
		{ item: "minecraft:poppy", min: 0, max: 2, chance: 0.8 },
	],
};

const EMPTY_TABLE = [];

export function hasLootTable(mobType) {
	return Object.prototype.hasOwnProperty.call(LOOT_TABLES, mobType);
}

export function getSupportedMobTypes() {
	return Object.keys(LOOT_TABLES);
}

function randInt(min, max) {
	return min + Math.floor(Math.random() * (max - min + 1));
}

// ── Pity state ───────────────────────────────────────────────────────
// key: `${playerId}:${mobType}:${item}` -> consecutive misses
const pityMisses = new Map();

function pityKey(playerId, mobType, item) {
	return `${playerId}:${mobType}:${item}`;
}

/** Misses needed before the drop is forced for this base chance. */
function pityLimit(chance) {
	return Math.ceil(PITY_CONFIG.GUARANTEE_FACTOR / chance);
}

/**
 * Decides whether one table entry drops on one roll, applying pity.
 * Entries with chance >= 1 or pity:false are plain random.
 */
function rollEntry(entry, playerId, mobType) {
	const usePity =
		PITY_CONFIG.ENABLED && entry.pity !== false && entry.chance > 0 && entry.chance < 1;

	if (!usePity) return Math.random() < entry.chance;

	const key = pityKey(playerId, mobType, entry.item);
	const misses = pityMisses.get(key) ?? 0;

	const boosted = Math.min(1, entry.chance + misses * entry.chance * PITY_CONFIG.MULTIPLIER);
	const forced = misses >= pityLimit(entry.chance);
	const hit = forced || Math.random() < boosted;

	pityMisses.set(key, hit ? 0 : misses + 1);
	return hit;
}

// ── Cooked items ─────────────────────────────────────────────────────
// In vanilla, mobs killed while burning drop cooked food. When a spawner
// is set to "cooked" mode, every raw item below is swapped for its cooked
// version. Items not listed here (rotten_flesh, bone, etc.) are unchanged.
export const COOKED_MAP = {
	"minecraft:beef": "minecraft:cooked_beef",
	"minecraft:porkchop": "minecraft:cooked_porkchop",
	"minecraft:mutton": "minecraft:cooked_mutton",
	"minecraft:chicken": "minecraft:cooked_chicken",
	"minecraft:cod": "minecraft:cooked_cod",
	"minecraft:potato": "minecraft:baked_potato",
};

/** Swaps raw items for cooked ones and merges any that now share an ID. */
export function cookLoot(loot) {
	const totals = new Map();
	for (const { item, amount } of loot) {
		const out = COOKED_MAP[item] ?? item;
		totals.set(out, (totals.get(out) ?? 0) + amount);
	}
	return [...totals.entries()].map(([item, amount]) => ({ item, amount }));
}

/**
 * Rolls loot for one intercepted spawn event. `rolls` is the number of
 * independent passes through the table (pass spawner_state's
 * computeEffectiveRolls(state.count) here — bigger stacks = more rolls,
 * with diminishing returns baked into that function, not this one).
 *
 * `playerId` is who the pity counters belong to (spawner owner, or the
 * nearest/triggering player). Use a stable ID such as player.id.
 *
 * Returns an array of { item, amount } (amount > 0 only).
 */
export function rollLoot(mobType, rolls = 1, playerId = "global", options = {}) {
	const table = LOOT_TABLES[mobType] ?? EMPTY_TABLE;
	if (table.length === 0) return [];

	const totals = new Map();

	for (let r = 0; r < rolls; r++) {
		for (const entry of table) {
			if (!rollEntry(entry, playerId, mobType)) continue;
			const amount = randInt(entry.min, entry.max);
			if (amount <= 0) continue;
			totals.set(entry.item, (totals.get(entry.item) ?? 0) + amount);
		}
	}

	const loot = [...totals.entries()].map(([item, amount]) => ({ item, amount }));
	return options.cooked ? cookLoot(loot) : loot;
}

/**
 * Shared loot for several players (e.g. everyone near a spawner).
 * Rolls are handed out round-robin so each player gets an equal share
 * and their own pity counters advance independently.
 *
 * Returns Map<playerId, Array<{ item, amount }>>.
 */
export function rollLootForPlayers(mobType, rolls, playerIds, options = {}) {
	const results = new Map();
	if (!playerIds || playerIds.length === 0) return results;

	const perPlayer = new Map(playerIds.map((id) => [id, 0]));
	for (let r = 0; r < rolls; r++) {
		const id = playerIds[r % playerIds.length];
		perPlayer.set(id, perPlayer.get(id) + 1);
	}

	for (const [id, count] of perPlayer) {
		if (count > 0) results.set(id, rollLoot(mobType, count, id, options));
	}
	return results;
}

// ── Pity management / persistence ────────────────────────────────────

/** Clears pity for one player (or everyone when no id is given). */
export function resetPity(playerId) {
	if (playerId === undefined) {
		pityMisses.clear();
		return;
	}
	const prefix = `${playerId}:`;
	for (const key of pityMisses.keys()) {
		if (key.startsWith(prefix)) pityMisses.delete(key);
	}
}

/** Plain object you can JSON.stringify and store (e.g. world dynamic property). */
export function exportPity() {
	const out = {};
	for (const [key, misses] of pityMisses) {
		if (misses > 0) out[key] = misses;
	}
	return out;
}

/** Restores data produced by exportPity(). */
export function importPity(data) {
	pityMisses.clear();
	if (!data || typeof data !== "object") return;
	for (const [key, misses] of Object.entries(data)) {
		if (Number.isFinite(misses) && misses > 0) pityMisses.set(key, misses);
	}
}

/**
 * Quick balance check: expected items per single roll for each mob,
 * ignoring pity. Compare mobs to spot spawner types that are far better
 * or worse than the rest.
 */
export function expectedValuePerRoll(mobType) {
	const table = LOOT_TABLES[mobType] ?? EMPTY_TABLE;
	const out = {};
	for (const e of table) out[e.item] = e.chance * ((e.min + e.max) / 2);
	return out;
}

export default {
	LOOT_TABLES,
	PITY_CONFIG,
	hasLootTable,
	getSupportedMobTypes,
	rollLoot,
	rollLootForPlayers,
	resetPity,
	exportPity,
	importPity,
	expectedValuePerRoll,
	COOKED_MAP,
	cookLoot,
};