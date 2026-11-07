/**
 * spawner_perms.js — one place that decides who counts as a spawner admin.
 * Admin = has the "admin" tag, OR has operator-level command permission.
 * (The old `player.isOp` check never worked: that property doesn't exist in
 * the script API, so only the tag was ever honored.)
 */
import { CommandPermissionLevel } from "@minecraft/server";

export function isAdmin(player) {
	if (!player) return false;
	try {
		if (player.hasTag("admin")) return true;
		return (player.commandPermissionLevel ?? CommandPermissionLevel.Any) >= CommandPermissionLevel.GameDirectors;
	} catch {
		return false;
	}
}

export function requireAdmin(player) {
	if (isAdmin(player)) return true;
	try { player.sendMessage("§c[Spawners] ❌ You don't have permission. (Admin tag or OP required)"); } catch {}
	return false;
}
