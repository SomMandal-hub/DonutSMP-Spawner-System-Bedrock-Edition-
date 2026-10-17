
⚠️ Notice: This project is proprietary and protected by copyright. See the LICENSE file for usage terms. Unauthorized redistribution is strictly prohibited.


# 🌀 DonutSMP Spawner System — Complete Player & Admin Guide

A complete guide for players and server administrators on how to set up, operate, and manage the Virtual Stacked Spawner System.

---

## ⚠️ Section 1: Administrator Setup (CRITICAL — READ FIRST)

Before players can use any spawner type on the server, **an administrator must configure each mob spawner type once in the world**.

### Why is this required?
Minecraft Bedrock does not allow script addons to generate raw spawner block NBT (the spinning mob inside the cage and native spawn parameters) out of thin air. Instead, this system uses an **automatic in-world structure caching engine**. 

When an Admin configures a spawner with a spawn egg, the system captures that spawner's vanilla data (`mystructure:spawner_<mob>`) and saves it permanently to the world save.

> [!IMPORTANT]
> **Admins MUST configure that spawner type before distributing or using `!givespawner`!**  
> If an admin runs `!givespawner <player> <count> <mob>` for a mob type that has **never** been configured in the world, the spawner will be missing its vanilla spinning mob animation, flame particles, and native spawn data.

### How Admins Configure Spawner Types (One-Time Setup):

1. Give yourself a blank spawner:
   ```
   !givespawner @s 1
   ```
2. Place the spawner down on the ground.
3. Take the **Spawn Egg** for the mob you want to enable (e.g., Cow Spawn Egg, Blaze Spawn Egg, Iron Golem Spawn Egg).
4. **Right-click the spawner with the spawn egg**.
5. You will see a confirmation message in chat:
   ```
   ✔ Spawner configured for <Mob Name>.
   ```
6. The system has now cached this mob spawner type in the world! You can now mine it with Silk Touch, put it into distribution, or hand it out using commands.
7. Repeat this simple 1-minute step once for any mob types you plan to offer on your server.

---

## 🛠️ Section 2: Admin Commands & Permissions

Only players with **Operator (OP)** status or the **`admin`** tag can configure spawners with eggs or use spawner commands.

### Give Spawner Command:
```
!givespawner <player|@s> [count] [mob]
```

#### Examples:
- `!givespawner @s 1`  
  *(Gives 1 blank spawner for admin configuration)*
- `!givespawner Steve 5 cow`  
  *(Gives Steve 5 Cow Spawners — **only works properly if Cow was already configured by an admin!**)*
- `!givespawner @s 16 iron_golem`  
  *(Gives 16 Iron Golem Spawners)*
- `!givespawner @s 64 blaze`  
  *(Gives 64 Blaze Spawners)*

> [!WARNING]
> Regular players **cannot** use spawn eggs on spawners. Attempting to do so will display:
> `⚠ Only an admin can configure or change a spawner's mob type.`

---

## 🎮 Section 3: Player Guide (How to Use Spawners)

### 1. Placing Spawners
- Place your configured spawner anywhere in your base or farm.
- As soon as it is placed, you become the **owner** of that spawner block.
- A single spawner starts at **1x Stack**.
- It will begin producing resources whenever a player is nearby and vanilla spawn conditions (light level, clear space) are met.
- **Zero Mob Lag:** You will not see loose mobs running around lagging your base. Mobs are virtually converted directly into items inside the spawner storage!

---

### 2. Opening Spawner Storage
To collect drops from your spawner:
1. Make sure your main hand is **completely empty** (bare hand).
2. **Right-click** the placed spawner.
3. The **54-Slot Double Chest Collection Menu** will open.

#### Inside the Collection Menu:
- **Loot Grid (Slots 0 – 44):** Shows your stored items in stacks of up to 64.
- **Previous / Next Page (Slots 45 & 53):** Navigate through multiple pages if your spawner has a large variety of drops.
- **Spawner Info (Slot 49):** Displays the mob type, current stack size, and total stored items.
- **Claim All (Slot 51):** Click the chest icon to instantly collect all stored items into your inventory.
- **Single Stack Collection:** Click any specific item stack in the menu to withdraw only that stack.

> [!TIP]
> **Full Inventory Protection:** If your inventory has no free space, the "Claim All" button will turn into a barrier icon and warn you: `⚠ Your Inventory is Currently Full`. Clear space in your inventory to claim your loot!

---

### 3. Stacking Spawners (DonutSMP Style)
You can upgrade your spawner production without placing dozens of blocks by **stacking** them together:

- **Add +1 to Stack:** Hold a matching spawner in your hand and **Right-Click** your placed spawner.
- **Dump All (Batch Stack):** **Sneak + Right-Click** your placed spawner while holding matching spawners to instantly dump your entire held stack into the spawner!
- The action bar will display: `+X — stack now Y`.
- **Anti-Griefing Security:** Only the player who placed the spawner can add spawners to the stack. Other players cannot hijack or interact with your stack.

---

### 4. Mining & Moving Spawners
To pick up or move your spawner:

- **Requirement:** You **MUST** use a pickaxe enchanted with **Silk Touch** (Iron, Gold, Diamond, or Netherite).
- **Single Un-stack:** Normal break removes **1 spawner** from the stack and drops it as an item. The remaining stack stays placed and continues working!
- **Fast Un-stack (Batch):** **Sneak + Break** removes up to **64 spawners** at once from the stack.
- **Breaking the Last Spawner:** Breaking when 1 spawner is left removes the block completely.

> [!CAUTION]
> **Always claim your loot before mining!**  
> Breaking or un-stacking a spawner will **purge any uncollected items** currently stored in its buffer. Open the storage with a bare hand and click "Claim All" first!

---

## 📋 Section 4: Supported Mob Types & Drops

Every spawner includes full item lore indicating exactly what drops it generates:

| Mob Type | Drops Produced |
|---|---|
| **Cow** | Raw Beef, Leather |
| **Pig** | Raw Porkchop, Saddle |
| **Sheep** | Raw Mutton, White Wool |
| **Chicken** | Raw Chicken, Feather, Egg |
| **Iron Golem** | Iron Ingot, Poppy |
| **Zombie** | Rotten Flesh, Iron Ingot, Carrot, Potato |
| **Skeleton** | Bone, Arrow, Bow |
| **Creeper** | Gunpowder |
| **Spider** | String, Spider Eye |
| **Cave Spider** | String, Spider Eye |
| **Blaze** | Blaze Rod |
| **Enderman** | Ender Pearl |
| **Slime** | Slimeball |
| **Magma Cube** | Magma Cream |
| **Witch** | Glowstone Dust, Redstone, Spider Eye, Sugar, Gunpowder |
| **Wither Skeleton** | Bone, Coal, Wither Skeleton Skull |
| **Drowned** | Rotten Flesh, Copper Ingot, Nautilus Shell, Trident |
| **Husk** | Rotten Flesh, Iron Ingot |
| **Stray** | Bone, Arrow |
| **Bogged** | Bone, Arrow, Tipped Arrow |
| **Guardian** | Prismarine Shard, Prismarine Crystals, Raw Fish |
| **Elder Guardian** | Prismarine Shard, Prismarine Crystals, Wet Sponge |
| **Piglin** | Gold Nugget, Ender Pearl |
| **Piglin Brute** | Gold Ingot |
| **Zombified Piglin** | Rotten Flesh, Gold Nugget, Gold Ingot |
| **Hoglin** | Raw Porkchop, Leather |
| **Ghast** | Ghast Tear, Gunpowder |
| **Evoker** | Emerald, Totem of Undying |
| **Breeze** | Breeze Rod |
| **Shulker** | Shulker Shell |
| **Phantom** | Phantom Membrane |
| **Silverfish** | Gunpowder, Bottle o' Enchanting |

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Why is my placed spawner not showing a spinning mob or flame particles?
**A:** The admin of the server has not configured that mob type in the world yet. Ask an admin to place a spawner and right-click it with the corresponding spawn egg once to cache its structure.

#### Q: Can regular players use spawn eggs to change what a spawner produces?
**A:** No. Only server Admins and OPs have permission to configure or change spawner mob types. Players can only place, stack, mine, trade, and collect from existing configured spawners.

#### Q: Can someone else steal or break my spawner?
**A:** Players can only stack into their own spawners. If someone mines an unprotected spawner using Silk Touch, they will receive the spawner item, but any loot inside the buffer is instantly destroyed to prevent stealing uncollected items. Use your server's land claim system to protect your base blocks!

#### Q: How do I open the spawner menu if I'm holding a block or tool?
**A:** Switch to an empty slot on your hotbar. Right-clicking with any item in hand (other than a matching spawner to stack) is ignored so you don't accidentally open the menu while building or holding weapons.


# DonutSMP-Spawner-System-Bedrock-Edition-

Bring the signature spawner economy mechanics of DonutSMP directly to your Minecraft Bedrock server or realm! This addon introduces high-efficiency virtual stacked spawners coupled with an intuitive 54-slot chest collection GUI, preventing entity lag completely while delivering pure automation. All Thanks To Chest UI lib.

https://github.com/SomMandal-hub/DonutSMP-Spawner-System-Bedrock-Edition-/wiki/Player-&-Admin-Guide
