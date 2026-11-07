/**
 * DonutSMP Spawner System
 * Entry point for standalone Behavior Pack.
 */
import { system } from "@minecraft/server";
import { initSpawnerSystem, setupHub } from "./Spawnersys/spawner_init.js";
import { registerSlashCommands } from "./Spawnersys/spawner_admin.js";
import { registerConfigCommand } from "./Spawnersys/config_hub.js";

// Custom slash commands MUST be registered in the startup event
// (/spawner:givespawner and /spawner:config).
system.beforeEvents.startup.subscribe((event) => {
	setupHub(); // tells the hub our namespace + panels before its command registers
	registerSlashCommands(event);
	registerConfigCommand(event);
});

// Initialize everything else after the world is ready to prevent early execution errors
system.run(() => {
	initSpawnerSystem();
	console.log("§a✔ [DonutSMP Spawners] System successfully initialized!");
});
