/**
 * spawner_gui.js
 *
 * 54-Slot (Double Chest) Collection GUI for Tracked Spawners.
 *
 * Built on ChestFormData ("54") from forms.js:
 *   - Slots 0–44  (45 slots, Rows 0–4): Item loot display area (stacks of up to 64).
 *   - Slot 45     (Row 5, Col 0): Previous Page Arrow (active when page > 0).
 *   - Slots 46–48 (Row 5, Cols 1–3): Gray glass filler.
 *   - Slot 49     (Row 5, Col 4): Spawner Mob Info (Egg icon, count, page number, total loot).
 *   - Slot 50     (Row 5, Col 5): Gray glass filler.
 *   - Slot 51     (Row 5, Col 6): "Claim All" (Chest icon when claimable; Barrier with "Inventory Full" when no room).
 *   - Slot 52     (Row 5, Col 7): Gray glass filler.
 *   - Slot 53     (Row 5, Col 8): Next Page Arrow (active when page < totalPages - 1).
 */

import { system, ItemStack } from "@minecraft/server";
import ChestFormData from "../Modules/forms.js";
import * as SpawnerState from "./spawner_state.js";
import { formatMobName } from "./spawner_vanilla.js";

// ── Layout Constants ────────────────────────────────────────────────
const CHEST_SLOTS = 54;
const PAGE_SIZE = 45; // Slots 0 to 44 for items
const PREV_PAGE_SLOT = 45;
const INFO_SLOT = 49;
const CLAIM_ALL_SLOT = 51;
const NEXT_PAGE_SLOT = 53;

// Natural stack size caps for special items
const STACK_SIZE_OVERRIDES = {
	"minecraft:ender_pearl": 16,
	"minecraft:snowball": 16,
	"minecraft:egg": 16,
	"minecraft:honey_bottle": 16,
	"minecraft:saddle": 1,
	"minecraft:bow": 1,
	"minecraft:trident": 1,
	"minecraft:totem_of_undying": 1,
};

function getMaxStack(typeId) {
	return STACK_SIZE_OVERRIDES[typeId] ?? 64;
}

function niceName(typeId) {
	return typeId
		.replace("minecraft:", "")
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

/**
 * Expands the key-value buffer { [typeId]: totalCount } into individual
 * item stacks of up to maxStack each, mirroring real chest slots.
 */
function expandBufferToStacks(buffer) {
	const stacks = [];
	for (const [typeId, total] of Object.entries(buffer)) {
		if (typeof total !== "number" || total <= 0) continue;
		const maxStack = getMaxStack(typeId);
		let remaining = total;
		while (remaining > 0) {
			const chunk = Math.min(maxStack, remaining);
			stacks.push({ typeId, amount: chunk });
			remaining -= chunk;
		}
	}
	return stacks;
}

/**
 * Counts total individual items currently held in buffer.
 */
function getTotalBufferedCount(buffer) {
	let sum = 0;
	for (const count of Object.values(buffer)) {
		if (typeof count === "number" && count > 0) sum += count;
	}
	return sum;
}

/**
 * Checks if the player can accept AT LEAST ONE item from the buffer.
 * Returns true if emptySlotsCount > 0 or any existing inventory stack has room.
 */
function canPlayerAcceptAny(player, buffer) {
	const container = player.getComponent("minecraft:inventory")?.container;
	if (!container) return false;
	if (container.emptySlotsCount > 0) return true;

	for (let slot = 0; slot < container.size; slot++) {
		const item = container.getItem(slot);
		if (!item) return true;
		const bufferedAmount = buffer[item.typeId];
		if (bufferedAmount && bufferedAmount > 0) {
			const maxStack = item.maxAmount ?? getMaxStack(item.typeId);
			if (item.amount < maxStack) return true;
		}
	}
	return false;
}

/**
 * Checks if the player can accept a specific item type.
 */
function canPlayerAcceptItem(player, typeId) {
	const container = player.getComponent("minecraft:inventory")?.container;
	if (!container) return false;
	if (container.emptySlotsCount > 0) return true;

	const maxStack = getMaxStack(typeId);
	for (let slot = 0; slot < container.size; slot++) {
		const item = container.getItem(slot);
		if (item && item.typeId === typeId && item.amount < (item.maxAmount ?? maxStack)) {
			return true;
		}
	}
	return false;
}

/**
 * Builds the 54-slot ChestFormData for the specified page.
 */
function buildMenu(player, dimensionId, location, state, page, stacks) {
	const mobName = formatMobName(state.mobType);
	const eggTexture = state.mobType ? `${state.mobType}_spawn_egg` : "minecraft:spawner";
	const totalStacks = stacks.length;
	const totalPages = Math.max(1, Math.ceil(totalStacks / PAGE_SIZE));
	const safePage = Math.max(0, Math.min(page, totalPages - 1));
	const totalItems = getTotalBufferedCount(state.buffer);
	const hasLoot = totalStacks > 0;
	const canAcceptAny = canPlayerAcceptAny(player, state.buffer);

	const form = new ChestFormData("54", `§8${mobName} Spawner §7x${state.count}`);

	// Fill all 54 slots with gray glass by default
	for (let i = 0; i < CHEST_SLOTS; i++) {
		form.button(i, "", [], "g/gray");
	}

	// ── Populate Page Items (Slots 0 to 44) ───────────────────────────
	const startIndex = safePage * PAGE_SIZE;
	const pageStacks = stacks.slice(startIndex, startIndex + PAGE_SIZE);

	if (pageStacks.length === 0) {
		// Empty buffer indicator at center of display grid (Slot 22 = row 2, col 4)
		form.button(
			22,
			"§7Nothing Produced Yet",
			["§8This spawner has not accumulated any loot.", "§8Stay nearby to generate loot!"],
			"minecraft:barrier"
		);
	} else {
		pageStacks.forEach((stack, i) => {
			const slot = i;
			form.button(
				slot,
				`§f${niceName(stack.typeId)}`,
				[`§7Amount: §a${stack.amount}`, "§eClick to collect this stack"],
				stack.typeId,
				stack.amount
			);
		});
	}

	// ── Row 5: Navigation & Controls (Slots 45 to 53) ─────────────────
	const hasPrev = safePage > 0;
	const hasNext = safePage < totalPages - 1;

	// Slot 45: Previous Page
	if (hasPrev) {
		form.button(
			PREV_PAGE_SLOT,
			"§e§l← Previous Page",
			[`§7Page ${safePage} of ${totalPages}`, "§8Click to view previous items"],
			"minecraft:arrow"
		);
	} else {
		form.button(PREV_PAGE_SLOT, "", [], "g/gray");
	}

	// Slot 49: Spawner Mob Info
	form.button(
		INFO_SLOT,
		`§e${mobName} Spawner`,
		[
			`§7Stacked: §f${state.count}`,
			`§7Stored Loot: §a${totalItems} items`,
			`§7Page: §e${safePage + 1}§7 / §e${totalPages}`,
			"§8Produces when a player is nearby",
		],
		eggTexture
	);

	// Slot 51: Claim All Button (disabled if inventory has no space)
	if (!hasLoot) {
		form.button(
			CLAIM_ALL_SLOT,
			"§8Collect All",
			["§8Spawner buffer is currently empty"],
			"minecraft:chest"
		);
	} else if (!canAcceptAny) {
		// Unclaimable state when inventory is completely full
		form.button(
			CLAIM_ALL_SLOT,
			"§c§lInventory Full",
			["§7Your inventory has no free space!", "§8Clear inventory slots to claim loot."],
			"minecraft:barrier"
		);
	} else {
		form.button(
			CLAIM_ALL_SLOT,
			"§a§lClaim All Loot",
			[
				`§7Total Items: §e${totalItems}`,
				"§8Click to collect all available loot",
			],
			"minecraft:chest"
		);
	}

	// Slot 53: Next Page
	if (hasNext) {
		form.button(
			NEXT_PAGE_SLOT,
			"§e§lNext Page →",
			[`§7Page ${safePage + 2} of ${totalPages}`, "§8Click to view more items"],
			"minecraft:arrow"
		);
	} else {
		form.button(NEXT_PAGE_SLOT, "", [], "g/gray");
	}

	return { form, safePage, totalPages, pageStacks };
}

// Set of players currently viewing or interacting with a GUI to prevent race conditions
const _busyPlayers = new Set();

/**
 * Opens the 54-slot spawner GUI for the player.
 */
export async function openSpawnerMenu(player, dimensionId, location, requestedPage = 0) {
	if (!player?.isValid) return;

	const state = SpawnerState.getBlockState(dimensionId, location);
	if (!state) {
		player.sendMessage("§c⚠ This spawner has no data and cannot be opened.");
		return;
	}

	const stacks = expandBufferToStacks(state.buffer);
	const { form, safePage, totalPages, pageStacks } = buildMenu(
		player,
		dimensionId,
		location,
		state,
		requestedPage,
		stacks
	);

	// Prevent duplicate form spam
	if (_busyPlayers.has(player.name)) return;
	_busyPlayers.add(player.name);

	let resp;
	try {
		resp = await new Promise((resolve) => {
			system.runTimeout(() => form.show(player).then(resolve), 2);
		});
	} finally {
		_busyPlayers.delete(player.name);
	}

	if (!resp || resp.canceled) return;

	const clicked = resp.selection;

	// ── 1. Previous Page Click ────────────────────────────────────────
	if (clicked === PREV_PAGE_SLOT) {
		if (safePage > 0) {
			return openSpawnerMenu(player, dimensionId, location, safePage - 1);
		}
		return openSpawnerMenu(player, dimensionId, location, safePage);
	}

	// ── 2. Next Page Click ────────────────────────────────────────────
	if (clicked === NEXT_PAGE_SLOT) {
		if (safePage < totalPages - 1) {
			return openSpawnerMenu(player, dimensionId, location, safePage + 1);
		}
		return openSpawnerMenu(player, dimensionId, location, safePage);
	}

	// ── 3. Claim All Click ────────────────────────────────────────────
	if (clicked === CLAIM_ALL_SLOT) {
		const fresh = SpawnerState.getBlockState(dimensionId, location);
		if (!fresh || !SpawnerState.bufferHasItems(fresh)) {
			player.sendMessage("§e⚠ Spawner buffer is already empty.");
			return openSpawnerMenu(player, dimensionId, location, safePage);
		}

		if (!canPlayerAcceptAny(player, fresh.buffer)) {
			player.sendMessage("§c⚠ Inventory full — free up inventory space to collect items.");
			return openSpawnerMenu(player, dimensionId, location, safePage);
		}

		const container = player.getComponent("minecraft:inventory")?.container;
		if (!container) return;

		let totalGiven = 0;
		let anyBlocked = false;

		// Process each item type atomically
		for (const [typeId, count] of Object.entries(fresh.buffer)) {
			if (count <= 0) continue;
			let remaining = count;
			const maxStack = getMaxStack(typeId);

			while (remaining > 0) {
				const chunk = Math.min(maxStack, remaining);
				const stack = new ItemStack(typeId, chunk);
				const leftover = container.addItem(stack);
				const actuallyAdded = leftover ? chunk - leftover.amount : chunk;

				if (actuallyAdded > 0) {
					SpawnerState.takeFromBuffer(fresh, typeId, actuallyAdded);
					totalGiven += actuallyAdded;
				}

				remaining -= chunk;
				if (actuallyAdded < chunk) {
					anyBlocked = true;
					break; // Inventory is full for this item
				}
			}
		}

		SpawnerState.setBlockState(dimensionId, location, fresh);

		if (totalGiven > 0) {
			player.sendMessage(`§a✔ Collected §f${totalGiven}§a items!`);
		}
		if (anyBlocked) {
			player.sendMessage("§e⚠ Inventory full — remaining items left in spawner.");
		}

		return openSpawnerMenu(player, dimensionId, location, safePage);
	}

	// ── 4. Individual Stack Slot Click (Slots 0 to 44) ─────────────────
	if (clicked >= 0 && clicked < pageStacks.length) {
		const targetStack = pageStacks[clicked];
		if (!targetStack) return openSpawnerMenu(player, dimensionId, location, safePage);

		if (!canPlayerAcceptItem(player, targetStack.typeId)) {
			player.sendMessage(`§c⚠ Inventory full — no space for ${niceName(targetStack.typeId)}.`);
			return openSpawnerMenu(player, dimensionId, location, safePage);
		}

		const container = player.getComponent("minecraft:inventory")?.container;
		if (!container) return;

		const fresh = SpawnerState.getBlockState(dimensionId, location);
		if (!fresh || !fresh.buffer[targetStack.typeId]) {
			player.sendMessage("§e⚠ That item is no longer available in the spawner.");
			return openSpawnerMenu(player, dimensionId, location, safePage);
		}

		// Amount currently available in spawner
		const available = fresh.buffer[targetStack.typeId];
		const toTake = Math.min(targetStack.amount, available);
		if (toTake <= 0) {
			return openSpawnerMenu(player, dimensionId, location, safePage);
		}

		// Attempt to add to inventory
		const stack = new ItemStack(targetStack.typeId, toTake);
		const leftover = container.addItem(stack);
		const actuallyAdded = leftover ? toTake - leftover.amount : toTake;

		if (actuallyAdded > 0) {
			SpawnerState.takeFromBuffer(fresh, targetStack.typeId, actuallyAdded);
			SpawnerState.setBlockState(dimensionId, location, fresh);
			player.sendMessage(`§a✔ Collected §f${actuallyAdded}x ${niceName(targetStack.typeId)}`);
		}

		if (actuallyAdded < toTake) {
			player.sendMessage("§e⚠ Inventory full — remainder left in spawner.");
		}

		return openSpawnerMenu(player, dimensionId, location, safePage);
	}

	// Any other slot clicked (glass filler, info icon) simply reopens menu
	return openSpawnerMenu(player, dimensionId, location, safePage);
}

export default { openSpawnerMenu };
