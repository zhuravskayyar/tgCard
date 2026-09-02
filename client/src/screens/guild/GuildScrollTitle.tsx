import { useEffect, useRef, useState, type RefObject } from "react";
import { GuildEmblem } from "./GuildUi";

interface GuildScrollTitleProps {
  name: string;
  emblemId: string;
  heroRef: RefObject<HTMLElement | null>;
}

export function GuildScrollTitle({ name, emblemId, heroRef }: GuildScrollTitleProps) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    const title = titleRef.current;
    const content = hero?.closest<HTMLElement>(".app-content");
    const hud = content?.parentElement?.querySelector<HTMLElement>(".top-hud");
    if (!hero || !title || !content || !hud) return;

    let intersection: IntersectionObserver | undefined;
    function observeHero() {
      if (!hero || !title || !content || !hud) return;
      const top = Math.max(0, hud.getBoundingClientRect().bottom - content.getBoundingClientRect().top);
      // The scroll container already reserves HUD space with padding.
      const paddingTop = Number.parseFloat(getComputedStyle(content).paddingTop) || 0;
      title.style.setProperty("--guild-sticky-top", `${top - paddingTop}px`);
      intersection?.disconnect();
      intersection = new IntersectionObserver(([entry]) => {
        if (entry?.rootBounds) setVisible(entry.boundingClientRect.bottom <= entry.rootBounds.top);
      }, { root: content, rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 });
      intersection.observe(hero);
    }

    observeHero();
    const resize = new ResizeObserver(observeHero);
    resize.observe(hud);
    resize.observe(content);
    return () => { intersection?.disconnect(); resize.disconnect(); };
  }, [heroRef]);

  return <div className="guild-scroll-title" ref={titleRef} data-visible={visible} aria-hidden={!visible}>
    <div><GuildEmblem emblemId={emblemId} /><span>{name}</span></div>
  </div>;
}
