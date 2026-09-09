import { NativeModule, registerWebModule } from 'expo';

import type { WallpaperTarget } from './WallpaperManager.types';

// There is no web concept of a device wallpaper — reject clearly instead of
// silently no-op'ing, so callers' error handling (not their happy path) is
// what runs on web.
class WallpaperManagerModule extends NativeModule<{}> {
  async setWallpaperAsync(_uri: string, _target: WallpaperTarget): Promise<void> {
    throw new Error('Setting the device wallpaper is not supported on web.');
  }
}

export default registerWebModule(WallpaperManagerModule, 'WallpaperManagerModule');
