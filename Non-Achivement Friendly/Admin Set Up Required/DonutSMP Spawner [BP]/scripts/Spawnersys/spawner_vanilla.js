/**
 * spawner_vanilla.js
 *
 * Everything that makes a REAL minecraft:mob_spawner behave like a
 * DonutSMP-style virtual spawner. No custom block, no custom item, no
 * resource pack texture needed — this is the whole point of building on
 * the vanilla block instead of a custom one.
 *
 * ── HOW A SPAWNER BECOMES "OURS" ────────────────────────────────────
 * A vanilla mob_spawner only gets tracked (gets a state entry in
 * spawner_state.js) one of two ways:
 *   1. A player uses a spawn egg on it (100% vanilla interaction — we
 *      don't touch how the entity type gets set, we just notice it
 *      happened and start tracking that location).
 *   2. It's a natural/dungeon spawner a player mines with Silk Touch
 *      after we've passively identified its mob type by watching it
 *      spawn something (same trick your original script used).
 * Any mob_spawner block with no tracked state is left completely alone
 * by this file — dungeon spawners you haven't touched still work like
 * normal vanilla spawners until you interact with them.
 *
 * ── HOW PRODUCTION WORKS ─────────────────────────────────────────────
 * We do NOT run our own timer. A tracked spawner's real vanilla
 * spawn attempt is the trigger: the instant a mob spawns near a tracked
 * spawner, we remove it the same tick (entity.remove() — no death event,
 * no drops, no AI, no lag) and roll virtual loot into that spawner's
 * buffer instead, scaled by stack count (spawner_state.computeEffectiveRolls).
 * This means production still depends on real spawner conditions —
 * a nearby player, correct light level, mob cap, etc. — same as vanilla.
 * That's a real trade-off from a fully timer-driven design; see the
 * setup guide for details.
 *
 * ── STACKING (DonutSMP-style) ────────────────────────────────────────
 * Right-click a tracked spawner while holding a matching, CONFIGURED
 * spawner item -> +1 to count, consumes 1 item, action-bar feedback.
 * Sneak + right-click -> dumps your whole held stack in at once.
 * Right-click empty-handed -> opens the collection GUI.
 * Silk-touch break -> removes 1 from count (drops 1 item).
 * Sneak + Silk-touch break -> removes up to 64 at once.
 * Breaking ALWAYS purges the buffer (see PURGE_BUFFER_ON_ANY_BREAK below
 * — this matches the documented DonutSpawners behavior, but it's a
 * judgment call you may want to soften; flip the flag if so).
 */

import { world, system, ItemStack } from "@minecraft/server";
import * as SpawnerState from "./spawner_state.js";
import * as SpawnerLoot from "./spawner_loot.js";
import { ALLOW_WILD_SPAWNER_INTERACTION, COOKED_DROPS } from "./spawner_config.js";

export const SPAWNER_BLOCK_ID = "minecraft:mob_spawner";
export const SPAWNER_ITEM_ID = "minecraft:mob_spawner";

const PICKAXES = [
	"minecraft:iron_pickaxe",
	"minecraft:golden_pickaxe",
	"minecraft:diamond_pickaxe",
	"minecraft:netherite_pickaxe",
];

// See file header. true = matches documented Donut behavior (any break,
// even removing 1 of 1000, wipes the whole buffer). false = only purge
// when the stack is fully removed and the block is actually destroyed.
const PURGE_BUFFER_ON_ANY_BREAK = true;

const MAX_UNSTACK_PER_BREAK = 64; // sneak+break cap, per your choice

// Set to true to output verbose [VirtualSpawners][DEBUG] diagnostic logs to console.
// Default is false for clean, quiet gameplay.
export const DEBUG_CONFIG = false;

function debugLog(...args) {
	if (DEBUG_CONFIG) console.warn(...args);
}

// In-memory cache of "we saw this untracked/wild spawner produce mob X,
// so if it gets silk-touch mined, label the item correctly" — same
// mechanic as your original script, unchanged.
const _wildMobCache = new Map(); // locKey -> mobType

function locKeyOf(dimensionId, x, y, z) {
	return `${dimensionId}|${x}|${y}|${z}`;
}

function centerOf(pos) {
	return { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 };
}

function randomRange(min = 0, max = 1) {
	return Math.random() * (max - min) + min;
}

// ── Display helpers ───────────────────────────────────────────────────

const MOB_NAME_MAP = {
	zombie: "Zombie", husk: "Husk", drowned: "Drowned", skeleton: "Skeleton",
	stray: "Stray", wither_skeleton: "Wither Skeleton", spider: "Spider",
	cave_spider: "Cave Spider", creeper: "Creeper", enderman: "Enderman",
	blaze: "Blaze", silverfish: "Silverfish", magma_cube: "Magma Cube",
	slime: "Slime", witch: "Witch", phantom: "Phantom", shulker: "Shulker",
	guardian: "Guardian", elder_guardian: "Elder Guardian", piglin: "Piglin",
	piglin_brute: "Piglin Brute", hoglin: "Hoglin", zombified_piglin: "Zombified Piglin",
	pig: "Pig", cow: "Cow", sheep: "Sheep", chicken: "Chicken", iron_golem: "Iron Golem",
	breeze: "Breeze", evoker: "Evoker", ghast: "Ghast", bogged: "Bogged",
};

export function formatMobName(mobType) {
	if (!mobType) return "Unknown";
	const clean = mobType.replace("minecraft:", "");
	return MOB_NAME_MAP[clean] || clean.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const ITEM_NAME_MAP = {
	rotten_flesh: "Rotten Flesh",
	iron_ingot: "Iron Ingot",
	copper_ingot: "Copper Ingot",
	gold_ingot: "Gold Ingot",
	gold_nugget: "Gold Nugget",
	netherite_ingot: "Netherite Ingot",
	diamond: "Diamond",
	emerald: "Emerald",
	bone: "Bone",
	arrow: "Arrow",
	bow: "Bow",
	tipped_arrow: "Tipped Arrow",
	coal: "Coal",
	wither_skeleton_skull: "Wither Skeleton Skull",
	string: "String",
	spider_eye: "Spider Eye",
	gunpowder: "Gunpowder",
	ender_pearl: "Ender Pearl",
	blaze_rod: "Blaze Rod",
	breeze_rod: "Breeze Rod",
	experience_bottle: "Bottle o' Enchanting",
	magma_cream: "Magma Cream",
	slimeball: "Slimeball",
	glowstone_dust: "Glowstone Dust",
	redstone: "Redstone",
	sugar: "Sugar",
	phantom_membrane: "Phantom Membrane",
	shulker_shell: "Shulker Shell",
	prismarine_shard: "Prismarine Shard",
	prismarine_crystals: "Prismarine Crystals",
	raw_fish: "Raw Fish",
	totem_of_undying: "Totem of Undying",
	ghast_tear: "Ghast Tear",
	wet_sponge: "Wet Sponge",
	saddle: "Saddle",
	porkchop: "Raw Porkchop",
	leather: "Leather",
	raw_beef: "Raw Beef",
	beef: "Raw Beef",
	cooked_beef: "Steak",
	cooked_porkchop: "Cooked Porkchop",
	cooked_mutton: "Cooked Mutton",
	cooked_chicken: "Cooked Chicken",
	cooked_cod: "Cooked Cod",
	baked_potato: "Baked Potato",
	mutton: "Raw Mutton",
	white_wool: "White Wool",
	chicken: "Raw Chicken",
	feather: "Feather",
	egg: "Egg",
	poppy: "Poppy",
	trident: "Trident",
	nautilus_shell: "Nautilus Shell",
	carrot: "Carrot",
	potato: "Potato",
};

export function formatItemName(itemTypeId) {
	if (!itemTypeId) return "Unknown Item";
	const clean = itemTypeId.replace(/^minecraft:/, "").toLowerCase();
	return ITEM_NAME_MAP[clean] || clean.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function getSpawnerLoreLines(mobType, count = 1, hasBuffer = false) {
	const lines = [];
	const normMob = normalizeMobId(mobType);
	const canonicalMob = `minecraft:${normMob}`;
	const lootTable = SpawnerLoot.LOOT_TABLES[canonicalMob] ?? SpawnerLoot.LOOT_TABLES[mobType] ?? [];

	if (count > 1) {
		lines.push(`§r§7Stacked: §e${count}x`);
	}

	lines.push("§r§6Produce :");
	if (lootTable.length > 0) {
		const seen = new Set();
		let index = 1;
		for (const entry of lootTable) {
			const effectiveItem = COOKED_DROPS && SpawnerLoot.COOKED_MAP[entry.item]
				? SpawnerLoot.COOKED_MAP[entry.item]
				: entry.item;
			const itemName = formatItemName(effectiveItem);
			if (!seen.has(itemName)) {
				seen.add(itemName);
				lines.push(`§r§7  ${index}. §f${itemName}`);
				index++;
			}
		}
	} else {
		lines.push("§r§7  (None)");
	}

	lines.push("§r");
	lines.push("§r§d⛏ §7Mine using §dSilk Touch §7to pick up!");

	if (count > 1 || hasBuffer) {
		lines.push("§r§e🖐 §7Right-click with bare hand to open storage.");
		lines.push("§r§b➕ §7Right-click placed spawner to stack (Shift = dump all).");
		lines.push("§r§c⚠ §7Breaking purges uncollected contents.");
	} else {
		lines.push("§r§e🖐 §7Right-click with bare hand to open storage.");
	}

	return lines;
}

function mobTypeFromSpawnEgg(eggTypeId) {
	// "minecraft:zombie_spawn_egg" -> "minecraft:zombie"
	if (!eggTypeId || !eggTypeId.endsWith("_spawn_egg")) return null;
	return eggTypeId.slice(0, -"_spawn_egg".length);
}

function normalizeMobId(id) {
	if (!id) return "";
	let clean = id.startsWith("minecraft:") ? id.slice(10) : id;
	clean = clean.toLowerCase();
	if (clean === "zombie_pigman") return "zombified_piglin";
	// FIX ("evokers keep spawning / never get removed"):
	// The evoker's REAL internal Bedrock entity typeId is
	// "minecraft:evocation_illager" (confirmed via Mojang's own
	// @minecraft/vanilla-data MinecraftEntityTypes.EvocationIllager —
	// there is no "minecraft:evoker" entity type at all; the wiki/UI name
	// changed but the identifier didn't). This addon's spawn-egg parsing
	// and MOB_NAME_MAP everywhere else store/expect "minecraft:evoker"
	// (from "evoker_spawn_egg" -> "evoker"), so every sameMobType(state.
	// mobType, entity.typeId) comparison for a real evoker was comparing
	// "evoker" against "evocation_illager" and ALWAYS returning false.
	// That means a spawned evoker never matched its own tracked spawner,
	// was never removed, and roamed free attacking players — independent
	// of any timing/tick issue. Aliasing both spellings to the same
	// normalized id here fixes the comparison everywhere at once (attribution,
	// removal, loot crediting, structure capture) without having to
	// rename anything else in the file.
	if (clean === "evocation_illager") return "evoker";
	return clean;
}

function sameMobType(a, b) {
	if (!a || !b) return false;
	return normalizeMobId(a) === normalizeMobId(b);
}

/**
 * Returns the canonical "minecraft:<id>" form this addon's own state/
 * loot tables/name map expect, collapsing known entity-typeId spelling
 * mismatches (e.g. a live evoker's real typeId "minecraft:
 * evocation_illager" -> "minecraft:evoker") through normalizeMobId.
 * Use this any time a raw entity.typeId is about to be STORED as a
 * mobType (state, cache, structure id) — not just compared — so every
 * storage point agrees on one spelling instead of silently forking into
 * two parallel, mutually-invisible identities for the same mob.
 */
function canonicalMobType(typeId) {
	if (!typeId) return typeId;
	return `minecraft:${normalizeMobId(typeId)}`;
}

// ── In-World Dynamic Structure Cache (No .mcstructure files required) ─
// Bedrock engine's world.structureManager round-trips a spawner's real
// vanilla NBT (SpawnData/EntityType/spinning mob) into the world save.
function getSpawnerStructureId(mobType) {
	if (!mobType) return null;
	// Route through normalizeMobId so entity-typeId spellings that differ
	// from the tracked-state spelling (e.g. real evoker entities report
	// "minecraft:evocation_illager" while state/eggs use "minecraft:
	// evoker") still resolve to the SAME structure file, instead of
	// silently creating a duplicate, never-reused structure per spelling.
	const clean = normalizeMobId(mobType);
	return `mystructure:spawner_${clean}`;
}

function captureSpawnerStructure(dimension, location, mobType) {
	const structId = getSpawnerStructureId(mobType);
	if (!structId || !dimension) return;
	try {
		// Bedrock createFromWorld throws if the structure already exists.
		// Delete the existing entry first so we can cleanly overwrite it with fresh data.
		try {
			world.structureManager.delete(structId);
		} catch {
			/* wasn't cached yet or delete ignored */
		}
		world.structureManager.createFromWorld(
			structId,
			dimension,
			location,
			location,
			{ saveMode: "World", includeEntities: false, includeBlocks: true }
		);
		debugLog(`[VirtualSpawners][DEBUG] Captured live spawner structure into ${structId}.`);
	} catch (e) {
		debugLog(`[VirtualSpawners][DEBUG] captureSpawnerStructure failed for ${structId}: ${e}`);
	}
}

function restoreSpawnerStructure(dimension, location, mobType) {
	const structId = getSpawnerStructureId(mobType);
	if (!structId || !dimension) return false;
	try {
		const struct = world.structureManager.get(structId);
		if (struct) {
			world.structureManager.place(structId, dimension, location);
			debugLog(`[VirtualSpawners][DEBUG] Restored vanilla spawner structure ${structId} at ${location.x},${location.y},${location.z}.`);
			return true;
		} else {
			debugLog(`[VirtualSpawners][DEBUG] Structure ${structId} not yet cached in world.`);
			return false;
		}
	} catch (e) {
		debugLog(`[VirtualSpawners][DEBUG] restoreSpawnerStructure failed for ${structId}: ${e}`);
		return false;
	}
}

// FIX (Error 5 — "one-by-one broken spawners still won't stack, and
// name shows 'Monster Spawner' instead of the real mob name"):
// Both bugs trace back to the SAME line: `sourceBlock.getItemStack(count,
// true)`. The `true` ("withData") flag copies the vanilla block-entity's
// own NBT snapshot onto the returned item — that's what makes the real
// EntityType ride along (needed so a re-placed spawner spawns the right
// mob without a fresh egg), but it ALSO drags along the block's own
// vanilla display name/translation key and an NBT blob that Bedrock
// treats as unique per snapshot:
//   • Two of these items, even with our lore/nameTag rewritten
//     afterward, don't merge — every single-break drop is its own
//     distinct snapshot instance. Sneak-break "worked" only because it
//     produces ONE item for the whole action, so there was never
//     anything to merge in the first place.
//   • The snapshot's own name can outrank/interfere with our nameTag in
//     the tooltip header depending on when vanilla resolves the
//     translated name vs. our override, which is how you got a spawner
//     correctly tracked as `minecraft:pig` in state but still reading
//     "Monster Spawner" (the generic vanilla spawner name) on the item.
//
// Fix: use getItemStack(amount, true) ONLY as a throwaway source to rip
// the real EntityType off of, then build a completely fresh, plain
// ItemStack and copy the entity type onto IT instead of returning the
// snapshot item directly. A freshly constructed ItemStack has no
// leftover block-entity NBT baked in, so two identical ones (same mob,
// same count, same buffer state) are byte-for-byte equal and merge
// normally, and our nameTag is the only name present — no vanilla
// snapshot name competing with it.
function extractEntityType(sourceBlock) {
	if (!sourceBlock) return null;
	try {
		const snapshot = sourceBlock.getItemStack(1, true);
		return snapshot?.getComponent?.("minecraft:entity_type")?.entityType ?? null;
	} catch (e) {
		debugLog("[VirtualSpawners][DEBUG] extractEntityType failed:", e);
		return null;
	}
}

/** Builds a labeled ItemStack for `count` physical items carrying `state`. */
export function buildSpawnerItemStack(state, count, sourceBlock) {
	// Always start from a clean, freshly-constructed item — never return
	// the raw block snapshot. See FIX (Error 5) above for why.
	const item = new ItemStack(SPAWNER_ITEM_ID, count);

	// Carry over the real vanilla EntityType so the spawner still "just
	// works" (spawns the right mob) if placed without a fresh egg —
	// same end result as before, just applied to a clean item instead of
	// returning the snapshot item wholesale.
	const entityTypeComp = item.getComponent?.("minecraft:entity_type");
	const entityType = extractEntityType(sourceBlock);
	if (entityTypeComp && entityType) {
		try {
			entityTypeComp.entityType = entityType;
		} catch (e) {
			debugLog("[VirtualSpawners][DEBUG] failed to set entity_type component:", e);
		}
	}

	const mobName = formatMobName(state.mobType);
	const itemState = { mobType: state.mobType, count: state.count ?? 1, buffer: state.buffer ?? {} };
	const isPlain = (itemState.count ?? 1) <= 1 && !SpawnerState.bufferHasItems(itemState);

	debugLog(
		`[VirtualSpawners][DEBUG] buildSpawnerItemStack: mob=${state.mobType} amount=${count} stackCount=${itemState.count} isPlain=${isPlain} entityType=${entityType ?? "none"}`
	);

	item.nameTag = isPlain
		? `§r§e${mobName} Spawner`
		: `§r§e${mobName} Spawner §7x${itemState.count}`;

	const visibleLore = getSpawnerLoreLines(state.mobType, itemState.count, !isPlain);
	item.setLore(visibleLore);

	// setItemState now encodes state into lore (no DP) to avoid the
	// "Cannot set dynamic properties on stackable items" error.
	SpawnerState.setItemState(item, itemState);
	return item;
}

// ── Spawn Egg & External Spawn Protection ───────────────────────────
// Tracks player spawn egg interactions to ensure egg-spawned mobs are
// NEVER intercepted or despawned by nearby virtual spawners.
const _recentEggUses = [];

function recordEggUse(dimensionId, location, mobType) {
	if (!mobType || !location) return;
	const currentTick = system.currentTick;
	while (_recentEggUses.length > 0 && currentTick - _recentEggUses[0].tick > 30) {
		_recentEggUses.shift();
	}
	_recentEggUses.push({
		tick: currentTick,
		dimensionId,
		x: location.x,
		y: location.y,
		z: location.z,
		mobType,
	});
}

function clearEggUsesNear(dimensionId, location, radius = 8) {
	for (let i = _recentEggUses.length - 1; i >= 0; i--) {
		const egg = _recentEggUses[i];
		if (egg.dimensionId === dimensionId) {
			if (
				Math.abs(egg.x - location.x) <= radius &&
				Math.abs(egg.z - location.z) <= radius &&
				Math.abs(egg.y - location.y) <= radius
			) {
				_recentEggUses.splice(i, 1);
			}
		}
	}
}

function isFromRecentEgg(dimensionId, location, mobType) {
	const currentTick = system.currentTick;
	for (let i = _recentEggUses.length - 1; i >= 0; i--) {
		const egg = _recentEggUses[i];
		if (currentTick - egg.tick > 20) break;
		if (egg.dimensionId === dimensionId && sameMobType(egg.mobType, mobType)) {
			const dx = location.x - egg.x;
			const dy = location.y - egg.y;
			const dz = location.z - egg.z;
			if (Math.abs(dx) <= 7 && Math.abs(dz) <= 7 && Math.abs(dy) <= 5) {
				return true;
			}
		}
	}
	return false;
}

function registerEggProtection() {
	try {
		world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
			const { itemStack, block, player } = event;
			const eggMob = mobTypeFromSpawnEgg(itemStack?.typeId);
			// CRITICAL: NEVER record egg use when clicking a spawner block!
			// Using an egg on a spawner is purely a spawner configuration action,
			// it does NOT spawn an egg entity into the world.
			if (eggMob && block && block.typeId !== SPAWNER_BLOCK_ID) {
				recordEggUse(player.dimension.id, block.location, eggMob);
			}
		});
	} catch (e) {
		debugLog("[VirtualSpawners] playerInteractWithBlock egg listener error:", e);
	}
}

// ── Wild-spawner discovery & Interception ─────────────────────────────

function registerWildDiscovery() {
	world.afterEvents.entitySpawn.subscribe((event) => {
		const entity = event.entity;
		if (!entity || entity.typeId === "minecraft:player" || entity.typeId === "minecraft:item") return;

		// 1. Filter out native non-spawner causes (breeding babies, chunk loads, cures/lightning)
		if (event.cause === "Born" || event.cause === "Loaded" || event.cause === "Transformed") {
			return;
		}

		// FIX ("evokers spawn and attack before being cancelled"):
		// This whole body used to run inside system.run(), deferring
		// everything to the NEXT tick. entitySpawn is an after-event — the
		// entity already fully exists and entity.remove() is callable
		// immediately, synchronously, right here; nothing here requires
		// deferral. For most mobs a one-tick delay before removal is
		// invisible. An evoker is the exception: it can detect a player and
		// begin a cast (spawning vex / firing fangs) within that SAME first
		// tick, before the deferred callback ever runs — so by the time the
		// old code called entity.remove(), the evoker had already acted at
		// least once. Running this synchronously removes it before it ever
		// gets a chance to act, which is what actually stops the vex/fangs
		// from ever being cast in the first place (the separate vex/fangs
		// cleanup below becomes a pure safety net instead of the main
		// defense).
		if (!entity.isValid) return;

		const loc = entity.location;
		const dimension = entity.dimension;

		// Intercept and purge rogue minion spawns near Evoker spawners
		if (entity.typeId === "minecraft:vex" || entity.typeId === "minecraft:evoker_fangs") {
			for (const spawnerLoc of SpawnerState.getActiveLocations()) {
				if (spawnerLoc.dimensionId !== dimension.id) continue;
				const dx = Math.abs(loc.x - (spawnerLoc.x + 0.5));
				const dz = Math.abs(loc.z - (spawnerLoc.z + 0.5));
				const dy = Math.abs(loc.y - (spawnerLoc.y + 0.5));
				if (dx <= 14 && dz <= 14 && dy <= 10) {
					const state = SpawnerState.getBlockState(spawnerLoc.dimensionId, spawnerLoc);
					if (state && sameMobType(state.mobType, "minecraft:evoker")) {
						try { entity.remove(); } catch {}
						return;
					}
				}
			}
		}

		// (baby-entity filtering removed — redundant with the cause==="Born" check
		// above, and it was blocking legitimate spawner-summoned baby variants,
		// e.g. zombie spawners' natural chance to spawn a baby zombie, from ever
		// being intercepted. cause "Born"/"Loaded"/"Transformed" already covers
		// breeding, chunk-load, and conversion cases — anything reaching this
		// point with cause "Spawned" is a real spawn event, baby or not, and
		// should be processed exactly like an adult.)

		// 3. Filter out mobs with custom names (named via nametag or /summon pig "Name")
		if (entity.nameTag && entity.nameTag.trim() !== "") {
			return;
		}

		// 4. Filter out mobs with custom tags (e.g. /tag @s add keep)
		try {
			const tags = entity.getTags();
			if (tags && tags.length > 0) return;
		} catch {}

		// 5. Filter out mobs spawned by player spawn eggs
		if (isFromRecentEgg(dimension.id, loc, entity.typeId)) {
			return;
		}

		let found = null;
		let foundState = null;
		let closestDistSq = Infinity;

		// 1. Check known tracked spawners in memory
		// Prioritize spawners of the exact same mobType to avoid shadowing when different spawners are nearby!
		for (const spawnerLoc of SpawnerState.getActiveLocations()) {
			if (spawnerLoc.dimensionId !== dimension.id) continue;
			const dx = loc.x - (spawnerLoc.x + 0.5);
			const dy = loc.y - (spawnerLoc.y + 0.5);
			const dz = loc.z - (spawnerLoc.z + 0.5);

			// Vanilla spawner spawns in a 9x9 area (dx, dz in [-4, +4]) and vertical [-1, +1].
			// Accounting for mob collision hitbox, water currents, pushing, drop shafts, and vertical leaping/flying:
			// Horizontal: up to 8.5 blocks
			// Vertical: from -16.0 blocks below (deep drop chutes) to +8.0 blocks above (flying/jumping mobs)
			if (Math.abs(dx) <= 8.5 && Math.abs(dz) <= 8.5 && dy >= -16.0 && dy <= 8.0) {
				const state = SpawnerState.getBlockState(spawnerLoc.dimensionId, spawnerLoc);
				if (!state) continue;
				// Defensive re-verification: getActiveLocations() should always
				// be accurate now that every removal path is covered by
				// registerOrphanCleanup, but this loop runs on EVERY mob spawn
				// in the world, so a single stale entry here (from an edge case
				// the safety net missed — e.g. an unloaded chunk at break time)
				// would silently misattribute production forever. Cheap check,
				// self-heals immediately if it ever finds one.
				if (sameMobType(state.mobType, entity.typeId)) {
					const candBlock = dimension.getBlock(spawnerLoc);
					if (!candBlock || candBlock.typeId !== SPAWNER_BLOCK_ID) {
						debugLog(
							`[VirtualSpawners][DEBUG] found stale tracked location during attribution, cleaning up: ${spawnerLoc.dimensionId}|${spawnerLoc.x}|${spawnerLoc.y}|${spawnerLoc.z}`
						);
						SpawnerState.deleteBlockState(spawnerLoc.dimensionId, spawnerLoc);
						continue;
					}
					const distSq = dx * dx + dy * dy + dz * dz;
					if (distSq < closestDistSq) {
						closestDistSq = distSq;
						found = spawnerLoc;
						foundState = state;
					}
				}
			}
		}

		// 2. Fallback scan for wild/untracked dungeon spawners not yet in active registry.
		// Only runs when ALLOW_WILD_SPAWNER_INTERACTION is true. With it false (the
		// default), a spawn event that isn't already near one of OUR tracked
		// spawners is simply none of this plugin's business — return immediately
		// and let vanilla do whatever it was already going to do.
		if (!found && ALLOW_WILD_SPAWNER_INTERACTION) {
			try {
				outer: for (let x = -8; x <= 8; x++) {
					for (let y = -10; y <= 8; y++) {
						for (let z = -8; z <= 8; z++) {
							const checkPos = {
								x: Math.floor(loc.x) + x,
								y: Math.floor(loc.y) + y,
								z: Math.floor(loc.z) + z,
							};
							const block = dimension.getBlock(checkPos);
							if (block && block.typeId === SPAWNER_BLOCK_ID) {
								const candState = SpawnerState.getBlockState(dimension.id, checkPos);
								// NEVER lock onto a neighboring spawner if its mobType doesn't match!
								if (candState && candState.mobType && !sameMobType(candState.mobType, entity.typeId)) {
									continue;
								}
								found = { dimensionId: dimension.id, ...checkPos };
								foundState = candState;
								break outer;
							}
						}
					}
				}
			} catch {
				return;
			}
		}

		if (!found) return;

		const key = locKeyOf(found.dimensionId, found.x, found.y, found.z);
		const state = foundState ?? SpawnerState.getBlockState(found.dimensionId, found);

		if (state) {
			// Only intercept if the spawned entity matches this tracked spawner's mob type
			if (state.mobType && !sameMobType(state.mobType, entity.typeId)) return;

			// TRACKED — this is the real production path. Credit loot,
			// remove the real entity immediately (no death event, no drops,
			// no window for it to act before removal).
			// decideRolls() picks legacy (per-block sqrt curve) vs. the new
			// owner-wide shared curve, per spawner_config.js — including the
			// newbie-protection threshold that keeps small owners on legacy
			// regardless of the global setting.
			const rolls = SpawnerState.decideRolls(state);

			const drops = SpawnerLoot.rollLoot(state.mobType, rolls, state.owner ?? "global", {
				cooked: COOKED_DROPS,
			});
			for (const { item, amount } of drops) SpawnerState.addToBuffer(state, item, amount);
			SpawnerState.setBlockState(found.dimensionId, found, state);
			try {
				entity.remove();
			} catch (e) {
				debugLog("[VirtualSpawners] entity.remove failed, trying kill fallback:", e);
			}
			if (entity.isValid) {
				try { entity.kill(); } catch {}
			}
			if (entity.isValid) {
				try { entity.teleport({ x: loc.x, y: -128, z: loc.z }); } catch {}
			}
		} else if (ALLOW_WILD_SPAWNER_INTERACTION) {
			// UNTRACKED / wild — remember type AND snapshot the wild spawner into structure cache!
			// (only reachable at all when the toggle above is on)
			_wildMobCache.set(key, canonicalMobType(entity.typeId));
			captureSpawnerStructure(dimension, found, canonicalMobType(entity.typeId));
		}
	});
}

// ── Silk Touch mining (un-stacking) ────────────────────────────────────

function damagePickaxe(player) {
	const inv = player.getComponent("minecraft:inventory")?.container;
	if (!inv) return true;
	const item = inv.getItem(player.selectedSlotIndex);
	if (!item) return true;

	const durability = item.getComponent("minecraft:durability");
	if (!durability) return true;

	const unbreakingLv = item.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
	const breakChance = durability.getDamageChance(unbreakingLv);

	if (Math.random() * 100 <= breakChance) durability.damage += 1;

	if (durability.damage >= durability.maxDurability) {
		inv.setItem(player.selectedSlotIndex, undefined);
		player.playSound("random.break", { pitch: randomRange(0.8, 1.2), location: player.location, volume: 1 });
		return true;
	}
	inv.setItem(player.selectedSlotIndex, item);
	return false;
}

const _activeBreakLocations = new Set();

function registerBreakHandler() {
	world.beforeEvents.playerBreakBlock.subscribe((data) => {
		const { block, player, itemStack } = data;
		if (block.typeId !== SPAWNER_BLOCK_ID) return;
		if (!itemStack || !PICKAXES.includes(itemStack.typeId)) return;
		if (!itemStack.getComponent("minecraft:enchantable")?.getEnchantment("silk_touch")) return;

		const dimensionId = block.dimension.id;
		const location = { x: block.location.x, y: block.location.y, z: block.location.z };

		// Only intercept blocks this plugin actually tracks. With
		// ALLOW_WILD_SPAWNER_INTERACTION off (the default), a vanilla/dungeon
		// spawner the player never placed/claimed is left completely alone —
		// we don't cancel the break at all, so normal vanilla Silk Touch rules
		// apply (which, for a real mob spawner, means it simply doesn't drop).
		const trackedAtBreak = SpawnerState.getBlockState(dimensionId, location);
		if (!trackedAtBreak && !ALLOW_WILD_SPAWNER_INTERACTION) return;

		data.cancel = true;

		const key = locKeyOf(dimensionId, location.x, location.y, location.z);

		// Prevent duplicate break triggers on the same block before resolution
		if (_activeBreakLocations.has(key)) return;
		_activeBreakLocations.add(key);

		const sneaking = player.isSneaking;
		const spawnPos = centerOf(location);
		const sourceBlock = block;

		system.run(() => {
			try {
				const toolBroke = damagePickaxe(player);

				// Read FRESH block state inside system.run to avoid stale closure state
				const state = SpawnerState.getBlockState(dimensionId, location);

				// Cache the live spawner's vanilla structure before it gets cleared
				const mobTypeToCache = state?.mobType ?? _wildMobCache.get(key);
				if (mobTypeToCache) {
					captureSpawnerStructure(block.dimension, location, mobTypeToCache);
				}

				if (!state) {
					// Should be unreachable when ALLOW_WILD_SPAWNER_INTERACTION is off,
					// since the beforeEvent above already returns before cancelling —
					// this is just a defensive fallback for a race condition (state
					// removed between the beforeEvent and this tick). Release the lock
					// and do nothing further; vanilla already wasn't cancelled.
					if (!ALLOW_WILD_SPAWNER_INTERACTION) {
						_activeBreakLocations.delete(key);
						return;
					}
					// Truly untracked wild spawner — use discovery cache if available.
					const mobType = _wildMobCache.get(key);
					const item = mobType
						? buildSpawnerItemStack({ mobType }, 1, sourceBlock)
						: sourceBlock.getItemStack(1, true);

					block.dimension.setBlockType(location, "minecraft:air");
					_wildMobCache.delete(key);

					if (mobType) {
						block.dimension.spawnItem(item, spawnPos);
						player.sendMessage(`§a✔ §7Obtained §e${formatMobName(mobType)} Spawner`);
					} else {
						block.dimension.spawnItem(item, spawnPos);
						player.sendMessage("§e⚠ §7Spawner type unknown — wait for it to spawn a mob first next time.");
					}
				} else {
					if (state.count <= 0) return;

					const removeCount = sneaking ? Math.min(MAX_UNSTACK_PER_BREAK, state.count) : 1;
					if (removeCount <= 0) return;
					const remaining = state.count - removeCount;

					const droppedItemState = { mobType: state.mobType, count: 1, buffer: {} };
					const item = buildSpawnerItemStack(droppedItemState, removeCount, sourceBlock);

					// Mining always hands count OUT of the owner's running total, whether
					// the block is fully removed or just partially unstacked. The item
					// itself carries no owner — that total only comes back once/if it
					// (or a replacement) gets placed again.
					if (state.owner) SpawnerState.adjustOwnerTotal(state.owner, -removeCount);

					if (remaining <= 0) {
						block.dimension.setBlockType(location, "minecraft:air");
						SpawnerState.deleteBlockState(dimensionId, location);
					} else {
						if (PURGE_BUFFER_ON_ANY_BREAK) SpawnerState.clearBuffer(state);
						state.count = remaining;
						SpawnerState.setBlockState(dimensionId, location, state);

						// Restore the vanilla spawner structure at this location so the remaining
						// stacked spawner continues to animate the spinning mob and emit flame particles!
						restoreSpawnerStructure(block.dimension, location, state.mobType);
					}

					block.dimension.spawnItem(item, spawnPos);
					player.sendMessage(
						`§a✔ §7Obtained §e${formatMobName(state.mobType)} Spawner §7x${removeCount}` +
							(remaining > 0 ? ` §8(§e${remaining}§8 left stacked)` : "")
					);
					if (PURGE_BUFFER_ON_ANY_BREAK) player.sendMessage("§c⚠ Uncollected contents were purged.");
				}

				if (!toolBroke) {
					player.playSound("block.mob_spawner.break", { pitch: randomRange(0.8, 1.2), location, volume: 1 });
				}
			} finally {
				_activeBreakLocations.delete(key);
			}
		});
	});
}

// ── Placement — re-register tracked state at the new location ─────────
// Vanilla itself restores the real EntityType (via getItemStack(n,true)
// on the item, done at mining time) — this handler only re-creates OUR
// bookkeeping (mobType/count/buffer) at the new location.
//
// FIX (Error 3 — THE "loses configuration on place" BUG):
// PlayerPlaceBlockBeforeEvent does NOT have an `itemStack` property on
// current Script API versions (it only ever existed on the old
// PlayerPlaceBlockBeforeEventBeta from ~1.20.30). On a current API,
// `event.itemStack` is simply `undefined`, so `if (!itemStack) return;`
// fired on EVERY placement — the block-state write below never ran, so
// every placed spawner silently reverted to "untracked" the moment you
// set it down. That's exactly the symptom: works after configuring with
// an egg (a different handler, registerInteractHandler, which is fine),
// breaks the instant you pick it back up and place it again.
//
// Fix: don't rely on the event's itemStack at all. Read the item the
// player is ACTUALLY holding, straight from their equippable component,
// at the moment of the before-event (still synchronous/same-tick).
function getHeldItemStack(player) {
	try {
		const equippable = player.getComponent("minecraft:equippable");
		return equippable?.getEquipment("Mainhand") ?? null;
	} catch (e) {
		console.warn("[VirtualSpawners] getHeldItemStack failed:", e);
		return null;
	}
}

function registerPlaceHandler() {
	world.beforeEvents.playerPlaceBlock.subscribe((event) => {
		const { block, dimension, player, permutationToPlace } = event;
		if (permutationToPlace?.type?.id !== SPAWNER_BLOCK_ID) return;

		const heldItem = getHeldItemStack(player);
		debugLog(
			`[VirtualSpawners][DEBUG] place: heldItem=${heldItem?.typeId ?? "null"} amount=${heldItem?.amount ?? "-"}`
		);
		if (!heldItem || heldItem.typeId !== SPAWNER_ITEM_ID) {
			debugLog("[VirtualSpawners][DEBUG] place: held item isn't a spawner item — treating as blank/other.");
			return;
		}

		const itemState = SpawnerState.getItemState(heldItem);
		debugLog(`[VirtualSpawners][DEBUG] place: itemState=${JSON.stringify(itemState)}`);
		if (!itemState) return; // blank/unconfigured spawner — nothing to track yet

		const location = { x: block.location.x, y: block.location.y, z: block.location.z };
		const dimensionId = dimension.id;

		// Write block state immediately (before event, synchronous) so that an
		// instant Silk Touch mine on the same tick always finds it.
		// A newly placed single spawner block is always initialized with count: 1.
		// Ownership is decided HERE, at placement — whoever is placing it right
		// now becomes the owner. The item itself never carries an owner, so a
		// stolen spawner naturally becomes the thief's the moment they place it.
		const state = SpawnerState.createState(itemState.mobType, 1, player.id);
		state.buffer = itemState.buffer ?? {};
		state.createdAt = system.currentTick;
		SpawnerState.setBlockState(dimensionId, location, state);
		SpawnerState.adjustOwnerTotal(player.id, state.count);
		debugLog(
			`[VirtualSpawners][DEBUG] place: tracked state written at ${dimensionId}|${location.x}|${location.y}|${location.z} -> ${JSON.stringify(state)} (block's own vanilla mob type may differ if entity_type component isn't settable on this item — script tracking is authoritative either way)`
		);

		// Restore real spawner block and send message deferred in system.run.
		system.run(() => {
			// Restore the real vanilla spawner block from structure cache so that
			// the spinning mob animation, flame particles, and vanilla mob spawning
			// work natively in vanilla Minecraft!
			restoreSpawnerStructure(dimension, location, itemState.mobType);

			player.sendMessage(`§a✔ §7Placed §e${formatMobName(itemState.mobType)} Spawner §7— now producing.`);
		});
	});
}

// ── Spawn-egg configuration ────────────────────────────────────────────
// 100% vanilla mechanic (spawn egg on a spawner sets its type) — we just
// watch for it so our own tracking stays in sync.
//
// FIX (Error 1): world.afterEvents.itemUseOn does not exist in the
// Bedrock scripting API and returns undefined, causing the .subscribe()
// call to throw "cannot read property 'subscribe' of undefined".
// The correct event is world.afterEvents.playerInteractWithBlock, which
// fires AFTER the interaction has resolved (so vanilla has already
// applied the spawn-egg change by the time our handler runs).

// ── Interact — configure + stacking + open GUI (one handler) ────────────
// All spawn-egg configuration AND interact logic lives in a single
// beforeEvents subscription so that configure always writes block state
// before the stack/GUI branches read it — within the same tick.

const _activeStackLocks = new Set(); // player.id
const _playerStackCooldown = new Map(); // player.id -> tick
const _playerGuiCooldown = new Map(); // player.id -> tick

function registerInteractHandler() {
	world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
		const { block, player, itemStack } = event;
		if (block.typeId !== SPAWNER_BLOCK_ID) return;

		const dimensionId = block.dimension.id;
		const location = { x: block.location.x, y: block.location.y, z: block.location.z };
		const currentTick = system.currentTick;

		// ── Configure path: spawn egg on spawner ──────────────────────────
		const mobType = mobTypeFromSpawnEgg(itemStack?.typeId);
		if (mobType) {
			const existing = SpawnerState.getBlockState(dimensionId, location);

			// Egg-configuring — NEW claim or RE-configure — is admin/op only,
			// always. There's no crafting recipe for spawners by design (see
			// spawner_admin.js), so an egg is the ONLY thing in this plugin that
			// can set or change a spawner's mob type. Regular players still get
			// full ownership rights over a spawner once it's configured — they
			// can place it, mine it, stack it, replace it, sell/trade it, collect
			// from it — everything EXCEPT deciding or changing what mob it
			// produces. That stays admin-only, permanently, on every use.
			if (!(player.isOp || player.hasTag("admin"))) {
				player.sendMessage(
					existing
						? "§c⚠ Only an admin can re-configure a spawner's mob type."
						: "§c⚠ Only an admin can configure a new spawner. This block isn't tracked yet."
				);
				return;
			}

			const count = existing?.count ?? 1;
			// Claiming a wild/dungeon spawner with an egg for the first time makes
			// the configuring player its owner. Re-configuring an ALREADY-owned
			// spawner (changing its mob type) keeps the existing owner — an egg
			// isn't a way to steal ownership, only placing/mining is.
			const owner = existing?.owner ?? player.id;
			const state = SpawnerState.createState(mobType, count, owner);
			if (existing) state.buffer = existing.buffer;
			state.createdAt = existing?.createdAt ?? currentTick;
			SpawnerState.setBlockState(dimensionId, location, state);
			if (!existing) SpawnerState.adjustOwnerTotal(owner, state.count);
			clearEggUsesNear(dimensionId, location, 8);
			debugLog(
				`[VirtualSpawners][DEBUG] configure via egg at ${dimensionId}|${location.x}|${location.y}|${location.z} -> ${JSON.stringify(state)}`
			);
			system.run(() => {
				captureSpawnerStructure(block.dimension, location, mobType);

				if (!SpawnerLoot.hasLootTable(mobType)) {
					player.sendMessage(`§e⚠ §7${formatMobName(mobType)} has no loot table yet — this spawner won't produce anything until one's added.`);
				} else {
					player.sendMessage(`§a✔ §7Spawner configured for §e${formatMobName(mobType)}§7.`);
				}
			});
			return; // don't fall through to stack/GUI
		}

		const equippable = player.getComponent("minecraft:equippable");
		const held = equippable?.getEquipment("Mainhand");

		// Anything else non-spawner in hand: leave vanilla alone.
		if (held && held.typeId !== SPAWNER_ITEM_ID) return;

		// Read state (guaranteed fresh — configure wrote it above if needed).
		const state = SpawnerState.getBlockState(dimensionId, location);
		debugLog(
			`[VirtualSpawners][DEBUG] interact at ${dimensionId}|${location.x}|${location.y}|${location.z}: blockState=${JSON.stringify(state)} held=${held?.typeId ?? "empty"}`
		);

		if (held && held.typeId === SPAWNER_ITEM_ID) {
			// ── Stacking path ────────────────────────────────────────────────
			event.cancel = true;

			if (!state) {
				player.sendMessage("§c⚠ Configure this spawner with a spawn egg before stacking it.");
				return;
			}

			// Ownership gate: you can only add YOUR held spawners onto a block
			// YOU already own. Without this, walking up and right-clicking your
			// own item onto someone else's stack would hand you their whole
			// built-up count for free — a one-click griefing/theft move.
			if (state.owner && state.owner !== player.id) {
				player.sendMessage("§c⚠ This spawner belongs to someone else. Mine it to get it for yourself.");
				return;
			}
			const heldState = SpawnerState.getItemState(held);
			if (!heldState) {
				player.sendMessage("§c⚠ That spawner isn't configured yet — it can't be stacked.");
				return;
			}
			if (heldState.mobType !== state.mobType) {
				player.sendMessage(`§c⚠ Only §e${formatMobName(state.mobType)}§c spawners can be stacked here.`);
				return;
			}

			// Atomic anti-dupe lock and packet debounce:
			// Prevents client packet bursts or rapid clicks from duplicating items.
			const lastStackTick = _playerStackCooldown.get(player.id) ?? 0;
			if (_activeStackLocks.has(player.id) || (currentTick - lastStackTick < 6)) {
				return;
			}

			if (state.count >= SpawnerState.MAX_STACK) {
				player.sendMessage("§c⚠ This spawner is already at the maximum stack size.");
				return;
			}

			_activeStackLocks.add(player.id);
			_playerStackCooldown.set(player.id, currentTick);

			const sneaking = player.isSneaking;

			system.run(() => {
				try {
					if (!player.isValid) return;
					const eq = player.getComponent("minecraft:equippable");
					if (!eq) return;

					// ATOMIC CHECK: Re-read the real, live item in the player's Mainhand at execution time!
					const liveHeld = eq.getEquipment("Mainhand");
					if (!liveHeld || liveHeld.typeId !== SPAWNER_ITEM_ID) return;

					const liveHeldState = SpawnerState.getItemState(liveHeld);
					if (!liveHeldState) return;

					const fresh = SpawnerState.getBlockState(dimensionId, location);
					if (!fresh) return;

					// Re-check ownership at execution time too — the before-event check
					// above can go stale if state changed between events (e.g. someone
					// else's stack-lock resolved in between).
					if (fresh.owner && fresh.owner !== player.id) {
						player.sendMessage("§c⚠ This spawner belongs to someone else. Mine it to get it for yourself.");
						return;
					}

					if (liveHeldState.mobType !== fresh.mobType) {
						player.sendMessage(`§c⚠ Only §e${formatMobName(fresh.mobType)}§c spawners can be stacked here.`);
						return;
					}

					const room = SpawnerState.MAX_STACK - fresh.count;
					if (room <= 0) {
						player.sendMessage("§c⚠ This spawner is already at the maximum stack size.");
						return;
					}

					const inHand = liveHeld.amount;
					if (inHand <= 0) return;

					// If sneaking, dump the entire hand into the spawner (capped by available room)
					// If not sneaking, add 1 item
					const wanted = sneaking ? inHand : 1;
					const actuallyAdded = Math.max(0, Math.min(wanted, inHand, room));
					if (actuallyAdded <= 0) return;

					// DEDUCT FROM PLAYER INVENTORY FIRST:
					const remainingInHand = inHand - actuallyAdded;
					if (remainingInHand <= 0) {
						eq.setEquipment("Mainhand", undefined);
					} else {
						liveHeld.amount = remainingInHand;
						eq.setEquipment("Mainhand", liveHeld);
					}

					// CREDIT EXACTLY WHAT WAS CONSUMED:
					const before = fresh.count;
					fresh.count = SpawnerState.normalizeCount(fresh.count + actuallyAdded);
					SpawnerState.setBlockState(dimensionId, location, fresh);
					// normalizeCount() clamps at MAX_STACK, so credit the owner total
					// with what actually landed, not the raw amount consumed.
					SpawnerState.adjustOwnerTotal(fresh.owner ?? player.id, fresh.count - before);

					player.onScreenDisplay?.setActionBar?.(`+${actuallyAdded} — stack now ${fresh.count}`);
					player.playSound("random.orb", { pitch: 1.2, volume: 0.8 });
				} finally {
					_activeStackLocks.delete(player.id);
				}
			});
			return;
		}

		// ── Empty-hand path: open the GUI (only for tracked spawners) ────────
		if (!state) return; // untracked/wild spawner — leave vanilla alone
		event.cancel = true;

		// Debounce GUI opening to prevent multiple rapid open requests
		const lastGuiTick = _playerGuiCooldown.get(player.id) ?? 0;
		if (currentTick - lastGuiTick < 8) return;
		_playerGuiCooldown.set(player.id, currentTick);

		system.run(async () => {
			const { openSpawnerMenu } = await import("./spawner_gui.js");
			openSpawnerMenu(player, dimensionId, location);
		});
	});
}

// ── Orphaned-state safety net ───────────────────────────────────────
// FIX ("blank spawner placed at an old coordinate opens the previous
// mob's GUI" / "new spawner nearby stops producing loot"):
//
// registerBreakHandler's cleanup (SpawnerState.deleteBlockState) only
// runs on the SILK-TOUCH-GATED path — line ~578 returns immediately for
// any break without Silk Touch. Any other way a tracked spawner block
// disappears (no-silk-touch break, creative instant-break, an
// explosion, another addon's block logic, /setblock, etc.) skips that
// cleanup entirely, so the tracked state for that exact x/y/z survives
// forever as an orphan. The next block placed at that same coordinate —
// even a genuinely blank one — inherits a GUI and loot table it never
// asked for, because every state lookup elsewhere in this file trusts
// "state exists for this coordinate" without ever re-checking whether
// the block is still real.
//
// This is a backstop, independent of tool/enchantment: it fires on
// EVERY break (afterEvents.playerBreakBlock has no silk-touch gate) and
// simply confirms the block genuinely isn't a spawner anymore before
// deleting its state. Also sweeps once on startup to catch orphans left
// behind by any session before this fix existed.
function cleanupIfOrphaned(dimensionId, location) {
	try {
		const dimension = world.getDimension(dimensionId);
		const block = dimension.getBlock(location);
		if (!block || block.typeId !== SPAWNER_BLOCK_ID) {
			const had = SpawnerState.getBlockState(dimensionId, location);
			if (had) {
				SpawnerState.deleteBlockState(dimensionId, location);
				debugLog(
					`[VirtualSpawners][DEBUG] cleanupIfOrphaned: deleted stale state at ${dimensionId}|${location.x}|${location.y}|${location.z} (block is now ${block?.typeId ?? "unloaded"}, not a spawner)`
				);
			}
		}
	} catch (e) {
		debugLog("[VirtualSpawners][DEBUG] cleanupIfOrphaned failed:", e);
	}
}

function registerOrphanCleanup() {
	// Catch-all: fires on every block break regardless of tool/enchant.
	world.afterEvents.playerBreakBlock.subscribe((event) => {
		const { block, dimension } = event;
		// event.block already reflects the post-break state (air) by the
		// time this after-event fires, but we still re-check via
		// cleanupIfOrphaned rather than assuming, since other systems
		// could theoretically place something back in the same tick.
		const location = { x: block.location.x, y: block.location.y, z: block.location.z };
		cleanupIfOrphaned(dimension.id, location);
	});

	// One-time startup sweep: clean up anything already orphaned from
	// before this fix was installed (e.g. spawners broken without silk
	// touch in a previous session).
	system.run(() => {
		let cleaned = 0;
		for (const loc of SpawnerState.getActiveLocations()) {
			try {
				const dimension = world.getDimension(loc.dimensionId);
				const block = dimension.getBlock(loc);
				if (!block || block.typeId !== SPAWNER_BLOCK_ID) {
					SpawnerState.deleteBlockState(loc.dimensionId, loc);
					cleaned++;
				}
			} catch {
				/* chunk not loaded — leave it, next break/interact near it will catch it */
			}
		}
		if (cleaned > 0) {
			debugLog(`[VirtualSpawners][DEBUG] registerOrphanCleanup: startup sweep removed ${cleaned} orphaned spawner state(s).`);
		}
	});
}

export function syncPlayerSpawnerLores(player) {
	if (!player || !player.isValid) return;
	const inventory = player.getComponent("minecraft:inventory");
	const container = inventory?.container;
	if (!container) return;

	for (let i = 0; i < container.size; i++) {
		const item = container.getItem(i);
		if (!item || item.typeId !== SPAWNER_ITEM_ID) continue;

		const state = SpawnerState.getItemState(item);
		if (!state || !state.mobType) continue;

		const mobName = formatMobName(state.mobType);
		const count = state.count ?? 1;
		const hasBuf = SpawnerState.bufferHasItems(state);
		const isPlain = count <= 1 && !hasBuf;
		const targetNameTag = isPlain
			? `§r§e${mobName} Spawner`
			: `§r§e${mobName} Spawner §7x${count}`;

		const targetLore = getSpawnerLoreLines(state.mobType, count, !isPlain);

		const currentLore = (item.getLore?.() ?? []).filter((l) => !l.startsWith("\uFEFF"));
		const isLoreEqual =
			currentLore.length === targetLore.length &&
			currentLore.every((val, idx) => val === targetLore[idx]);

		if (!isLoreEqual || item.nameTag !== targetNameTag) {
			item.nameTag = targetNameTag;
			item.setLore(targetLore);
			SpawnerState.setItemState(item, state);
			container.setItem(i, item);
		}
	}
}

function registerInventoryLoreSync() {
	world.afterEvents.playerSpawn.subscribe((event) => {
		syncPlayerSpawnerLores(event.player);
	});

	system.runInterval(() => {
		for (const player of world.getPlayers()) {
			syncPlayerSpawnerLores(player);
		}
	}, 100);
}

export function register() {
	registerEggProtection();
	registerWildDiscovery();
	registerBreakHandler();
	registerPlaceHandler();
	registerInteractHandler(); // handles configure + stacking + GUI in one subscription
	registerOrphanCleanup();
	registerInventoryLoreSync();
}

export default {
	register,
	formatMobName,
	formatItemName,
	getSpawnerLoreLines,
	syncPlayerSpawnerLores,
	buildSpawnerItemStack,
	SPAWNER_BLOCK_ID,
	SPAWNER_ITEM_ID,
};
