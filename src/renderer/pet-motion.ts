import { PET_BODY_SIZE, type PetPlacement } from "../desktop/pet-layout.js";

// Animate inside a temporary window spanning both poses; native resizing happens last.
export function createPetMotion(root: HTMLElement, pet: HTMLElement) {
  let motionId = -1;
  let ghost: HTMLElement | null = null;
  let reveal: Animation | null = null;
  let expanding: Animation | null = null;
  let emerged = false;
  const anchor = pet.parentElement!;
  return (placement: PetPlacement) => {
    const motion = placement.motion;
    root.dataset.settling = String(Boolean(motion));
    if (!motion) {
      ghost?.remove(); ghost = null;
      reveal?.cancel(); reveal = null;
    } else if (motion.id !== motionId) {
      motionId = motion.id;
      ghost?.remove();
      const wrapper = document.createElement("div");
      expanding?.cancel();
      wrapper.className = "pet-motion-ghost";
      wrapper.inert = true;
      wrapper.style.left = `${motion.from.x}px`;
      wrapper.style.top = `${motion.from.y}px`;
      const clone = pet.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      // Keep cloned SVG clips, masks and gradients independent from the new dock pose.
      const ids = new Map<string, string>();
      clone.querySelectorAll("[id]").forEach(node => {
        if (node instanceof SVGElement) {
          const id = `${node.id}-motion-${motion.id}`;
          ids.set(node.id, id);
          node.id = id;
        } else node.removeAttribute("id");
      });
      clone.querySelectorAll("svg *").forEach(node => {
        for (const attribute of node.attributes) {
          const value = attribute.value.replace(/url\(#([\w-]+)\)/g, (match, id: string) =>
            ids.has(id) ? `url(#${ids.get(id)})` : match);
          if (value !== attribute.value) node.setAttribute(attribute.name, value);
        }
      });
      clone.querySelector(".paper-action")?.remove();
      clone.setAttribute("aria-hidden", "true");
      wrapper.append(clone);
      document.body.append(wrapper);
      ghost = wrapper;
      const dx = motion.to.x - motion.from.x - PET_BODY_SIZE.width / 2;
      const dy = motion.to.y - motion.from.y - PET_BODY_SIZE.height / 2;
      wrapper.animate([
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * .45}px, ${dy * .45}px) scale(.78)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0 },
      ], { duration: motion.duration, easing: "cubic-bezier(.42,0,.3,1)", fill: "forwards" });
      reveal?.cancel();
      reveal = anchor.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: motion.duration * .45, delay: motion.duration * .55, fill: "both", easing: "ease-out",
      });
    }
    if (!placement.emerge) emerged = false;
    if (placement.emerge && !emerged) {
      emerged = true;
      expanding?.cancel();
      const direction = { left: [-12, 0], right: [12, 0], top: [0, -12], bottom: [0, 12] }[placement.emerge];
      expanding = anchor.animate([
        { transform: `translate(${direction[0]}px, ${direction[1]}px) scale(.6)` },
        { transform: "translate(0, 0) scale(1)" },
      ], { duration: 150, easing: "cubic-bezier(.16,1,.3,1)" });
    }
  };
}
