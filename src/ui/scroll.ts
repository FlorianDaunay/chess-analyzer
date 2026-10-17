/**
 * Brings `el` into view inside its scrollable `container` only. Unlike `scrollIntoView`, this
 * never scrolls the page itself (on phones that would pull the board out of view on every move).
 */
export function scrollWithin(container: HTMLElement | null, el: Element | null | undefined) {
  if (!container || !el) return;
  const box = container.getBoundingClientRect();
  const item = el.getBoundingClientRect();
  if (item.top < box.top) container.scrollTop -= box.top - item.top;
  else if (item.bottom > box.bottom) container.scrollTop += item.bottom - box.bottom;
}
