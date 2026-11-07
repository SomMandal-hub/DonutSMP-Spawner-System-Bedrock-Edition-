/**
 * spawner_admin.js
 *
 * Admin distribution command: /sm:admin-style chat command
 *   !givespawner <player> [count]
 *
 * IMPORTANT LIMITATION (read this before wiring it in):
 * There is no supported script API to set a real vanilla spawner's mob
 * type from scratch for a real player (only GameTest's SimulatedPlayer
 * has useItemOnBlock/interactWithBlock, which doesn't apply to live
 * players on a real world). So this command can only give a BLANK,
 * unconfigured minecraft:mob_spawner item. The receiving player places
 * it, then uses a spawn egg on it (100% vanilla, zero script needed) to
 * configure the mob type — spawner_vanilla.js's registerConfigureHandler
 * picks that up automatically and starts tracking it.
 *
 * If you want admins to be able to hand out a specific, pre-configured
 * mob type instantly, the real fix is pre-built .mcstructure files (one
 * per mob type, made in-game: place a spawner, use a spawn egg on it,
 * save it as a structure) loaded via world.structureManager.place() —
 * that's real prep work in a real Minecraft instance, not something
 * this delivery can do for you. Flagging it here so it's not forgotten.
 */

import { world, system, ItemStack } from "@minecraft/server";
import { SPAWNER_ITEM_ID, buildSpawnerItemStack, formatMobName } from "./spawner_vanilla.js";

function findPlayerByName(name, sender) {
	if (name === "@s" || name === "@p") return sender;
	for (const p of world.getPlayers()) {
		if (p.name.toLowerCase() === name.toLowerCase()) return p;
	}
	return null;
}

export function registerChatCommand() {
	world.beforeEvents.chatSend.subscribe((event) => {
		const { sender, message } = event;
		if (!message.startsWith("!givespawner")) return;

		event.cancel = true;

		system.run(() => {
			if (!sender.isOp && !sender.hasTag("admin")) {
				sender.sendMessage("§c[Spawners] ❌ You don't have permission. (Admin or OP required)");
				return;
			}

			const parts = message.trim().split(/\s+/);
			const [, targetName, countRaw, mobRaw] = parts;

			if (!targetName) {
				sender.sendMessage("§c[Spawners] Usage: !givespawner <player|@s> [count] [mob]");
				return;
			}

			const target = findPlayerByName(targetName, sender);
			if (!target) {
				sender.sendMessage(`§c[Spawners] Player "${targetName}" not found or offline.`);
				return;
			}

			const count = Math.max(1, Math.min(64, Math.floor(Number(countRaw) || 1)));

			let item;
			if (mobRaw) {
				const mobType = mobRaw.includes(":") ? mobRaw.toLowerCase() : `minecraft:${mobRaw.toLowerCase()}`;
				const itemState = { mobType, count: 1, buffer: {} };
				item = buildSpawnerItemStack(itemState, count);
			} else {
				item = new ItemStack(SPAWNER_ITEM_ID, count);
				item.nameTag = "§r§7Blank Spawner";
				item.setLore([
					"§r§8Place, then right-click with a",
					"§r§8spawn egg to configure its mob type.",
				]);
			}

			const container = target.getComponent("minecraft:inventory")?.container;
			if (container) container.addItem(item);
			else target.dimension.spawnItem(item, target.location);

			const label = mobRaw ? `${formatMobName(mobRaw)} Spawner` : "blank spawner";
			sender.sendMessage(`§a[Spawners] ✔ Gave ${target.name} ${count}x ${label}.`);
			target.sendMessage(`§a[Spawners] ✔ You received ${count}x ${label}.`);
		});
	});
}

export default { registerChatCommand };
