/**
 * spawner_init.js
 *
 * Wires the vanilla-spawner system together. This is the only file you
 * import from index.js.
 *
 * Unlike the old custom-block design, there is NO separate production
 * loop to start (no system.runInterval) — production is driven entirely
 * by real vanilla spawn events, intercepted in spawner_vanilla.js. All
 * this file does is rebuild the location index (so mining/GUI/stacking
 * work correctly after a world reload) and register the event handlers.
 */

import { system } from "@minecraft/server";
import * as SpawnerState from "./spawner_state.js";
import * as SpawnerVanilla from "./spawner_vanilla.js";
import { registerChatCommand } from "./spawner_admin.js";

export function initSpawnerSystem() {
	SpawnerVanilla.register();
	registerChatCommand();

	system.run(() => {
		SpawnerState.rebuildIndex();
		// Same pass, no extra world scan: sums every tracked block's count by
		// its owner field so the new loot system's per-owner totals are correct
		// again immediately after a restart, instead of starting from zero.
		SpawnerState.rebuildOwnerTotals();
	});
}

export const register = initSpawnerSystem;
export default { initSpawnerSystem, register };
