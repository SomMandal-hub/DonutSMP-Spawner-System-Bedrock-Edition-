/**
 * spawner_init.js
 *
 * Wires the spawner system together. Imported from index.js.
 *
 * Production is driven by real vanilla spawn events (spawner_vanilla.js), so
 * there is no production loop here. This file loads the saved admin settings,
 * rebuilds the location index after a world reload, registers the event
 * handlers, and plugs the Spawner panel into the shared Config Hub.
 */

import { system } from "@minecraft/server";
import * as SpawnerState from "./spawner_state.js";
import * as SpawnerVanilla from "./spawner_vanilla.js";
import { loadSettings } from "./spawner_config.js";
import { registerChatCommand } from "./spawner_admin.js";
import { initHub } from "./config_hub.js";
import { showSpawnerSettings } from "./spawner_settings_ui.js";
import { showLootMobs } from "./spawner_loot_ui.js";
import { loadLootOverrides } from "./spawner_loot.js";

export const HUB_NS = "spawner";

/** Hub identity + panels. Also used by index.js to register /spawner:config. */
export function setupHub() {
	initHub({
		ns: HUB_NS,
		addon: "Spawner System",
		panels: [
			{
				id: "main",
				label: "Spawner Settings",
				icon: "minecraft:mob_spawner",
				desc: ["§7Loot system, stacking, drops,", "§7give spawners and more"],
				open: (player) => showSpawnerSettings(player),
			},
			{
				id: "loot",
				label: "Spawner Loot",
				icon: "minecraft:diamond",
				desc: ["§7Edit each spawner's drops,", "§7amounts and drop rates"],
				open: (player) => showLootMobs(player),
			},
		],
	});
}

export function initSpawnerSystem() {
	loadSettings(); // admin-edited values saved in the world
	loadLootOverrides(); // admin-edited loot tables saved in the world
	SpawnerVanilla.register();
	registerChatCommand();
	setupHub();

	system.run(() => {
		SpawnerState.rebuildIndex();
		// Same pass, no extra world scan: sums every tracked block's count by
		// its owner field so per-owner totals are right after a restart.
		SpawnerState.rebuildOwnerTotals();
	});
}

export const register = initSpawnerSystem;
export default { initSpawnerSystem, register };
