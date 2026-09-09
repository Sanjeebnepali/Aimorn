export type ThemeName = 'sunsetRose' | 'midnightGreen' | 'crimsonNoir' | 'obsidian' | 'neonViolet';
export type ColorMode = 'night';

// `labelKey`, not a literal label — this array lives at module scope, where
// a `useTranslation()` hook call isn't available, so the actual translated
// name is looked up with `t()` at the JSX render site (profile/index.tsx).
export const THEME_OPTIONS: { id: ThemeName; labelKey: string }[] = [
  { id: 'sunsetRose', labelKey: 'themeNames.sunsetRose' },
  { id: 'midnightGreen', labelKey: 'themeNames.midnightGreen' },
  { id: 'crimsonNoir', labelKey: 'themeNames.crimsonNoir' },
  { id: 'obsidian', labelKey: 'themeNames.obsidian' },
  { id: 'neonViolet', labelKey: 'themeNames.neonViolet' },
];

export const sharedTokens = {
  ink: '#fff2ef',
  // inkSoft/inkFaint were 0.68/0.42 — low enough over this app's busy
  // gradient-glow backgrounds (GradientScreen's glows + GlassCard's tint,
  // see glass-card.tsx) that secondary/tertiary text lost most of its edge
  // contrast against whatever colorful background showed through, which is
  // what actually read as "blurry" (reported 2026-09-08) rather than any
  // real blur — Android's real blur was already removed app-wide (see
  // glass-card.tsx's comment). Raised both so every label stays legible
  // without flattening the ink/inkSoft/inkFaint hierarchy this app's
  // screens rely on for visual priority.
  inkSoft: 'rgba(255, 242, 239, 0.84)',
  inkFaint: 'rgba(255, 242, 239, 0.64)',
  glass: 'rgba(255, 255, 255, 0.08)',
  glassStrong: 'rgba(255, 255, 255, 0.16)',
  glassBorder: 'rgba(255, 255, 255, 0.22)',
  resultInkSoft: 'rgba(255, 242, 239, 0.88)',
  resultInkFaint: 'rgba(255, 242, 239, 0.7)',
  resultGlass: 'rgba(255, 255, 255, 0.1)',
  resultGlassStrong: 'rgba(255, 255, 255, 0.18)',
  resultGlassBorder: 'rgba(255, 255, 255, 0.25)',
} as const;

export const themePalettes = {
  sunsetRose: {
    bg1: '#370830',
    bg2: '#670226',
    bg3: '#902014',
    glowPink: 'rgba(241, 100, 175, 0.32)',
    glowGold: 'rgba(242, 148, 60, 0.2)',
    accent1: '#fd7277',
    accent2: '#e19100',
    dimBg1: '#2c0026',
    dimBg2: '#540017',
    dimBg3: '#720000',
    dimGlowPink: 'rgba(241, 100, 175, 0.28)',
    dimGlowGold: 'rgba(242, 148, 60, 0.16)',
  },
  midnightGreen: {
    bg1: '#021c09',
    bg2: '#003114',
    bg3: '#084511',
    glowPink: 'rgba(15, 189, 89, 0.32)',
    glowGold: 'rgba(204, 172, 22, 0.2)',
    accent1: '#54bf5c',
    accent2: '#c6a100',
    dimBg1: '#001303',
    dimBg2: '#002206',
    dimBg3: '#002d00',
    dimGlowPink: 'rgba(15, 189, 89, 0.28)',
    dimGlowGold: 'rgba(204, 172, 22, 0.16)',
  },
  crimsonNoir: {
    bg1: '#150a0a',
    bg2: '#43000f',
    bg3: '#670022',
    glowPink: 'rgba(253, 97, 120, 0.32)',
    glowGold: 'rgba(250, 140, 88, 0.2)',
    accent1: '#fc7182',
    accent2: '#f97c3d',
    dimBg1: '#0c0404',
    dimBg2: '#310004',
    dimBg3: '#4a000d',
    dimGlowPink: 'rgba(253, 97, 120, 0.28)',
    dimGlowGold: 'rgba(250, 140, 88, 0.16)',
  },
  obsidian: {
    bg1: '#08090d',
    bg2: '#12131d',
    bg3: '#1c1e2d',
    glowPink: 'rgba(131, 136, 203, 0.22)',
    glowGold: 'rgba(181, 142, 190, 0.14)',
    accent1: '#9295ff',
    accent2: '#d27de6',
    dimBg1: '#030306',
    dimBg2: '#06060f',
    dimBg3: '#090917',
    dimGlowPink: 'rgba(131, 136, 203, 0.193)',
    dimGlowGold: 'rgba(181, 142, 190, 0.112)',
  },
  neonViolet: {
    bg1: '#170b37',
    bg2: '#2a0e5f',
    bg3: '#4a177f',
    glowPink: 'rgba(182, 117, 255, 0.34)',
    glowGold: 'rgba(0, 192, 207, 0.24)',
    accent1: '#b688fe',
    accent2: '#00c2ce',
    dimBg1: '#0f022c',
    dimBg2: '#1d004e',
    dimBg3: '#330063',
    dimGlowPink: 'rgba(182, 117, 255, 0.298)',
    dimGlowGold: 'rgba(0, 192, 207, 0.192)',
  },
} as const;

export type ThemeTokens = typeof sharedTokens & (typeof themePalettes)[ThemeName];

export function resolveTheme(name: ThemeName): ThemeTokens {
  return { ...sharedTokens, ...themePalettes[name] };
}

export const resultBackgrounds = {
  couple: {
    gradient: ['#e6b053', '#dd6f3a', '#902014', '#370830'] as const,
    locations: [0, 0.38, 0.78, 1] as const,
    sunGlow: 'rgba(240, 220, 173, 0.55)',
    horizonHaze: 'rgba(224, 165, 132, 0.35)',
    silhouette: 'rgba(37, 22, 26, 0.94)',
    vignette: 'rgba(23, 15, 18, 0.35)',
  },
  solo: {
    gradient: ['#b3479e', '#8a2fa8', '#3d1f66', '#1c112f'] as const,
    locations: [0, 0.38, 0.78, 1] as const,
    glowA: 'rgba(233, 133, 209, 0.5)',
    glowB: 'rgba(102, 200, 214, 0.42)',
    horizonHaze: 'rgba(216, 110, 199, 0.3)',
    silhouette: 'rgba(28, 17, 33, 0.95)',
    vignette: 'rgba(15, 10, 20, 0.4)',
  },
} as const;

export const fonts = {
  display: 'PlayfairDisplay_600SemiBold_Italic',
  displayMedium: 'PlayfairDisplay_500Medium_Italic',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtraBold: 'Manrope_800ExtraBold',
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 22,
  pill: 999,
} as const;
