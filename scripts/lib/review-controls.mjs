/** Open the actual row body before operating controls moved into its details. */
export async function openReviewDetails(panel, address) {
  const body = panel.locator(`[data-review-action="details"][data-address="${address}"]`);
  if (await body.getAttribute('aria-expanded') === 'false') await body.click();
}
