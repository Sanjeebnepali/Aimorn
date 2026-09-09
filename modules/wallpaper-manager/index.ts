// Re-export the native module. On web, it will be resolved to WallpaperManagerModule.web.ts
// and on native platforms to WallpaperManagerModule.ts
export { default } from './src/WallpaperManagerModule';
export * from './src/WallpaperManager.types';
