/**
 * Raw SVG geometry for the animated brand-intro heart mark — ported
 * verbatim from the user's own splash.html design (same 0–1000 viewBox,
 * same path data) so the in-app animated intro is pixel-faithful to that
 * design, not a re-interpretation of it. Kept in its own file, separate
 * from BrandSplash.tsx's animation/layout logic, purely to keep that
 * component under the workspace's 350-line file limit — this file is
 * data, not behavior.
 */

export const LEFT_HEAD = { cx: 355, cy: 278, r: 72 };
export const RIGHT_HEAD = { cx: 645, cy: 278, r: 72 };

export const LEFT_BODY_PATH = `M 385 360
C 310 320, 220 345, 180 420
C 130 515, 180 640, 275 700
C 350 748, 425 790, 500 875
C 485 760, 435 685, 360 635
C 285 585, 245 520, 275 465
C 305 410, 365 410, 420 448
C 455 472, 480 480, 500 470
C 475 425, 435 385, 385 360
Z`;

export const RIGHT_BODY_PATH = `M 615 360
C 690 320, 780 345, 820 420
C 870 515, 820 640, 725 700
C 650 748, 575 790, 500 875
C 515 760, 565 685, 640 635
C 715 585, 755 520, 725 465
C 695 410, 635 410, 580 448
C 545 472, 520 480, 500 470
C 525 425, 565 385, 615 360
Z`;

export const LEFT_GLOSS_PATH = `M 260 414 C 300 350, 365 347, 414 378`;
export const RIGHT_GLOSS_PATH = `M 740 414 C 700 350, 635 347, 586 378`;

/** Same gradient stops as splash.html's #pinkGradient / #orangeGradient. */
export const PINK_STOPS = [
  { offset: '0%', color: '#ff9ca8' },
  { offset: '35%', color: '#fc7182' },
  { offset: '75%', color: '#f84e6d' },
  { offset: '100%', color: '#ff806d' },
] as const;

export const ORANGE_STOPS = [
  { offset: '0%', color: '#ffd477' },
  { offset: '35%', color: '#f9a23d' },
  { offset: '75%', color: '#f97c3d' },
  { offset: '100%', color: '#ff6948' },
] as const;

/** The 3 loading-dot colors, left to right — same as splash.html's .dot rules. */
export const DOT_COLORS = ['#fc7182', '#ff9771', '#f9a23d'] as const;

/** Brand background — same as app.json's splash backgroundColor and this
 * app's dark-only theme (see _layout.tsx's own "dark-only by design" note). */
export const BRAND_BG = '#1a1024';
