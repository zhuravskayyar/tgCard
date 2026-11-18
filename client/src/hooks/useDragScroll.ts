const DRAG_THRESHOLD = 6;
const IGNORE_SELECTOR = "input, textarea, select, [contenteditable], [contenteditable] *, [data-no-drag-scroll], [data-no-drag-scroll] *";

type Axis = "x" | "y";

function canScroll(element: Element, axis: Axis): boolean {
  const style = getComputedStyle(element);
  if (axis === "y") return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
  return /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
}

function findScrollable(start: Element | null, axis: Axis): Element {
  for (let node = start; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (canScroll(node, axis)) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Mouse-only drag-to-scroll for the whole document. Returns a cleanup function. */
export function installDragScroll(): () => void {
  let cleanupDrag: (() => void) | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(IGNORE_SELECTOR)) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let scroller: Element | null = null;
    let originLeft = 0;
    let originTop = 0;
    let previousSnap = "";
    let dragging = false;

    const onMove = (move: PointerEvent) => {
      if (move.pointerType !== "mouse") return;
      const dx = move.clientX - startX;
      const dy = move.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        // Pick the scroller for the dominant axis only once the gesture direction is known.
        scroller = findScrollable(target, Math.abs(dx) > Math.abs(dy) ? "x" : "y");
        originLeft = scroller.scrollLeft;
        originTop = scroller.scrollTop;
        const snapStyle = (scroller as HTMLElement).style;
        if (snapStyle) {
          previousSnap = snapStyle.scrollSnapType;
          snapStyle.scrollSnapType = "none";
        }
        document.body.classList.add("is-drag-scrolling");
      }
      move.preventDefault();
      if (!scroller) return;
      scroller.scrollLeft = originLeft - dx;
      scroller.scrollTop = originTop - dy;
    };
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      cleanupDrag = null;
      if (!dragging) return;
      document.body.classList.remove("is-drag-scrolling");
      const snapStyle = (scroller as HTMLElement | null)?.style;
      if (snapStyle) snapStyle.scrollSnapType = previousSnap;
      const swallow = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    };
    cleanupDrag = () => { finish(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  document.addEventListener("pointerdown", onPointerDown);
  return () => {
    document.removeEventListener("pointerdown", onPointerDown);
    cleanupDrag?.();
  };
}
