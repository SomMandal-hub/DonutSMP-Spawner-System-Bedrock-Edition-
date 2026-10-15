/**
 * DonutSMP Spawner System
 * Entry point for standalone Behavior Pack.
 */
import { system } from "@minecraft/server";
import { initSpawnerSystem } from "./Spawnersys/spawner_init.js";

// Initialize DonutSMP Spawner System after world is ready to prevent early execution errors
system.run(() => {
    initSpawnerSystem();
    console.log("§a✔ [DonutSMP Spawners] System successfully initialized!");
});
