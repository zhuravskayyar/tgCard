# UI Direction

The client is mobile-first and should be designed primarily for viewports around
360–430 px wide. It must remain usable in an ordinary desktop browser for local
development.

Keep screens in `client/src/screens`, reusable visual pieces in `components`, and
screen-independent React behavior in `hooks`. Prefer existing components and
small CSS modules or focused styles over premature design systems.

The current client is only an architecture status screen. Navigation, cards,
deck UI, battles, shop, animations, and final visual design are out of scope.
