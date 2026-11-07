import { Container, world, system } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { typeIdToDataId, typeIdToID } from './typeIds.js';
// update import at top
import { addonTextures, addonTextureById, vanillaTextures } from './addonTextures.js';

/**
 * Show Inventory is just gone now. (it was pretty mid)
 */
/**
 * Defines the custom block & item IDs for the form.
 * You can reference either a vanilla texture icon, which functions identically to other items...
 * ...or reference a texture path, which removes enchant glint and 3d block render capability.
 * * Custom content should still be supported as long as it doesnt contain wierd characters.
 */
const custom_content = {
	// 'gray': {
	// 	texture: 'textures/blocks/glass_gray'
	// },
};
//Blocks are excluded from the count, as they do not shift vanilla IDs.
const number_of_custom_items = Object.values(custom_content).filter(v => v.type === 'item').length;
const custom_content_keys = new Set(Object.keys(custom_content));
//Add custom sizes defined in UI
const sizes = new Map([
	['single', ['§c§h§e§s§t§2§7§r', 27]], ['small', ['§c§h§e§s§t§2§7§r', 27]],
	['double', ['§c§h§e§s§t§5§4§r', 54]], ['large', ['§c§h§e§s§t§5§4§r', 54]],
	['1', ['§c§h§e§s§t§0§1§r', 1]],
	['5', ['§c§h§e§s§t§0§5§r', 5]],
	['9', ['§c§h§e§s§t§0§9§r', 9]],
	['18', ['§c§h§e§s§t§1§8§r', 18]],
	['27', ['§c§h§e§s§t§2§7§r', 27]],
	['36', ['§c§h§e§s§t§3§6§r', 36]],
	['45', ['§c§h§e§s§t§4§5§r', 45]],
	['54', ['§c§h§e§s§t§5§4§r', 54]],
	['63', ['§c§h§e§s§t§6§3§r', 63]],
	['72', ['§c§h§e§s§t§7§2§r', 72]],
	['81', ['§c§h§e§s§t§8§1§r', 81]],
	['108', ['§e§m§m§z§1§0§8§r', 108]],
	['162', ['§e§m§m§z§1§6§2§r', 162]],
    // --- START CUSTOM HIGHLIGHT SIZES ---
    // Sử dụng hậu tố 'a' để gọi các form có custom highlight
    ['5a', ['§c§h§e§s§t§0§5§a§a§a§r', 5]],
    ['9a', ['§c§h§e§s§t§0§9§a§a§a§r', 9]],
    ['18a', ['§c§h§e§s§t§1§8§a§a§a§r', 18]],
    ['27a', ['§c§h§e§s§t§2§7§a§a§a§r', 27]],
    ['36a', ['§c§h§e§s§t§3§6§a§a§a§r', 36]],
    ['45a', ['§c§h§e§s§t§4§5§a§a§a§r', 45]],
    ['54a', ['§c§h§e§s§t§5§4§a§a§a§r', 54]],
    ['63a', ['§c§h§e§s§t§6§3§a§a§a§r', 63]],
    ['72a', ['§c§h§e§s§t§7§2§a§a§a§r', 72]],
    ['81a', ['§c§h§e§s§t§8§1§a§a§a§r', 81]],
    ['108a', ['§e§m§m§z§1§0§8§a§a§a§r', 108]],
    ['162a', ['§e§m§m§z§1§6§2§a§a§a§r', 162]],
    // --- END CUSTOM HIGHLIGHT SIZES ---
]);

class ChestFormData {
	#titleText; #buttonArray; #borderThickness; #default
	constructor(size = 'small', title = "", borderThickness = 1) {
		const sizing = sizes.get(size.toString()) ?? ['§c§h§e§s§t§2§7§r', 27];
		/** @internal */
		this.#titleText = { rawtext: [{ text: `${sizing[0]}${title}` }] };
		/** @internal */
		this.#buttonArray = Array(sizing[1]).fill(['', undefined]);
		this.#borderThickness = borderThickness
		this.slotCount = sizing[1];
		this.bottom = this.slotCount - 9
		this.#default = { texture: "g/gray" }

		if (this.slotCount % 2 == 1) {
			this.center = Math.floor(this.slotCount / 2)
		} else {
			this.upperCenter = this.slotCount / 2 - 5
			this.lowerCenter = this.slotCount / 2 + 4
			this.center = this.upperCenter
		}
		this.borderSlots = []
		this.centerSlots = []

		for (let i = 0; i < this.slotCount; i++) {
			let borderSlot = false
			let thickness = this.#borderThickness
			let c = i % 9
			if (i < thickness * 9) borderSlot = true
			else if (i > this.slotCount - 1 - thickness * 9) borderSlot = true
			else if (c < thickness) borderSlot = true
			else if (c + thickness > 8) borderSlot = true

			if (borderSlot) {
				this.borderSlots.push(i)
			} else {
				this.centerSlots.push(i)
			}
		}
	}
	title(text) {
		if (typeof text === 'string') {
			this.#titleText.rawtext.push({ text: text });
		}
		else if (typeof text === 'object') {
			if (text.rawtext) {
				this.#titleText.rawtext.push(...text.rawtext);
			}
			else {
				this.#titleText.rawtext.push(text);
			}
		}
		return this;
	}
	button(slot, itemName, itemDesc, texture = "", stackSize = "", durability = 0, enchanted = false, color = false) {
		if (typeof slot == "object") slot = slot.x + slot.y * 9
		if (slot >= this.slotCount) { return }
		let { ID, targetTexture, stack } = textureStuff(texture, enchanted, stackSize, color)

		let buttonRawtext = {
			rawtext: [
				{
					text: `stk§r${stack}dur#${String(Math.min(Math.max(durability, 0), 99)).padStart(2, '0')}§r`
				}
			]
		};
		if (typeof itemName === 'string') {
			buttonRawtext.rawtext.push({ text: itemName ? `${itemName}§r` : '§r' });
		}
		else if (typeof itemName === 'object' && itemName.rawtext) {
			buttonRawtext.rawtext.push(...itemName.rawtext, { text: '§r' });
		}
		else return;
		if (Array.isArray(itemDesc) && itemDesc.length > 0) {
			for (const obj of itemDesc) {
				if (typeof obj === 'string') {
					buttonRawtext.rawtext.push({ text: `\n${obj}` });
				}
				else if (typeof obj === 'object' && obj.rawtext) {
					buttonRawtext.rawtext.push({ text: `\n` }, ...obj.rawtext);
				}
			}
		}
		let buttonText = ""
		buttonRawtext.rawtext.forEach(line => {
			buttonText += `${line.text}`
		})
		buttonText = {
			rawtext: [
				{
					text: buttonText.trimEnd()
				}
			]
		}
		this.#buttonArray.splice(Math.max(0, Math.min(slot, this.slotCount - 1)), 1, [
			buttonText,
			ID === undefined ? targetTexture : ((ID + (ID < 256 ? 0 : number_of_custom_items)) * 65536) + (enchanted ? 32768 : 0)
		]);
		return this;
	}
	pattern(pattern, key = { x: this.#default }) {
		for (let i = 0; i < pattern.length; i++) {
			const row = pattern[i];
			for (let j = 0; j < row.length; j++) {
				const letter = row.charAt(j);
				const data = key[letter];
				if (!data) continue;
				const slot = j + i * 9;
				const { texture, stackAmount = "", durability = 0, itemName, itemDesc, enchanted = false, color = false } = data;
				this.button(slot, itemName, itemDesc, texture, stackAmount, durability, enchanted, color)
			}
		}
		return this;
	}
	border(data = this.#default, thickness = 1) {
		this.#borderThickness = thickness
		this.borderSlots = []
		this.centerSlots = []
		const { texture, stackAmount = "", durability = 0, itemName = "", itemDesc = "", enchanted = false, color = false } = data;

		for (let i = 0; i < this.slotCount; i++) {
			let borderSlot = false
			let c = i % 9
			if (i < thickness * 9) borderSlot = true
			else if (i > this.slotCount - 1 - thickness * 9) borderSlot = true
			else if (c < thickness) borderSlot = true
			else if (c + thickness > 8) borderSlot = true

			if (borderSlot) {
				this.borderSlots.push(i)
				this.button(i, itemName, itemDesc, texture, stackAmount, durability, enchanted, color)
			} else {
				this.centerSlots.push(i)
			}
		}
	}
	fill(from, to, data = this.#default) {
		const { texture, stackAmount = "", durability = 0, itemName = "", itemDesc = "", enchanted = false, color = false } = data;
		if (typeof from == "number") {
			for (let i = from; i < to; i++) {
				this.button(i, itemName, itemDesc, texture, stackAmount, durability, enchanted, color)
			}
		} else {
			for (let i = from.x; i <= to.x; i++) {
				for (let q = from.y; q <= to.y; q++) {
					this.button({ x: i, y: q }, itemName, itemDesc, texture, stackAmount, durability, enchanted, color)
				}
			}
		}
	}
	default(data) {
		this.#default = data
	}
	show(player) {

		const form = new ActionFormData().title(this.#titleText);
		let i = 0
		let count = 0
		this.#buttonArray.forEach(button => {
			i++
			if (button[0] != "") count = i
		})
		i = 0
		this.#buttonArray.forEach(button => {
			i++
			if (i > count) return
			if (button[1] === "minecraft:") button[1] = 0
			form.button(button[0], button[1]?.toString());
		});

		return form.show(player);
	}
}

function textureStuff(texture = 0, enchanted, stackSize = "", color = false) {
	let ID
	let targetTexture
	let stack
	//texture
	if (typeof texture == "number") {
		ID = texture
	} else {
		if (!texture?.includes("/") && !texture.includes(":") && !custom_content_keys.has(texture)) texture = "minecraft:" + texture
		else if (texture?.includes("i/") && enchanted) texture = "minecraft:" + texture.slice(2)

		switch (texture?.slice(0, 2)) {
			case "b/": texture = "textures/blocks/" + texture.slice(2); break
			case "g/": texture = "textures/blocks/glass_" + texture.slice(2); break
			case "i/": texture = "textures/items/" + texture.slice(2); break
			case "t/": texture = "textures/" + texture.slice(2); break
		}
		if (texture === "textures/blocks/glass_") texture = "textures/blocks/glass"
		targetTexture = custom_content_keys.has(texture) ? custom_content[texture]?.texture : texture;

		// Priority 1: addon textures
        const addonPath = addonTextures.has(targetTexture)
            ? targetTexture
            : addonTextureById.get(targetTexture)
        
        if (addonPath !== undefined) {
            targetTexture = addonPath
            ID = undefined
        
        // Priority 2: vanilla texture paths (potions, arrows, etc.) ← NEW
        } else if (vanillaTextures.has(targetTexture)) {
            targetTexture = vanillaTextures.get(targetTexture)
            ID = undefined
        
        // Priority 3: numeric ID fallback
        } else {
            ID = typeIdToDataId.get(targetTexture) ?? typeIdToID.get(targetTexture)
        }
	}


	//stack
	if (typeof stackSize == "object") {
		stack = stackSize[0]
	} else {
		if (typeof stackSize == "string") {
			stack = String(String(stackSize).slice(0, 6)).padStart(6, ' ')
		} else {
			let numStack = Math.min(Math.max(stackSize, -99), 999);
            // Ẩn số lượng nếu stack size là 0 hoặc 1.
            if (numStack >= 0 && numStack <= 1) {
                stack = "      "; // 6 khoảng trắng
            } else {
                stack = String(numStack).padStart(6, ' ');
            }
		}
	}

	//color
	if (color) {
		stack = `§${color[0]}${stack.slice(3)}`
	}

	return { ID, targetTexture, stack }
}

export default ChestFormData;
