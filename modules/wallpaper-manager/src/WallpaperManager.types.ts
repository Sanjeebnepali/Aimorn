/**
 * Which screen(s) receive the wallpaper.
 * Ignored on Android versions below 7.0 (API 24) — those predate the
 * separate home/lock wallpaper concept, so the single system wallpaper is
 * always set regardless of which target was requested.
 */
export type WallpaperTarget = 'home' | 'lock' | 'both';
