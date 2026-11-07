/**
 * spawner_config.js
 *
 * LIVE, ADMIN-EDITABLE settings. Edit them in-game with /spawner:config
 * (Spawner Settings panel) — no need to open this file. Changes are saved
 * in the world and survive restarts. The values below are only the DEFAULTS.
 *
 * Other files read these through the LOOT_SYSTEM / RUNTIME objects at the
 * moment they need them, so a change takes effect immediately.
 */

import { world } from "@minecraft/server";

const DP_KEY = "vspawn:config";

// ── Defaults (what "Reset" restores) ────────────────────────────────
export const DEFAULTS = {
	// "legacy": every spawner rolls off its OWN count only.
	// "new":    an owner's spawners are judged by their TOTAL count across
	//           every block they own, so splitting a stack gives no extra loot
	//           (except the scatter bonus below).
	lootSystem: "new",
	// Owners at or below this total always use the legacy system.
	newbieProtectionThreshold: 10,
	// New system only: bonus multiplier for owners whose spawners are split
	// across several blocks (1.2 = +20%).
	scatterBonus: 1.2,
	// Track natural dungeon spawners too (false = left 100% vanilla).
	allowWildSpawners: false,
	// Spawners drop cooked food instead of raw.
	cookedDrops: true,
	// Breaking / un-stacking wipes uncollected loot in the spawner.
	purgeBufferOnBreak: true,
	// Sneak+break removes up to this many spawners at once (1-64).
	maxUnstackPerBreak: 64,
	// Advanced: save a structure into the world for a custom mob that has no
	// packaged .mcstructure file.
	captureStructures: false,
	// Verbose console logging.
	debug: false,
};

// type + limits, used to validate anything an admin types in.
export const SPECS = {
	lootSystem:                { type: "enum",  options: ["legacy", "new"] },
	newbieProtectionThreshold: { type: "int",   min: 0,   max: 100000 },
	scatterBonus:              { type: "float", min: 1,   max: 5 },
	allowWildSpawners:         { type: "bool" },
	cookedDrops:               { type: "bool" },
	purgeBufferOnBreak:        { type: "bool" },
	maxUnstackPerBreak:        { type: "int",   min: 1,   max: 64 },
	captureStructures:         { type: "bool" },
	debug:                     { type: "bool" },
};

// ── Live objects the rest of the addon reads ────────────────────────
export const LOOT_SYSTEM = {
	active: DEFAULTS.lootSystem,
	newbieProtectionThreshold: DEFAULTS.newbieProtectionThreshold,
};

export const RUNTIME = {
	scatterBonus: DEFAULTS.scatterBonus,
	allowWild: DEFAULTS.allowWildSpawners,
	cookedDrops: DEFAULTS.cookedDrops,
	purgeBufferOnBreak: DEFAULTS.purgeBufferOnBreak,
	maxUnstackPerBreak: DEFAULTS.maxUnstackPerBreak,
	captureStructures: DEFAULTS.captureStructures,
	debug: DEFAULTS.debug,
};

const values = { ...DEFAULTS };

function apply() {
	LOOT_SYSTEM.active = values.lootSystem;
	LOOT_SYSTEM.newbieProtectionThreshold = values.newbieProtectionThreshold;
	RUNTIME.scatterBonus = values.scatterBonus;
	RUNTIME.allowWild = values.allowWildSpawners;
	RUNTIME.cookedDrops = values.cookedDrops;
	RUNTIME.purgeBufferOnBreak = values.purgeBufferOnBreak;
	RUNTIME.maxUnstackPerBreak = values.maxUnstackPerBreak;
	RUNTIME.captureStructures = values.captureStructures;
	RUNTIME.debug = values.debug;
}

/** Returns the cleaned value, or undefined if it isn't valid for this key. */
export function coerce(key, raw) {
	const spec = SPECS[key];
	if (!spec) return undefined;
	switch (spec.type) {
		case "bool":
			return typeof raw === "boolean" ? raw : undefined;
		case "enum":
			return spec.options.includes(raw) ? raw : undefined;
		case "int":
		case "float": {
			const n = spec.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
			if (!Number.isFinite(n) || n < spec.min || n > spec.max) return undefined;
			return n;
		}
	}
	return undefined;
}

function save() {
	try {
		world.setDynamicProperty(DP_KEY, JSON.stringify(values));
	} catch (e) {
		console.warn("[VirtualSpawners] saving config failed:", e);
	}
}

/** Call once at startup (after the world is ready). */
export function loadSettings() {
	try {
		const raw = world.getDynamicProperty(DP_KEY);
		if (typeof raw === "string") {
			const saved = JSON.parse(raw);
			for (const key of Object.keys(DEFAULTS)) {
				const v = coerce(key, saved?.[key]);
				if (v !== undefined) values[key] = v;
			}
		}
	} catch (e) {
		console.warn("[VirtualSpawners] loading config failed, using defaults:", e);
	}
	apply();
}

export function getSetting(key) {
	return values[key];
}

/** Validates, applies and saves. Returns true if the value was accepted. */
export function setSetting(key, raw) {
	const v = coerce(key, raw);
	if (v === undefined) return false;
	values[key] = v;
	apply();
	save();
	return true;
}

export function resetSetting(key) {
	if (!(key in DEFAULTS)) return;
	values[key] = DEFAULTS[key];
	apply();
	save();
}

export function resetAllSettings() {
	Object.assign(values, DEFAULTS);
	apply();
	save();
}

export default { DEFAULTS, SPECS, LOOT_SYSTEM, RUNTIME, loadSettings, getSetting, setSetting, resetSetting, resetAllSettings };
