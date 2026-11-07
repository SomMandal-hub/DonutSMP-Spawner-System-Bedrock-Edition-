/**
 * spawner_settings_ui.js — the "Spawner Settings" panel (admin only).
 * Edits the live, saved settings from spawner_config.js, so nobody has to open
 * the .js file. Also has a Give Spawner tool and a tracked-spawner counter.
 */

import { world, system } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import ChestFormData from "../Modules/forms.js";
import { DEFAULTS, SPECS, getSetting, setSetting, resetAllSettings } from "./spawner_config.js";
import { getActiveLocations } from "./spawner_state.js";
import { getSupportedMobTypes } from "./spawner_loot.js";
import { formatMobName } from "./spawner_vanilla.js";
import { giveSpawner, MAX_GIVE_TOTAL } from "./spawner_admin.js";
import { isAdmin } from "./spawner_perms.js";
import { openHub, forceShow } from "./config_hub.js";
import { showLootMobs } from "./spawner_loot_ui.js";

const TEX = {
	ON:     "minecraft:lime_stained_glass_pane",
	OFF:    "minecraft:red_stained_glass_pane",
	BORDER: "minecraft:gray_stained_glass_pane",
	BOOK:   "minecraft:writable_book",
	LOOT:   "minecraft:comparator",
	RESET:  "minecraft:lava_bucket",
	CLOSE:  "minecraft:barrier",
	BACK:   "minecraft:arrow",
	INFO:   "minecraft:paper",
	GIVE:   "minecraft:chest",
	SPAWN:  "minecraft:mob_spawner",
};

// slot -> setting. type "cycle" flips between enum options.
const ITEMS = [
	{ key: "lootSystem",                slot: 10, type: "cycle",  label: "Loot System",
	  desc: ["§7legacy: each block rolls on its own count", "§7new: judged by owner's TOTAL spawners"] },
	{ key: "newbieProtectionThreshold", slot: 11, type: "number", label: "Newbie Protection",
	  desc: ["§7Owners with this many spawners or fewer", "§7always use the legacy loot system"] },
	{ key: "scatterBonus",              slot: 12, type: "number", label: "Scatter Bonus",
	  desc: ["§7New system: multiplier for spawners split", "§7over several blocks (1.2 = +20%)"] },
	{ key: "allowWildSpawners",         slot: 13, type: "toggle", label: "Wild Spawners",
	  desc: ["§7Track natural dungeon spawners too"] },
	{ key: "cookedDrops",               slot: 14, type: "toggle", label: "Cooked Drops",
	  desc: ["§7Food drops come out cooked"] },
	{ key: "purgeBufferOnBreak",        slot: 15, type: "toggle", label: "Purge Loot On Break",
	  desc: ["§7Breaking / un-stacking wipes stored loot"] },
	{ key: "maxUnstackPerBreak",        slot: 16, type: "number", label: "Max Un-stack / Break",
	  desc: ["§7Sneak + break removes up to this many"] },
	{ key: "captureStructures",         slot: 20, type: "toggle", label: "Capture Structures",
	  desc: ["§7Advanced: save a structure for a custom", "§7mob with no packaged file"] },
	{ key: "debug",                     slot: 21, type: "toggle", label: "Debug Logging",
	  desc: ["§7Verbose console output"] },
];

const SLOT_BACK = 18, SLOT_RESET = 26, SLOT_LOOT = 22, SLOT_GIVE = 23, SLOT_INFO = 24;

export async function showSpawnerSettings(player) {
	if (!isAdmin(player)) return player.sendMessage("§c[Config] ❌ Admin only.");

	const form = new ChestFormData("27", "§6§lConfig §8> §eSpawners");
	for (let i = 0; i < 27; i++) form.button(i, "§8", null, TEX.BORDER);

	for (const s of ITEMS) {
		const val = getSetting(s.key);
		const def = DEFAULTS[s.key];
		const defLine = `§8Default: ${def}`;
		if (s.type === "toggle") {
			form.button(s.slot, `${val ? "§a§lON  §r§f" : "§c§lOFF §r§f"}${s.label}`, [...s.desc, defLine], val ? TEX.ON : TEX.OFF);
		} else if (s.type === "cycle") {
			form.button(s.slot, `§e§l${s.label}`, [...s.desc, "", `§7Current: §a${val}`, "§b> Click to switch"], TEX.LOOT);
		} else {
			form.button(s.slot, `§e§l${s.label}`, [...s.desc, "", `§7Current: §a${val}`, defLine, "§b> Click to edit"], TEX.BOOK);
		}
	}

	form.button(SLOT_LOOT, "§d§lLoot Editor", ["§7Edit what each spawner type drops,", "§7amounts, drop rates and pity", "", "§b> Click to open"], "minecraft:diamond");
	form.button(SLOT_GIVE, "§a§lGive Spawner", ["§7Pick a player, mob type and amount", "§7(same as /spawner:givespawner)", "", "§b> Click to open"], TEX.GIVE);
	form.button(SLOT_INFO, "§f§lInfo", [`§7Tracked spawner blocks: §e${getActiveLocations().length}`, `§7Mob types available: §e${getSupportedMobTypes().length}`], TEX.INFO);
	form.button(SLOT_BACK, "§c§lBack", ["§7Return to the hub"], TEX.BACK);
	form.button(SLOT_RESET, "§4§lReset All", ["§7Revert every spawner setting to its default"], TEX.RESET);

	const res = await forceShow(player, form);
	if (res.canceled) return;
	const sel = res.selection;

	if (sel === SLOT_BACK) return openHub(player);
	if (sel === SLOT_RESET) {
		await confirmReset(player);
		return showSpawnerSettings(player);
	}
	if (sel === SLOT_LOOT) return showLootMobs(player);
	if (sel === SLOT_GIVE) {
		await new Promise((r) => system.runTimeout(r, 1));
		await promptGive(player);
		return system.run(() => showSpawnerSettings(player));
	}

	const s = ITEMS.find((x) => x.slot === sel);
	if (!s) return system.run(() => showSpawnerSettings(player)); // border / info click

	if (s.type === "toggle") {
		const v = !getSetting(s.key);
		setSetting(s.key, v);
		player.sendMessage(`§6[Spawners] §f${s.label} → ${v ? "§aON" : "§cOFF"}`);
	} else if (s.type === "cycle") {
		const opts = SPECS[s.key].options;
		const next = opts[(opts.indexOf(getSetting(s.key)) + 1) % opts.length];
		setSetting(s.key, next);
		player.sendMessage(`§6[Spawners] §f${s.label} → §a${next}`);
	} else {
		await new Promise((r) => system.runTimeout(r, 1));
		await promptNumber(player, s);
	}
	system.run(() => showSpawnerSettings(player));
}

async function promptNumber(player, item) {
	const spec = SPECS[item.key];
	const cur = String(getSetting(item.key));
	const res = await forceShow(player, new ModalFormData()
		.title(`§6Edit: ${item.label}`)
		.textField(`Value (${spec.min}–${spec.max}) | Default: ${DEFAULTS[item.key]}`, cur, { defaultValue: cur }));
	if (res.canceled) return;

	const raw = String(res.formValues?.[0] ?? "").trim();
	if (!setSetting(item.key, raw)) {
		return player.sendMessage(`§c[Spawners] §fInvalid value. Must be a number between ${spec.min} and ${spec.max}.`);
	}
	player.sendMessage(`§6[Spawners] §f${item.label} set to §a${getSetting(item.key)}§f.`);
}

async function confirmReset(player) {
	const res = await forceShow(player, new ModalFormData()
		.title("§c§lReset Spawner Settings?")
		.toggle("§7I understand this reverts ALL spawner settings to defaults.", { defaultValue: false }));
	if (res.canceled || !res.formValues?.[0]) return player.sendMessage("§7[Spawners] Reset cancelled.");
	resetAllSettings();
	player.sendMessage("§6[Spawners] §aAll spawner settings reset to defaults.");
}

async function promptGive(player) {
	const names = world.getPlayers().map((p) => p.name);
	const mobs = getSupportedMobTypes();
	const mobLabels = mobs.map((m) => formatMobName(m));
	const res = await forceShow(player, new ModalFormData()
		.title("§a§lGive Spawner")
		.dropdown("Player", names, { defaultValueIndex: Math.max(0, names.indexOf(player.name)) })
		.dropdown("Spawner type", mobLabels, { defaultValueIndex: 0 })
		.textField(`Amount (1–${MAX_GIVE_TOTAL})`, "1", { defaultValue: "1" }));
	if (res.canceled) return;

	const [pi, mi, amountRaw] = res.formValues;
	const target = world.getPlayers().find((p) => p.name === names[pi]);
	const mobType = mobs[mi];
	const amount = parseInt(String(amountRaw), 10);
	if (!target) return player.sendMessage("§c[Spawners] That player is no longer online.");
	if (!Number.isFinite(amount) || amount < 1 || amount > MAX_GIVE_TOTAL) {
		return player.sendMessage(`§c[Spawners] Amount must be 1–${MAX_GIVE_TOTAL}.`);
	}
	giveSpawner(target, mobType, amount);
	const label = `${amount}x ${formatMobName(mobType)} Spawner`;
	player.sendMessage(`§a[Spawners] ✔ Gave ${label} to ${target.name}.`);
	if (target.id !== player.id) target.sendMessage(`§a[Spawners] ✔ You received ${label}.`);
}

export default { showSpawnerSettings };
