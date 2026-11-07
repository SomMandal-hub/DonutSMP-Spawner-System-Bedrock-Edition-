/**
 * config_hub.js — Config Hub for the Spawner addon (spawner:config).
 *
 * Speaks the SAME script-event protocol as the Auction / Shop & Sell / Order
 * hubs, so the addons find each other automatically:
 *     hub:ping  { from, player }              "who is installed?"
 *     hub:pong  { to, ns, addon, panels }     every other addon answers
 *     hub:open  { ns, id, player }            "open your panel <id> for <player>"
 *
 *  • /spawner:config           opens this hub (Spawner panels + every other
 *                              installed addon's panels).
 *  • /ah:config, /ss:config, /od:config now also list "Spawner Settings".
 *
 * The Economy Settings tile is NOT shown here: the economy/wallet code lives
 * in those other addons, so it only appears in their own hubs.
 */

import { world, system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";
import ChestFormData from "../Modules/forms.js";
import { isAdmin } from "./spawner_perms.js";

const TEX = {
	BORDER: "minecraft:gray_stained_glass_pane",
	BOOK:   "minecraft:writable_book",
	CLOSE:  "minecraft:barrier",
	INFO:   "minecraft:paper",
};

let CFG = { ns: "", addon: "", panels: [] };
const collectors = new Map(); // playerName -> { panels: Map, addons: Set }
const DISCOVERY_TICKS = 5;

let listening = false;

/** Safe to call more than once (startup event AND after world load). */
export function initHub({ ns, addon, panels = [] }) {
	CFG = { ns, addon, panels };
	// afterEvents are not available during early execution -> subscribe next tick, once.
	system.run(() => {
		if (listening) return;
		try {
			system.afterEvents.scriptEventReceive.subscribe(_onScriptEvent, { namespaces: ["hub"] });
			listening = true;
		} catch (e) {
			console.warn(`[ConfigHub] Could not listen for script events: ${e?.message ?? e}`);
		}
	});
}

function _send(id, payload) {
	const msg = JSON.stringify(payload);
	try {
		if (typeof system.sendScriptEvent === "function") return system.sendScriptEvent(id, msg);
	} catch {}
	try { world.getDimension("overworld").runCommand(`scriptevent ${id} ${msg}`); }
	catch (e) { console.warn(`[ConfigHub] scriptevent failed: ${e?.message ?? e}`); }
}

function _onScriptEvent(ev) {
	let data;
	try { data = JSON.parse(ev.message); } catch { return; }
	if (!data) return;

	if (ev.id === "hub:ping") {
		if (data.from === CFG.ns) return;
		_send("hub:pong", {
			to: data.player, ns: CFG.ns, addon: CFG.addon,
			panels: CFG.panels.map((p) => ({ id: p.id, label: p.label, icon: p.icon, desc: p.desc ?? [] })),
		});
		return;
	}

	if (ev.id === "hub:pong") {
		const found = collectors.get(data.to);
		if (!found || data.ns === CFG.ns) return;
		found.addons.add(data.addon);
		for (const p of data.panels ?? []) {
			found.panels.set(`${data.ns}/${p.id}`, { ...p, ns: data.ns, addon: data.addon });
		}
		return;
	}

	if (ev.id === "hub:open") {
		if (data.ns !== CFG.ns) return;
		const player = world.getPlayers().find((p) => p.name === data.player);
		const panel = CFG.panels.find((p) => p.id === data.id);
		if (!player || !panel) return;
		if (!isAdmin(player)) {
			player.sendMessage("§c[Config] ❌ Admin only.");
			return;
		}
		system.run(() => panel.open(player));
	}
}

// ── /spawner:config [section] ────────────────────────────────────────

export function registerConfigCommand(event) {
	const reg = event.customCommandRegistry;
	const ns = CFG.ns;
	const sections = ["hub", ...CFG.panels.map((p) => p.id)];
	const enumName = `${ns}:config.section`;

	try { reg.registerEnum(enumName, sections); }
	catch (err) { _ignoreReload(err, `enum ${enumName}`); }

	try {
		reg.registerCommand(
			{
				name: `${ns}:config`,
				description: `Open the Config Hub  |  /${ns}:config  [${sections.join("|")}]`,
				permissionLevel: CommandPermissionLevel.Any, // admin checked below
				cheatsRequired: false,
				optionalParameters: [{ name: "section", type: CustomCommandParamType.Enum, enumName }],
			},
			(ctx, ...rawArgs) => {
				const p = ctx.initiator ?? ctx.sourceEntity;
				if (p?.typeId !== "minecraft:player") {
					return { status: CustomCommandStatus.Failure, message: "§cThis command must be run by a player." };
				}
				if (!isAdmin(p)) {
					return { status: CustomCommandStatus.Failure, message: "§cYou don't have permission. (Admin tag or OP required)" };
				}
				const a0 = rawArgs[0];
				const section = String((a0 && typeof a0 === "object") ? (a0.section?.value ?? a0.section ?? "") : (a0 ?? ""))
					.toLowerCase().trim();

				system.run(() => {
					if (!section || section === "hub") return openHub(p);
					const panel = CFG.panels.find((x) => x.id === section);
					if (panel) return panel.open(p);
					p.sendMessage(`§c[Config] §fUnknown section §e${section}§f. §7Valid: §f${sections.join("§7, §f")}`);
				});
				return { status: CustomCommandStatus.Success };
			}
		);
	} catch (err) { _ignoreReload(err, `/${ns}:config`); }
}

function _ignoreReload(err, what) {
	const msg = err?.message ?? String(err);
	if (!msg.includes("reload") && !msg.includes("already"))
		console.warn(`[ConfigHub] Failed ${what}: ${msg}`);
}

// ── Hub screen ───────────────────────────────────────────────────────

/** Ask the other addons what they offer, then draw. */
export function openHub(player) {
	const found = { panels: new Map(), addons: new Set() };
	collectors.set(player.name, found);
	_send("hub:ping", { from: CFG.ns, player: player.name });
	system.runTimeout(() => {
		collectors.delete(player.name);
		showHub(player, [...found.panels.values()], [...found.addons]);
	}, DISCOVERY_TICKS);
}

async function showHub(player, remote, remoteAddons = []) {
	const entries = [
		...CFG.panels.map((p) => ({ kind: "local", panel: p })),
		...remote.sort((a, b) => (a.ns + a.id).localeCompare(b.ns + b.id)).map((p) => ({ kind: "remote", panel: p })),
	];

	const big = entries.length > 7;
	const size = big ? "54" : "27";
	const close = big ? 53 : 26;
	const slots = big
		? [10,11,12,13,14,15,16, 19,20,21,22,23,24,25, 28,29,30,31,32,33,34, 37,38,39,40,41,42,43]
		: [10,11,12,13,14,15,16];

	const form = new ChestFormData(size, "§6§lServer Config §8— Hub");
	for (let i = 0; i < Number(size); i++) form.button(i, "§8", null, TEX.BORDER);

	const slotMap = new Map();
	entries.slice(0, slots.length).forEach((e, i) => {
		const slot = slots[i];
		slotMap.set(slot, e);
		const p = e.panel;
		const lore = [...(p.desc ?? [])];
		if (e.kind === "remote") lore.push("", `§8From: ${p.addon}`);
		lore.push("", "§b> Click to open");
		form.button(slot, `§b§l${p.label}`, lore, p.icon ?? TEX.BOOK);
	});

	const addons = [CFG.addon, ...remoteAddons];
	form.button(big ? 49 : 22, "§f§lInstalled Addons", addons.map((a) => `§7- §f${a}`), TEX.INFO);
	form.button(close, "§c§lClose", ["§7Exit configuration"], TEX.CLOSE);

	const res = await forceShow(player, form);
	if (res.canceled) return;

	const sel = res.selection;
	if (sel === close) return;

	const e = slotMap.get(sel);
	if (!e) return system.run(() => showHub(player, remote, remoteAddons)); // border click

	if (e.kind === "local") return e.panel.open(player);
	_send("hub:open", { ns: e.panel.ns, id: e.panel.id, player: player.name });
}

/** Retry while chat is still open (Bedrock cancels forms with UserBusy). */
export async function forceShow(player, form, timeout = 600) {
	const start = system.currentTick;
	while (system.currentTick - start < timeout) {
		const res = await form.show(player);
		if (res.cancelationReason !== FormCancelationReason.UserBusy) return res;
	}
	return { canceled: true };
}
