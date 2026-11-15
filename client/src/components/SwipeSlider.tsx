import { Children, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppIcon } from "./AppIcon";

const DUST_MOTES = [0, 1, 2, 3, 4, 5];

interface SwipeSliderProps {
  children: ReactNode;
  /** One accessible name per slide; also names the page dots. */
  labels: string[];
}

/**
 * Horizontal swipe slider: one slide per child, the next slide peeks at the edge,
 * page dots and painted arrows below. The active page follows the scroll position.
 */
export function SwipeSlider({ children, labels }: SwipeSliderProps) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  const syncActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    let best = atEnd ? track.children.length - 1 : 0;
    if (!atEnd) {
      let bestDistance = Infinity;
      Array.from(track.children).forEach((child, index) => {
        const distance = Math.abs((child as HTMLElement).offsetLeft - track.scrollLeft);
        if (distance < bestDistance) { best = index; bestDistance = distance; }
      });
    }
    setActive(best);
  }, []);

  useEffect(() => { syncActive(); }, [count, syncActive]);

  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    const slide = track?.children[Math.max(0, Math.min(count - 1, index))] as HTMLElement | undefined;
    if (!track || !slide) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: slide.offsetLeft, behavior: reduced ? "auto" : "smooth" });
  }, [count]);

  // Idle loops run only while the slider is on screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [count]);

  if (count === 0) return null;
  if (count === 1) return <>{slides[0]}</>;

  return (
    <div aria-roledescription="carousel" className="shop-pack-slider" data-visible={visible ? "" : undefined} ref={rootRef}>
      <span aria-hidden="true" className="shop-dust shop-dust--shelf">{DUST_MOTES.map((mote) => <i key={mote} />)}</span>
      <div className="shop-pack-slider__track" onScroll={syncActive} ref={trackRef}>
        {slides.map((slide, index) => (
          <div aria-label={labels[index]} aria-roledescription="slide" className="shop-pack-slider__slide" data-active={index === active} key={index} role="group">{slide}</div>
        ))}
      </div>
      <div className="shop-pack-slider__pager">
        <button aria-label="Попередній слайд" className="shop-pack-slider__arrow" disabled={active === 0} onClick={() => goTo(active - 1)} type="button"><AppIcon name="back" size={22} /></button>
        <div className="shop-pack-slider__dots">
          {slides.map((_, index) => (
            <button aria-current={index === active} aria-label={labels[index]} className="shop-pack-slider__dot" key={index} onClick={() => goTo(index)} type="button" />
          ))}
        </div>
        <button aria-label="Наступний слайд" className="shop-pack-slider__arrow" disabled={active === count - 1} onClick={() => goTo(active + 1)} type="button"><AppIcon name="chevron" size={22} /></button>
      </div>
    </div>
  );
}
