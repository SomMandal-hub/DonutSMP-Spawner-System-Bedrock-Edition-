/**
 * spawner_state.js
 *
 * ── SINGLE SOURCE OF TRUTH for virtual spawner state ──────────────
 *
 * This version is built around REAL minecraft:mob_spawner blocks/items,
 * not a custom block. A spawner's state:
 *   {
 *     mobType:   "minecraft:zombie",  // vanilla entity typeId
 *     count:     1,                   // how many spawners are stacked here (DonutSMP-style)
 *     buffer:    { "minecraft:rotten_flesh": 12 },
 *     createdAt: 182733               // system.currentTick when first tracked
 *   }
 *
 * A location or item only HAS state once it's been "claimed" by this
 * system — either mined+labeled from a real spawner (wild or ours), or
 * configured with a spawn egg. An untouched vanilla minecraft:mob_spawner
 * with no state is left alone by every other file in this system.
 *
 *   • BLOCK state — world dynamic properties keyed by dimension+location
 *     (blocks don't have their own per-instance dynamic property API).
 *   • ITEM state  — a single JSON dynamic property directly on the
 *     ItemStack, which Bedrock preserves through inventory moves, chests,
 *     dropped-item pickup, death, etc.
 *
 * NOTE ON VANILLA NBT: separately from all of this, Block#getItemStack(
 * amount, true) preserves the *real* vanilla spawner EntityType onto the
 * resulting item automatically — that's vanilla behavior, not something
 * this file does. This file only tracks OUR bookkeeping (mob type for
 * loot-table lookups, stack count, buffer) alongside it.
 */

import { world } from "@minecraft/server";
import { LOOT_SYSTEM } from "./spawner_config.js";

// ── Public constants ────────────────────────────────────────────────

// "No real cap" per your call — this is just a safety ceiling so a
// runaway script bug can't grow count without bound.
export const MAX_STACK = 10_000;
export const MIN_STACK = 1;

export const BUFFER_ITEM_CAP = 6400;

const BLOCK_KEY_PREFIX = "vspawn:blk:"; // + "<dimensionId>|<x>|<y>|<z>"
const ITEM_DP_KEY = "spawner_data"; // key on the ItemStack itself
const OWNER_TOTALS_KEY = "vspawn:owner_totals"; // single JSON blob: { [ownerId]: totalCount }

const _activeLocations = new Map(); // locKey -> { dimensionId, x, y, z }
let _ownerTotals = null; // Map<ownerId, totalCount> — lazily loaded from the dynamic property above

// ── Internal helpers ─────────────────────────────────────────────────

function locKey(dimensionId, x, y, z) {
	return `${dimensionId}|${x}|${y}|${z}`;
}

function blockDpKey(dimensionId, x, y, z) {
	return BLOCK_KEY_PREFIX + locKey(dimensionId, x, y, z);
}

export function normalizeCount(count) {
	const c = Math.floor(Number(count));
	if (!Number.isFinite(c) || c < MIN_STACK) return MIN_STACK;
	if (c > MAX_STACK) return MAX_STACK;
	return c;
}

export function createState(mobType, count = 1, owner = null) {
	return {
		mobType,
		count: normalizeCount(count),
		owner, // player.id of whoever PLACED this block. Set once, at placement —
		       // never carried inside the item. Stealing + re-placing naturally
		       // reassigns ownership to whoever places it next.
		buffer: {},
		createdAt: undefined,
	};
}

function safeParse(json) {
	if (!json) return null;
	try {
		const parsed = JSON.parse(json);
		if (!parsed || typeof parsed !== "object" || !parsed.mobType) return null;
		if (typeof parsed.buffer !== "object" || parsed.buffer === null) parsed.buffer = {};
		parsed.count = normalizeCount(parsed.count ?? 1);
		return parsed;
	} catch {
		return null;
	}
}

// ── BLOCK state API ─────────────────────────────────────────────────

export function getBlockState(dimensionId, location) {
	const raw = world.getDynamicProperty(blockDpKey(dimensionId, location.x, location.y, location.z));
	return safeParse(raw);
}

export function setBlockState(dimensionId, location, state) {
	const key = blockDpKey(dimensionId, location.x, location.y, location.z);
	world.setDynamicProperty(key, JSON.stringify(state));
	_activeLocations.set(locKey(dimensionId, location.x, location.y, location.z), {
		dimensionId,
		x: location.x,
		y: location.y,
		z: location.z,
	});
}

export function deleteBlockState(dimensionId, location) {
	const key = blockDpKey(dimensionId, location.x, location.y, location.z);
	try {
		world.setDynamicProperty(key, undefined);
	} catch {
		/* already gone */
	}
	_activeLocations.delete(locKey(dimensionId, location.x, location.y, location.z));
}

export function getActiveLocations() {
	return [..._activeLocations.values()];
}

/** Rebuilds the in-memory active-location index from disk. Call once at startup. */
export function rebuildIndex() {
	_activeLocations.clear();
	try {
		const ids = world.getDynamicPropertyIds();
		for (const id of ids) {
			if (!id.startsWith(BLOCK_KEY_PREFIX)) continue;
			const rest = id.slice(BLOCK_KEY_PREFIX.length);
			const parts = rest.split("|");
			if (parts.length !== 4) continue;
			const [dimensionId, xs, ys, zs] = parts;
			const x = Number(xs), y = Number(ys), z = Number(zs);
			if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
			const state = safeParse(world.getDynamicProperty(id));
			if (!state) continue;
			_activeLocations.set(locKey(dimensionId, x, y, z), { dimensionId, x, y, z });
		}
	} catch (e) {
		console.warn("[VirtualSpawners] rebuildIndex error:", e);
	}
	return _activeLocations.size;
}

// ── ITEM state API ───────────────────────────────────────────────────
//
// FIX (Error 2): Bedrock throws "Cannot set dynamic properties on
// stackable items" when setDynamicProperty is called on any ItemStack
// whose maxAmount > 1 — which includes minecraft:mob_spawner (max 64).
//
// Workaround: encode the state as JSON in a hidden lore line. We prefix
// it with a zero-width non-breaking space (U+FEFF) so it renders as a
// blank line in-game inventory tooltips and players won't see raw JSON.
// getItemState scans the lore array for any line starting with that
// prefix and parses it back. This survives inventory moves, chests,
// dropped-item pickup, and death — exactly like a real dynamic property.

const LORE_TAG_PREFIX = "\uFEFF"; // zero-width prefix, invisible in-game

export function getItemState(itemStack) {
	if (!itemStack) return null;
	try {
		const lore = itemStack.getLore?.() ?? [];
		for (const line of lore) {
			if (line.startsWith(LORE_TAG_PREFIX)) {
				return safeParse(line.slice(LORE_TAG_PREFIX.length));
			}
		}
		return null;
	} catch {
		return null;
	}
}

export function setItemState(itemStack, state) {
	try {
		const existing = itemStack.getLore?.() ?? [];
		// Strip any previous hidden tag line, then append the new one.
		const cleaned = existing.filter((l) => !l.startsWith(LORE_TAG_PREFIX));
		cleaned.push(LORE_TAG_PREFIX + JSON.stringify(state));
		itemStack.setLore(cleaned);
	} catch (e) {
		console.warn("[VirtualSpawners] setItemState failed:", e);
	}
	return itemStack;
}

// ── Buffer manipulation ────────────────────────────────────────────

export function addToBuffer(state, typeId, count) {
	const current = state.buffer[typeId] ?? 0;
	state.buffer[typeId] = Math.min(BUFFER_ITEM_CAP, current + count);
	return state;
}

export function takeFromBuffer(state, typeId, count) {
	const current = state.buffer[typeId] ?? 0;
	const taken = Math.min(current, count);
	if (taken <= 0) return 0;
	const remaining = current - taken;
	if (remaining <= 0) delete state.buffer[typeId];
	else state.buffer[typeId] = remaining;
	return taken;
}

export function clearBuffer(state) {
	state.buffer = {};
	return state;
}

export function bufferHasItems(state) {
	return Object.keys(state.buffer).length > 0;
}

// ── Owner totals ───────────────────────────────────────────────────
//
// "How many spawners does this player own, added up across EVERY block
// they own, wherever it is on the map?" — this is the number the new
// loot system needs, and the old per-location state can't answer it on
// its own. We keep a live running total per owner instead of scanning
// the whole world on every spawn event (that would be the actual lag
// source, not the loot math itself).
//
// Persisted as ONE dynamic property holding a JSON map, so it survives
// server restarts without needing a per-player key.

function loadOwnerTotals() {
	if (_ownerTotals) return _ownerTotals;
	_ownerTotals = new Map();
	try {
		const raw = world.getDynamicProperty(OWNER_TOTALS_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				for (const [ownerId, total] of Object.entries(parsed)) {
					const n = Math.max(0, Math.floor(Number(total)) || 0);
					if (n > 0) _ownerTotals.set(ownerId, n);
				}
			}
		}
	} catch (e) {
		console.warn("[VirtualSpawners] loadOwnerTotals failed, starting empty:", e);
	}
	return _ownerTotals;
}

function saveOwnerTotals() {
	if (!_ownerTotals) return;
	try {
		const obj = Object.fromEntries(_ownerTotals);
		world.setDynamicProperty(OWNER_TOTALS_KEY, JSON.stringify(obj));
	} catch (e) {
		console.warn("[VirtualSpawners] saveOwnerTotals failed:", e);
	}
}

/** Adjust one owner's running total (e.g. +1 on place, -N on break) and persist it. */
export function adjustOwnerTotal(ownerId, delta) {
	if (!ownerId || !delta) return getOwnerTotal(ownerId);
	const totals = loadOwnerTotals();
	const next = Math.max(0, (totals.get(ownerId) ?? 0) + delta);
	if (next <= 0) totals.delete(ownerId);
	else totals.set(ownerId, next);
	saveOwnerTotals();
	return next;
}

/** How many spawners this owner has in total, across every block they own. */
export function getOwnerTotal(ownerId) {
	if (!ownerId) return 0;
	return loadOwnerTotals().get(ownerId) ?? 0;
}

/**
 * Rebuilds owner totals from scratch by summing every currently-tracked
 * block's count by its owner field. Call this once at startup ALONGSIDE
 * rebuildIndex() — it's a cheap pass over the same data rebuildIndex
 * already reads, not an extra world scan.
 */
export function rebuildOwnerTotals() {
	const totals = new Map();
	try {
		const ids = world.getDynamicPropertyIds();
		for (const id of ids) {
			if (!id.startsWith(BLOCK_KEY_PREFIX)) continue;
			const state = safeParse(world.getDynamicProperty(id));
			if (!state || !state.owner) continue;
			totals.set(state.owner, (totals.get(state.owner) ?? 0) + state.count);
		}
	} catch (e) {
		console.warn("[VirtualSpawners] rebuildOwnerTotals error:", e);
	}
	_ownerTotals = totals;
	saveOwnerTotals();
	return totals.size;
}

// ── Stack-size → production scaling ─────────────────────────────────
//
// DonutSMP scales production with stack count but with diminishing
// returns per extra spawner (their exact live curve isn't public /
// isn't something we can verify, so this is OUR OWN tunable
// approximation, not a reproduction of theirs). sqrt() gives a soft
// cap: 1 → 1 roll, 4 → 2 rolls, 64 → 8 rolls, 10,000 → 100 rolls.
// Adjust the exponent/multiplier below to taste.
export function computeEffectiveRolls(count) {
	return Math.max(1, Math.ceil(Math.sqrt(normalizeCount(count))));
}

/**
 * NEW SYSTEM ONLY: an owner's spawners share a roll BUDGET based on
 * their TOTAL count across every block they own.
 *
 *  - If ALL of an owner's spawners live in ONE block (state.count ==
 *    ownerTotal — the classic single stacked spawner), the budget is
 *    just computeEffectiveRolls(ownerTotal): the normal curve, no
 *    bonus, no penalty. "Stacked works like normal."
 *
 *  - If the owner's spawners are split across MULTIPLE blocks (any
 *    block whose count is less than their total), the WHOLE budget
 *    gets a flat +20% on top of that same baseline — rewarding the
 *    extra effort/space/distance cost of running several separate
 *    spawner locations instead of one. That +20% is shared out
 *    proportionally across however many blocks the owner has, so the
 *    person who scattered ends up ~20% ahead of the person who
 *    stacked the same total count, no matter how many pieces it's
 *    split into.
 */
const SCATTER_BONUS_MULTIPLIER = 1.2;

function computeSharedRolls(state, ownerTotal) {
	if (ownerTotal <= 0) return computeEffectiveRolls(state.count);

	const baselineTotal = computeEffectiveRolls(ownerTotal);
	const isFullyStacked = state.count === ownerTotal; // this one block IS the owner's whole total
	const budgetTotal = isFullyStacked ? baselineTotal : baselineTotal * SCATTER_BONUS_MULTIPLIER;

	const share = budgetTotal * (state.count / ownerTotal);
	const wholeRolls = Math.floor(share);
	const remainder = share - wholeRolls;
	return wholeRolls + (Math.random() < remainder ? 1 : 0);
}

/**
 * THE single entry point every trigger site should call instead of
 * computeEffectiveRolls directly. Picks legacy vs. new per
 * spawner_config.js, and always protects owners at or under the
 * newbie threshold by keeping them on legacy regardless of the
 * global setting.
 */
export function decideRolls(state) {
	const ownerTotal = getOwnerTotal(state.owner);

	if (LOOT_SYSTEM.active !== "new") return computeEffectiveRolls(state.count);
	if (ownerTotal <= LOOT_SYSTEM.newbieProtectionThreshold) return computeEffectiveRolls(state.count);

	return computeSharedRolls(state, ownerTotal);
}

export default {
	MAX_STACK,
	MIN_STACK,
	BUFFER_ITEM_CAP,
	normalizeCount,
	createState,
	getBlockState,
	setBlockState,
	deleteBlockState,
	getActiveLocations,
	rebuildIndex,
	getItemState,
	setItemState,
	addToBuffer,
	takeFromBuffer,
	clearBuffer,
	bufferHasItems,
	adjustOwnerTotal,
	getOwnerTotal,
	rebuildOwnerTotals,
	computeEffectiveRolls,
	decideRolls,
};
