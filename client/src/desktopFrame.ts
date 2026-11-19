/* Desktop browsers: the game always runs in a phone-sized frame (430 x DESIGN_HEIGHT),
   scaled down when the window is shorter and centred when it is taller, so it looks and
   lays out exactly like on a phone, at any window width. Phones, touch tablets, Telegram,
   admin and crawlers render the game directly. */
const FRAME_NAME = "cardastika-phone-frame";
const DESIGN_WIDTH = 430;
const DESIGN_HEIGHT = 880;
const MIN_SCALE = 0.6;

function isTelegramLaunch() {
  const webApp = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  return Boolean(webApp?.initData?.trim() || new URLSearchParams(window.location.hash.replace(/^#/, "")).get("tgWebAppData"));
}

export function isInsidePhoneFrame() {
  return window.name === FRAME_NAME && window.parent !== window;
}

/** Returns true when the page became the frame host and must not mount the game itself. */
export function mountDesktopPhoneFrame(isAdminPath: boolean) {
  if (isAdminPath || window.top !== window || isTelegramLaunch()) return false;
  // Touch tablets keep the direct layout: their on-screen keyboard would keep re-scaling the frame.
  if (!window.matchMedia("(pointer: fine)").matches) return false;
  // Crawlers index the first-paint page, not an iframe.
  // Google-InspectionTool / GoogleOther (Search Console live test) carry no "bot" in their UA.
  if (navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|google|bing|yandex|baidu|headless|preview|inspection/i.test(navigator.userAgent)) return false;
  // Any mouse-driven window, however narrow, gets the exact 430 px phone: a narrow desktop
  // window must not stretch the game to its own width the way a large-text phone does.
  if (window.innerHeight / DESIGN_HEIGHT < MIN_SCALE) return false;

  const frame = document.createElement("iframe");
  frame.name = FRAME_NAME;
  frame.title = document.title;
  frame.src = window.location.pathname + window.location.search + window.location.hash;
  frame.allow = "autoplay; fullscreen; clipboard-write";
  Object.assign(frame.style, {
    position: "fixed",
    top: "0",
    left: "50%",
    width: `${DESIGN_WIDTH}px`,
    height: `${DESIGN_HEIGHT}px`,
    border: "0",
    transformOrigin: "50% 0",
    background: "transparent",
    zIndex: "1",
  });

  const layout = () => {
    const scale = Math.min(1, window.innerWidth / DESIGN_WIDTH, Math.max(MIN_SCALE, window.innerHeight / DESIGN_HEIGHT));
    frame.style.top = `${Math.max(0, (window.innerHeight - DESIGN_HEIGHT * scale) / 2)}px`;
    frame.style.transform = `translateX(-50%) scale(${scale})`;
  };
  layout();
  window.addEventListener("resize", layout);
  frame.addEventListener("load", () => frame.focus());
  document.body.classList.add("phone-frame-host");
  document.getElementById("root")?.replaceChildren(frame);
  // The living World Tree around the phone: embers, leaves, mist and light over the wide art.
  const ambient = document.createElement("script");
  ambient.src = "/fx/world-ambient.js";
  ambient.defer = true;
  document.head.appendChild(ambient);
  return true;
}

/** Inside the frame: keep the host's address bar on the current screen so reload and shared links work. */
export function installPhoneFrameUrlSync() {
  if (!isInsidePhoneFrame()) return;
  const mirror = () => {
    try {
      window.parent.history.replaceState(null, "", window.location.pathname + window.location.search + window.location.hash);
      window.parent.document.title = document.title;
    } catch { /* host is not same-origin */ }
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History["pushState"]>) => { original(...args); mirror(); };
  }
  window.addEventListener("popstate", mirror);
  // The localized title is set by an effect after mount; follow it into the host tab.
  new MutationObserver(mirror).observe(document.head, { childList: true, subtree: true, characterData: true });
}
