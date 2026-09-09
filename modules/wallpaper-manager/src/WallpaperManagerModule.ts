import { NativeModule, requireNativeModule } from 'expo';

import type { WallpaperTarget } from './WallpaperManager.types';

declare class WallpaperManagerModule extends NativeModule<{}> {
  /**
   * Decodes the local image at `uri` (a "file://..." path) and sets it as
   * the device wallpaper for the given `target` screen(s).
   * @throws if the file can't be read/decoded, or the OS refuses the wallpaper.
   */
  setWallpaperAsync(uri: string, target: WallpaperTarget): Promise<void>;
}

export default requireNativeModule<WallpaperManagerModule>('WallpaperManager');
