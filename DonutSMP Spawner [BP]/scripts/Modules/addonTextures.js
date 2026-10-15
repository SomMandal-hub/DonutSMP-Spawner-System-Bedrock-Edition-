/**
 * addonTextures.js (Curated for DonutSMP Spawner System)
 * Contains only the textures bundled in the standalone Resource Pack.
 * Unlisted items automatically fall back to Minecraft's native engine numeric IDs.
 */
export const addonTextures = new Set([
    'textures/items/arrow',
    'textures/items/barrier',
    'textures/items/beef',
    'textures/items/cooked_beef',
    'textures/items/cooked_porkchop',
    'textures/items/cooked_mutton',
    'textures/items/cooked_chicken',
    'textures/items/cooked_cod',
    'textures/items/backed_potato',
    'textures/items/bogged_spawn_egg',
    'textures/items/parched_spawn_egg',
    'textures/items/blaze_rod',
    'textures/items/blaze_spawn_egg',
    'textures/items/breeze_rod',
    'textures/items/breeze_spawn_egg',
    'textures/items/bone',
    'textures/items/bow',
    'textures/items/carrot',
    'textures/items/cave_spider_spawn_egg',
    'textures/items/chest',
    'textures/items/experience_bottle',
    'textures/items/evoker_spawn_egg',
    'textures/items/totem_of_undying',
    'textures/items/ghast_spawn_egg',
    'textures/items/ghast_tear',
    'textures/items/chicken',
    'textures/items/chicken_spawn_egg',
    'textures/items/coal',
    'textures/items/cod',
    'textures/items/copper_ingot',
    'textures/items/cow_spawn_egg',
    'textures/items/creeper_spawn_egg',
    'textures/items/diamond_pickaxe',
    'textures/items/drowned_spawn_egg',
    'textures/items/egg',
    'textures/items/elder_guardian_spawn_egg',
    'textures/items/emerald',
    'textures/items/ender_pearl',
    'textures/items/enderman_spawn_egg',
    'textures/items/feather',
    'textures/items/glowstone_dust',
    'textures/items/gold_ingot',
    'textures/items/gold_nugget',
    'textures/items/guardian_spawn_egg',
    'textures/items/gunpowder',
    'textures/items/hoglin_spawn_egg',
    'textures/items/husk_spawn_egg',
    'textures/items/iron_golem_spawn_egg',
    'textures/items/iron_ingot',
    'textures/items/iron_pickaxe',
    'textures/items/leather',
    'textures/items/magma_cream',
    'textures/items/magma_cube_spawn_egg',
    'textures/items/mutton',
    'textures/items/nautilus_shell',
    'textures/items/phantom_membrane',
    'textures/items/phantom_spawn_egg',
    'textures/items/pig_spawn_egg',
    'textures/items/piglin_brute_spawn_egg',
    'textures/items/piglin_spawn_egg',
    'textures/items/poppy',
    'textures/items/porkchop',
    'textures/items/potato',
    'textures/items/prismarine_crystals',
    'textures/items/prismarine_shard',
    'textures/items/raw_beef',
    'textures/items/raw_fish',
    'textures/items/redstone',
    'textures/items/rotten_flesh',
    'textures/items/saddle',
    'textures/items/sheep_spawn_egg',
    'textures/items/shulker_shell',
    'textures/items/shulker_spawn_egg',
    'textures/items/silverfish_spawn_egg',
    'textures/items/skeleton_spawn_egg',
    'textures/items/slime_ball',
    'textures/items/slime_spawn_egg',
    'textures/items/slimeball',
    'textures/items/spawner',
    'textures/items/spider_eye',
    'textures/items/spider_spawn_egg',
    'textures/items/stray_spawn_egg',
    'textures/items/string',
    'textures/items/sugar',
    'textures/items/tipped_arrow',
    'textures/items/trident',
    'textures/items/wet_sponge',
    'textures/items/white_wool',
    'textures/items/witch_spawn_egg',
    'textures/items/wither_skeleton_skull',
    'textures/items/wither_skeleton_spawn_egg',
    'textures/items/zombie_spawn_egg',
    'textures/items/zombified_piglin_spawn_egg',
]);

export const addonTextureById = new Map(
    [...addonTextures].map(path => {
        const id = 'minecraft:' + path
            .replace('textures/items/', '')
            .replace('textures/blocks/', '');
        return [id, path];
    })
);

// Explicit aliases for Minecraft identifiers to ensure 100% match
addonTextureById.set('minecraft:mob_spawner', 'textures/items/spawner');
addonTextureById.set('minecraft:spawner', 'textures/items/spawner');
addonTextureById.set('minecraft:slime_ball', 'textures/items/slime_ball');
addonTextureById.set('minecraft:slimeball', 'textures/items/slimeball');
addonTextureById.set('minecraft:beef', 'textures/items/beef');
addonTextureById.set('minecraft:raw_beef', 'textures/items/raw_beef');
addonTextureById.set('minecraft:fish', 'textures/items/raw_fish');
addonTextureById.set('minecraft:raw_fish', 'textures/items/raw_fish');
addonTextureById.set('minecraft:cod', 'textures/items/cod');

export const vanillaTextures = new Map();
