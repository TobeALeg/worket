# 拟物版局部细化提示词

2026-09-24。使用内置 `image_gen` 编辑模式，无 CLI / API fallback。

## 第一轮

Use case: precise-object-edit.
Asset type: ONE transparent 2-by-2 character pose atlas for refining an existing desktop pet, not a new character design.
Input image 1 is the authoritative sculpt, color, texture and face: warm golden-orange matte clay potato, two small closed horizontal eyes, simple smile, cream note on upper-right forehead. Keep this EXACT character, proportions, closed eyes, smile, note and fine clay texture. Do not add feet, limbs, cheeks, open eyes, a nose, ears, clothing, a new outline, or white glossy plastic.
Input image 2 shows the PREVIOUS REJECTED edge pose and oversized antenna; it is a before reference only.
Input image 3 is the ACTUAL compact right-edge silhouette reference: a narrow vertical crescent head, two eyes stacked vertically, tiny paws at top-right and bottom-right, no mouth or note visible. Use its compact geometry, while applying image 1's clay material.

OUTPUT: a square, truly transparent RGBA image, clean isolated cutouts, no colored background, no checkerboard baked in, no cards, text, labels, grid, frames, monitor bezel or pedestal. Four equal quadrants, generous transparent gutters. Each row is a matched pair at precisely identical scale and position within its cell. Row 1 free pose, Row 2 compact RIGHT-edge pose.

TOP LEFT: same full clay potato as image 1's left character, facing front. Remove the little sprout; ordinary resting has a clean, smooth crown. Preserve the body, face and note identity.
TOP RIGHT: identical full clay potato at exactly the same size, same face and same note. Change ONLY the crown: one TINY smooth teardrop bud on a very short thin neck, gently fused into the crown at its center. At a 78 px body width the entire bud should rise only about 8 px, neck about 1.8 px thick, bud head about 4.5 px wide and 5.5 px high. Golden clay matching the body. No giant bulb, long stalk, green glow or large signal waves. Root visibly overlaps the crown; no seam or floating gap.

BOTTOM LEFT: refined compact RIGHT-edge pose using image 3's geometry, enlarged for inspection, face rotated with the character. A shallow vertical crescent/oval cap emerging from a clean vertical clipping line on its RIGHT. Do not draw the edge or anything to the right of that clipping line. Visible cap approximately 18 units wide and 48 units tall in a 32x68 layout. Two tiny closed eye slits are VERTICAL and vertically stacked inside the exposed cap. Two small flattened paw TIPS, one near the top and one near the bottom of the right clipping edge, only about 7 units deep and 10 units tall, softly joined to the hidden body. No oversized spherical hands, mouth, paper, ears, or full body. Body and paws use the same fine golden clay surface as the front pose. Very restrained contact shading.
BOTTOM RIGHT: EXACT same narrow compact cap, eyes, paws and clipping line as bottom left, same size and position. Add ONLY a TINY same-material short teardrop bud projecting HORIZONTALLY LEFT from the midpoint of the exposed leftmost crown, centered between the two eyes' vertical positions. At native scale the complete bud projects about 7 px and is about 4.5 px high, with a thin 1.8 px neck, visibly continuous into the head. Never put an upright antenna at the top-right near the screen edge. No signal arcs or glow in this asset.
Lighting: soft warm light from upper left, matching reference 1. Compact poses should remain calm, readable and elegant at very small scale. The task is to improve the compact pose and tiny antenna while preserving the approved original character.

## 第二轮：缩小爪尖与小芽

Use case: precise-object-edit. Edit the attached transparent four-pose clay potato atlas with extremely targeted changes. The current material, potato body, closed eyes, smiling mouth, cream note, golden color, 2x2 layout and transparent background are approved and must stay the SAME. No redesign or additional elements.

ONLY refine small appendages:
1. In BOTH bottom compact right-edge poses, replace the overly large round ball-shaped paws with very small FLATTENED, low-profile oval paw TIPS. Each paw must be about HALF the previous area and much flatter: around 1/8 of the visible head's vertical height, about 1/5 of its visible width. Top paw gently overhangs the right boundary near the top, bottom paw near the bottom, both visibly connected to the hidden body, calm matching clay shading. The pose must look like a small head quietly peeking from the edge, not hugging with two spherical hands. Keep the narrow crescent face exactly as it is; don't enlarge the exposed body.
2. In TOP RIGHT, make the little sprout 25 percent shorter and its round tip 25 percent smaller than now. Give it a slender short neck with a smooth taper into the existing crown; whole sprout remains gold, soft, small, organic, not a horn. Exact same body and face as top left.
3. In BOTTOM RIGHT, the LEFT-pointing tiny sprout is too big. Shrink the entire sprout to 60 percent of current size, neck thinner, tip delicate. The neck must still join and overlap the exposed leftmost midpoint of the crown, no floating gap; keep it horizontal. Do not move the two vertical eye slits.
4. TOP LEFT is unchanged.
No signal waves, colored glow, new limbs, status badges, frame, monitor edge, labels or background. True transparent RGBA, not a checkerboard. Preserve the original clay surface and restrained shadows. Output the same 2x2 atlas composition.
