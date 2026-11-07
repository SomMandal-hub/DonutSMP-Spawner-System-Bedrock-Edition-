/**
 * spawner_admin.js
 *
 * Admin distribution commands:
 *   /spawner:givespawner <player> <mob> [amount]     (slash command)
 *   !givespawner <player> [count] [mob]               (old chat command, kept)
 *
 * Spawners are handed out pre-configured: the item carries its mob type and
 * placing it stamps the packaged structures/mystructure/spawner_<mob>.mcstructure,
 * so no admin egg setup is needed.
 */

import { world, system, ItemStack, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { SPAWNER_ITEM_ID, buildSpawnerItemStack, formatMobName } from "./spawner_vanilla.js";
import { getSupportedMobTypes } from "./spawner_loot.js";
import { isAdmin } from "./spawner_perms.js";

export const MAX_GIVE_TOTAL = 2304; // 36 stacks of 64

function findPlayerByName(name, sender) {
	if (name === "@s" || name === "@p") return sender;
	for (const p of world.getPlayers()) {
		if (p.name.toLowerCase() === name.toLowerCase()) return p;
	}
	return null;
}

/** "cow" / "minecraft:cow" -> "minecraft:cow" */
export function toMobType(raw) {
	const s = String(raw).toLowerCase().trim();
	return s.includes(":") ? s : `minecraft:${s}`;
}

/**
 * Gives `amount` spawners of one mob (split into stacks of 64) to a player.
 * Anything that doesn't fit in the inventory is dropped at their feet.
 * Must be called from normal (non-restricted) execution, e.g. inside system.run.
 */
export function giveSpawner(target, mobType, amount) {
	let left = Math.max(1, Math.min(MAX_GIVE_TOTAL, Math.floor(Number(amount) || 1)));
	const container = target.getComponent("minecraft:inventory")?.container;
	while (left > 0) {
		const n = Math.min(64, left);
		left -= n;
		const item = buildSpawnerItemStack({ mobType, count: 1, buffer: {} }, n);
		const rest = container?.addItem(item);
		if (!container) target.dimension.spawnItem(item, target.location);
		else if (rest) target.dimension.spawnItem(rest, target.location);
	}
}

function giveBlank(target, count) {
	const item = new ItemStack(SPAWNER_ITEM_ID, count);
	item.nameTag = "§r§7Blank Spawner";
	item.setLore(["§r§8Place, then right-click with a", "§r§8spawn egg to configure its mob type."]);
	const container = target.getComponent("minecraft:inventory")?.container;
	if (container) {
		const rest = container.addItem(item);
		if (rest) target.dimension.spawnItem(rest, target.location);
	} else target.dimension.spawnItem(item, target.location);
}

// ── Slash commands (registered from index.js at startup) ─────────────

const MOB_ENUM = "spawner:mobtype";

export function registerSlashCommands(event) {
	const reg = event.customCommandRegistry;
	const mobs = getSupportedMobTypes().map((m) => m.replace("minecraft:", ""));

	try {
		reg.registerEnum(MOB_ENUM, mobs);
	} catch (e) {
		if (!String(e?.message ?? e).includes("reload")) console.warn("[Spawners] registerEnum failed:", e);
	}

	try {
		reg.registerCommand(
			{
				name: "spawner:givespawner",
				description: "Give pre-configured spawners  |  /spawner:givespawner <player> <mob> [amount]",
				permissionLevel: CommandPermissionLevel.Any, // admin tag / op checked below
				cheatsRequired: false,
				mandatoryParameters: [
					{ name: "player", type: CustomCommandParamType.PlayerSelector },
					{ name: "mob", type: CustomCommandParamType.Enum, enumName: MOB_ENUM },
				],
				optionalParameters: [{ name: "amount", type: CustomCommandParamType.Integer }],
			},
			(origin, targets, mob, amount) => {
				const sender = origin.initiator ?? origin.sourceEntity;
				if (sender?.typeId === "minecraft:player" && !isAdmin(sender)) {
					return { status: CustomCommandStatus.Failure, message: "§cYou don't have permission. (Admin tag or OP required)" };
				}
				const players = Array.isArray(targets) ? targets : targets ? [targets] : [];
				if (players.length === 0) {
					return { status: CustomCommandStatus.Failure, message: "§cNo matching player found." };
				}
				const mobKey = String(mob ?? "").toLowerCase();
				if (!mobs.includes(mobKey)) {
					return { status: CustomCommandStatus.Failure, message: `§cUnknown spawner type "${mobKey}".` };
				}
				const n = Math.max(1, Math.min(MAX_GIVE_TOTAL, Math.floor(Number(amount ?? 1)) || 1));
				const mobType = `minecraft:${mobKey}`;
				const label = `${n}x ${formatMobName(mobType)} Spawner`;

				system.run(() => {
					for (const p of players) {
						try {
							giveSpawner(p, mobType, n);
							p.sendMessage(`§a[Spawners] ✔ You received ${label}.`);
						} catch (e) {
							console.warn("[Spawners] givespawner failed:", e);
						}
					}
				});
				return {
					status: CustomCommandStatus.Success,
					message: `§aGave ${label} to ${players.map((p) => p.name).join(", ")}.`,
				};
			}
		);
	} catch (e) {
		if (!String(e?.message ?? e).includes("reload")) console.warn("[Spawners] registerCommand failed:", e);
	}
}

// ── Old chat command (kept for backwards compatibility) ──────────────

export function registerChatCommand() {
	world.beforeEvents.chatSend.subscribe((event) => {
		const { sender, message } = event;
		if (!message.startsWith("!givespawner")) return;

		event.cancel = true;

		system.run(() => {
			if (!isAdmin(sender)) {
				sender.sendMessage("§c[Spawners] ❌ You don't have permission. (Admin tag or OP required)");
				return;
			}

			const parts = message.trim().split(/\s+/);
			const [, targetName, countRaw, mobRaw] = parts;

			if (!targetName) {
				sender.sendMessage("§c[Spawners] Usage: !givespawner <player|@s> [count] [mob]  — or use /spawner:givespawner");
				return;
			}

			const target = findPlayerByName(targetName, sender);
			if (!target) {
				sender.sendMessage(`§c[Spawners] Player "${targetName}" not found or offline.`);
				return;
			}

			const count = Math.max(1, Math.min(64, Math.floor(Number(countRaw) || 1)));

			if (mobRaw) giveSpawner(target, toMobType(mobRaw), count);
			else giveBlank(target, count);

			const label = mobRaw ? `${formatMobName(mobRaw)} Spawner` : "blank spawner";
			sender.sendMessage(`§a[Spawners] ✔ Gave ${target.name} ${count}x ${label}.`);
			target.sendMessage(`§a[Spawners] ✔ You received ${count}x ${label}.`);
		});
	});
}

export default { registerChatCommand, registerSlashCommands, giveSpawner, toMobType };
