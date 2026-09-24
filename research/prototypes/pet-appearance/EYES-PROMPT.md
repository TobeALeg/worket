# 睁眼素材提示词

2026-09-24。使用内置 image_gen 编辑模式；输入为 `assets/clay-poses-v2.png`。

输出按原文件复制为 `assets/clay-poses-awake-v3.png`。页面只取眼睛附近的四组裁切区域，身体仍显示原来的 v1 / v2 图片，防止整图生成导致主体或小芽变化。具体裁切矩形见 `clay-pet.js`。

Use case: precise-object-edit.
Asset type: transparent RGBA sprite atlas for the approved Worket clay desktop pet.
Input image: the approved 1254 x 1254 transparent 2-by-2 sprite atlas.
Primary request: change ONLY the eyes on all four sprites from closed squinting slits to clearly open, warm, attentive little black eyes. The user loves this exact character and the tiny sprout; preserve them faithfully.
Top-left and top-right: replace each horizontal slit by a small upright rounded oval (roughly 30 px wide, 38 px high at this source size), centered exactly at the old eye center. Matte dark brown-black, same embedded clay treatment; friendly and awake, not gigantic anime eyes, no white eyeballs, eyelashes or eyebrows.
Bottom-left and bottom-right are right-edge docking poses rotated relative to the free character: replace each vertical slit by a small softly rounded dot/oval (roughly 30 px wide by 26 px tall), centered at the old slit centers, so the two eyes still lie one above the other along the vertical screen edge.
INVARIANTS: Preserve original canvas size, identical 2-by-2 layout and every sprite position/scale. Preserve original golden-orange clay color, subtle handmade texture, lighting, silhouette, cream paper note, existing smile, tiny flattened paws and both approved short-neck sprouts. Top-left has NO sprout; top-right has the tiny approved crown sprout. Bottom-left has NO sprout; bottom-right has the tiny approved inward-facing sprout. Change no other body pixels or proportions. No new limbs or props, no state badges or text. Preserve real transparent alpha background (no checkerboard, no white rectangle, no cast floor shadow).
