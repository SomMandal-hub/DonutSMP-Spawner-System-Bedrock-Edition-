/**
 * spawner_loot_ui.js — the "Spawner Loot" panel (admin only).
 *
 *   Mob list  ->  one mob's drops  ->  edit / add / delete a drop
 *
 * For every spawner type an admin can change which items drop, the min/max
 * amount, the drop chance (%) and whether pity applies. Pity settings are
 * global. Everything is validated and saved in the world (see spawner_loot.js).
 */

import { system } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import ChestFormData from "../Modules/forms.js";
import { typeIdToID, typeIdToDataId } from "../Modules/typeIds.js";
import * as Loot from "./spawner_loot.js";
import { formatMobName, formatItemName } from "./spawner_vanilla.js";
import { isAdmin } from "./spawner_perms.js";
import { openHub, forceShow } from "./config_hub.js";

const TEX = {
	BORDER: "minecraft:gray_stained_glass_pane",
	BACK:   "minecraft:arrow",
	ADD:    "minecraft:emerald",
	INFO:   "minecraft:paper",
	PITY:   "minecraft:clock",
	RESET:  "minecraft:lava_bucket",
	SPAWNER:"minecraft:mob_spawner",
};

const SLOT_BACK = 45, SLOT_A = 47, SLOT_INFO = 49, SLOT_B = 51, SLOT_RESET = 53;

/** An icon the chest form can actually draw (unknown ids fall back to paper). */
function iconFor(id) {
	return typeIdToID.has(id) || typeIdToDataId.has(id) ? id : "minecraft:paper";
}

function mobIcon(mobType) {
	return iconFor(`${mobType}_spawn_egg`) === `${mobType}_spawn_egg` ? `${mobType}_spawn_egg` : TEX.SPAWNER;
}

function pct(chance) {
	return `${+(chance * 100).toFixed(3)}%`;
}

function blankForm(title) {
	const form = new ChestFormData("54", title);
	for (let i = 0; i < 54; i++) form.button(i, "§8", null, TEX.BORDER);
	return form;
}

const tick = () => new Promise((r) => system.runTimeout(r, 1));

// ── Screen 1: every spawner type ─────────────────────────────────────

export async function showLootMobs(player) {
	if (!isAdmin(player)) return player.sendMessage("§c[Config] ❌ Admin only.");

	const mobs = Loot.getSupportedMobTypes();
	const form = blankForm("§6§lConfig §8> §eSpawner Loot");

	mobs.slice(0, 45).forEach((mob, i) => {
		const n = Loot.LOOT_TABLES[mob].length;
		form.button(i, `§e§l${formatMobName(mob)}`, [
			`§7Drops: §f${n}`,
			Loot.isCustomized(mob) ? "§d✎ Customized" : "§8Default",
			"",
			"§b> Click to edit",
		], mobIcon(mob));
	});

	form.button(SLOT_BACK, "§c§lBack", ["§7Return to the hub"], TEX.BACK);
	form.button(SLOT_A, "§e§lPity Settings", ["§7Bad-luck protection (applies to all mobs)", `§7Currently: ${Loot.PITY_CONFIG.ENABLED ? "§aON" : "§cOFF"}`, "", "§b> Click to edit"], TEX.PITY);
	form.button(SLOT_INFO, "§f§lInfo", ["§7Pick a spawner type to change what it drops,", "§7how many, and how often.", "§8Saved in the world automatically."], TEX.INFO);
	form.button(SLOT_RESET, "§4§lReset All Loot", ["§7Revert EVERY mob's loot to defaults"], TEX.RESET);

	const res = await forceShow(player, form);
	if (res.canceled) return;
	const sel = res.selection;

	if (sel === SLOT_BACK) return openHub(player);
	if (sel === SLOT_A) {
		await tick();
		await promptPity(player);
		return system.run(() => showLootMobs(player));
	}
	if (sel === SLOT_RESET) {
		await tick();
		if (await confirm(player, "§c§lReset ALL loot?", "§7I understand every mob's loot returns to defaults.")) {
			Loot.resetAllTables();
			player.sendMessage("§6[Spawner Loot] §aAll loot tables reset to defaults.");
		}
		return system.run(() => showLootMobs(player));
	}
	if (sel >= 0 && sel < mobs.length && sel < 45) return showMobLoot(player, mobs[sel]);
	system.run(() => showLootMobs(player)); // border click
}

// ── Screen 2: one mob's drops ────────────────────────────────────────

async function showMobLoot(player, mob) {
	const table = Loot.LOOT_TABLES[mob];
	const form = blankForm(`§6§l${formatMobName(mob)} §8> §eLoot`);

	table.forEach((e, i) => {
		form.button(i, `§b§l${formatItemName(e.item)}`, [
			`§7Amount: §f${e.min}–${e.max}`,
			`§7Chance: §f${pct(e.chance)} §8per roll`,
			`§7Pity: ${e.pity === false ? "§cOFF" : "§aON"}`,
			`§7Avg / roll: §f${+(e.chance * (e.min + e.max) / 2).toFixed(4)}`,
			"",
			"§b> Click to edit / delete",
		], iconFor(e.item));
	});

	form.button(SLOT_BACK, "§c§lBack", ["§7Back to all spawner types"], TEX.BACK);
	form.button(SLOT_A, "§a§lAdd Item", table.length >= Loot.LOOT_LIMITS.maxEntries
		? ["§cThis mob is at the item limit"] : ["§7Add a new drop to this spawner"], TEX.ADD);
	form.button(SLOT_INFO, `§f§l${formatMobName(mob)}`, [
		`§7Drops: §f${table.length} §8(max ${Loot.LOOT_LIMITS.maxEntries})`,
		Loot.isCustomized(mob) ? "§d✎ Customized" : "§8Default loot",
		"§8Food drops are cooked if 'Cooked Drops' is on.",
	], mobIcon(mob));
	form.button(SLOT_B, "§e§lReset This Mob", ["§7Restore this mob's default loot"], TEX.RESET);

	const res = await forceShow(player, form);
	if (res.canceled) return;
	const sel = res.selection;

	if (sel === SLOT_BACK) return showLootMobs(player);
	if (sel === SLOT_A) {
		if (table.length >= Loot.LOOT_LIMITS.maxEntries) return system.run(() => showMobLoot(player, mob));
		await tick();
		await promptEntry(player, mob, null);
		return system.run(() => showMobLoot(player, mob));
	}
	if (sel === SLOT_B) {
		await tick();
		if (await confirm(player, "§c§lReset this mob?", `§7Restore ${formatMobName(mob)}'s default loot.`)) {
			Loot.resetMobTable(mob);
			player.sendMessage(`§6[Spawner Loot] §a${formatMobName(mob)} loot reset to defaults.`);
		}
		return system.run(() => showMobLoot(player, mob));
	}
	if (sel >= 0 && sel < table.length) {
		await tick();
		await promptEntry(player, mob, sel);
	}
	system.run(() => showMobLoot(player, mob));
}

// ── Forms ────────────────────────────────────────────────────────────

/** Add (index === null) or edit/delete one drop. */
async function promptEntry(player, mob, index) {
	const cur = index === null ? { item: "", min: 1, max: 1, chance: 1 } : Loot.LOOT_TABLES[mob][index];
	const isEdit = index !== null;
	const form = new ModalFormData()
		.title(isEdit ? `§6Edit: ${formatItemName(cur.item)}` : `§aAdd drop: ${formatMobName(mob)}`)
		.textField("Item ID (e.g. diamond or minecraft:emerald)", "minecraft:diamond", { defaultValue: cur.item })
		.textField("Min amount (0 = may drop nothing)", "0", { defaultValue: String(cur.min) })
		.textField("Max amount", "1", { defaultValue: String(cur.max) })
		.textField("Drop chance % per roll (0.01 – 100)", "100", { defaultValue: String(+(cur.chance * 100).toFixed(3)) })
		.toggle("Use pity (bad-luck protection)", { defaultValue: cur.pity !== false });
	if (isEdit) form.toggle("§cDELETE this drop", { defaultValue: false });

	const res = await forceShow(player, form);
	if (res.canceled) return;
	const v = res.formValues;

	const table = Loot.LOOT_TABLES[mob].map((e) => ({ ...e }));

	if (isEdit && v[5]) {
		table.splice(index, 1);
		Loot.setMobTable(mob, table);
		return player.sendMessage(`§6[Spawner Loot] §fRemoved §e${formatItemName(cur.item)} §ffrom ${formatMobName(mob)}.`);
	}

	const entry = {
		item: String(v[0] ?? ""),
		min: parseInt(String(v[1]), 10),
		max: parseInt(String(v[2]), 10),
		chance: parseFloat(String(v[3]).replace(",", ".")) / 100,
		pity: v[4] ? undefined : false,
	};
	const clean = Loot.sanitizeEntry(entry);
	if (!clean) {
		return player.sendMessage(
			`§c[Spawner Loot] §fInvalid drop. Check: real item id, min ≥ 0, max ≥ min (≤ ${Loot.LOOT_LIMITS.maxAmount}), chance 0.01–100%.`
		);
	}

	if (isEdit) table[index] = clean; else table.push(clean);
	if (!Loot.setMobTable(mob, table)) return player.sendMessage("§c[Spawner Loot] §fCould not save that change.");
	player.sendMessage(`§6[Spawner Loot] §a${isEdit ? "Updated" : "Added"} §e${formatItemName(clean.item)} §a(${clean.min}–${clean.max}, ${pct(clean.chance)}) §7on ${formatMobName(mob)}.`);
}

async function promptPity(player) {
	const c = Loot.PITY_CONFIG;
	const res = await forceShow(player, new ModalFormData()
		.title("§6Pity Settings")
		.toggle("Pity enabled (misses raise the next chance; rare drops get guaranteed)", { defaultValue: c.ENABLED })
		.textField("Boost per miss (0 – 1). Default 0.02", "0.02", { defaultValue: String(c.MULTIPLIER) })
		.textField("Guarantee factor (1 – 50). Guaranteed after factor ÷ chance misses. Default 5", "5", { defaultValue: String(c.GUARANTEE_FACTOR) }));
	if (res.canceled) return;

	const [enabled, mult, factor] = res.formValues;
	const ok = Loot.setPityConfig({
		ENABLED: !!enabled,
		MULTIPLIER: parseFloat(String(mult).replace(",", ".")),
		GUARANTEE_FACTOR: parseFloat(String(factor).replace(",", ".")),
	});
	player.sendMessage(ok
		? "§6[Spawner Loot] §aPity settings saved."
		: "§c[Spawner Loot] §fInvalid pity values (boost 0–1, factor 1–50).");
}

async function confirm(player, title, text) {
	const res = await forceShow(player, new ModalFormData().title(title).toggle(text, { defaultValue: false }));
	return !res.canceled && !!res.formValues?.[0];
}

export default { showLootMobs };
