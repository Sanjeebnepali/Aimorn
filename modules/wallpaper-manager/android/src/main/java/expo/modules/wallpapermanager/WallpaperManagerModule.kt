package expo.modules.wallpapermanager

import android.app.WallpaperManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Thrown when the file at [uri] can't be decoded into a bitmap (missing,
 * corrupt, or an unsupported format) — surfaces to JS as a typed, catchable
 * error instead of letting BitmapFactory's `null` result crash later with a
 * NullPointerException deep inside WallpaperManager.
 */
class WallpaperDecodeException(uri: String) :
  CodedException("Could not decode an image from \"$uri\" to use as a wallpaper.")

/**
 * Thrown when there is no live Android context to reach WallpaperManager
 * with. Practically unreachable while the app is in the foreground, but kept
 * explicit rather than letting a NullPointerException surface to JS.
 */
class WallpaperContextUnavailableException :
  CodedException("No Android context available to set the wallpaper.")

/**
 * Exposes Android's system WallpaperManager to JS so the Result screen can
 * set a saved wallpaper image as the home screen, lock screen, or both.
 * Expo has no built-in API for this (it's an OS-level, Android-only concept),
 * so it's implemented here as a small local module — see native-media.ts for
 * the JS-side wrapper that calls into this.
 */
class WallpaperManagerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WallpaperManager")

    // `target` picks which screen(s) receive the image: "home", "lock", or
    // "both". Android versions before 7.0 (API 24) have no separate
    // lock-screen wallpaper concept, so `target` is ignored there and the
    // single system wallpaper is set regardless of what was requested.
    AsyncFunction("setWallpaperAsync") { uri: String, target: String ->
      val context = appContext.reactContext ?: throw WallpaperContextUnavailableException()

      // ViewShot and MediaLibrary both hand back "file://..." uris, but
      // BitmapFactory needs a bare filesystem path — strip the scheme.
      val path = Uri.parse(uri).path ?: uri
      val bitmap = BitmapFactory.decodeFile(path) ?: throw WallpaperDecodeException(uri)

      try {
        val manager = WallpaperManager.getInstance(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val flags = when (target) {
            "home" -> WallpaperManager.FLAG_SYSTEM
            "lock" -> WallpaperManager.FLAG_LOCK
            else -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
          }
          manager.setBitmap(bitmap, /* visibleCropHint = */ null, /* allowBackup = */ true, flags)
        } else {
          manager.setBitmap(bitmap)
        }
      } finally {
        // The decoded bitmap can be several megapixels; release it as soon
        // as WallpaperManager has consumed it instead of waiting on GC.
        bitmap.recycle()
      }
    }
  }
}
