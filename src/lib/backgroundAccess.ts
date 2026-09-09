/**
 * In-app shortcut to the OS battery/autostart settings that decide whether
 * Couple's background location task survives when the app is closed.
 *
 * ── ADAPTED FILE — trimmed from the source app's `lib/backgroundAccess.ts`.
 * See exactly what was cut and why, below. ──────────────────────────────
 *
 * Why this exists at all: on Vivo OriginOS, MIUI, ColorOS, OneUI, HyperOS the
 * OEM kills third-party background work no matter how correctly you schedule
 * it — Couple's location task (`lib/coupleLocation.ts`) is a foreground
 * service, which helps, but these OEMs ALSO gate a separate "Autostart /
 * allow background activity" toggle that a foreground service alone doesn't
 * bypass. The only real fix is the user flipping that toggle themselves;
 * this just deep-links them straight to it instead of making them hunt.
 *
 * WHAT WAS CUT vs the source file, and why:
 *   - `isBatteryWhitelisted()` / the auto-verify-on-return dance in
 *     `openBatteryThenVerify()` — the source app answers "is this app
 *     already exempt from Doze battery optimization?" via a small custom
 *     native module (`modules/shuffle-foreground`'s
 *     `isIgnoringBatteryOptimizations()`) built for an unrelated feature
 *     (Theme shuffle). Porting a native module just to answer one boolean
 *     isn't worth it here — this version just shows the nudge once per
 *     session, unconditionally, rather than skipping it when already
 *     granted. Mild UX cost (one extra dismissible dialog for users who
 *     already whitelisted the app), zero functional cost.
 *   - `maybePromptExactAlarm()` / `openExactAlarmSettings()` — this is for
 *     Sleep/Wake's exact-alarm scheduling, a different feature this clone
 *     doesn't include. Couple doesn't use `AlarmManager` at all (it's a
 *     continuous foreground-service location stream, not a timed alarm), so
 *     there's nothing for this to gate.
 *
 * Android-only — on iOS none of this applies (no programmatic wallpaper, and
 * iOS's background-location model doesn't have this class of OEM problem).
 * Every call is best-effort: tries the specific intent, falls back to the
 * app-info page, never throws into the UI.
 */

import { Alert, Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';

function packageName(): string {
  const fromConfig = (Constants.expoConfig as { android?: { package?: string } } | null)
    ?.android?.package;
  return fromConfig ?? 'com.example.coupleproximity';
}

function packageData(): string {
  return `package:${packageName()}`;
}

/**
 * Ask the OS to exempt us from battery optimization. Tries, in order:
 *   1. The ONE-TAP "let it always run" system dialog
 *      (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).
 *   2. The full battery-optimization app list.
 *   3. Our app-details page (battery toggle lives one tap in).
 */
export async function openBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: packageData() },
    );
    return;
  } catch {
    /* permission not present / OEM blocks it — fall through */
  }
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
    return;
  } catch {
    /* fall through */
  }
  await openAppDetails();
}

/** Open our app's system "App info" page (battery, autostart, permissions
 *  and notifications all branch from here). Universal fallback. */
export async function openAppDetails(): Promise<void> {
  if (Platform.OS !== 'android') {
    Linking.openSettings();
    return;
  }
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: packageData() },
    );
  } catch {
    Linking.openSettings();
  }
}

/**
 * OEM "Autostart" / "Allow background" screens. There is no standard
 * Android API for this, so we try each brand's known component by name.
 * The first one that resolves wins; if none do (stock Android / unknown
 * OEM) we land the user on the app-info page.
 */
const AUTOSTART_TARGETS: Array<{ packageName: string; className: string }> = [
  // Vivo "High background power consumption" (com.vivo.abe) — on Vivo this is
  // the screen that actually stops the screen-off process FREEZE (PEM / Power
  // Energy Manager). The plain battery "No restrictions" toggle and the
  // autostart list below do NOT cover it.
  {
    packageName: 'com.vivo.abe',
    className:
      'com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity',
  },
  // Vivo (Funtouch OS / OriginOS) autostart / background-start manager.
  {
    packageName: 'com.vivo.permissionmanager',
    className: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity',
  },
  {
    packageName: 'com.iqoo.secure',
    className: 'com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity',
  },
  {
    packageName: 'com.iqoo.secure',
    className: 'com.iqoo.secure.ui.phoneoptimize.BgStartUpManager',
  },
  // Xiaomi / Redmi / POCO (MIUI / HyperOS)
  {
    packageName: 'com.miui.securitycenter',
    className: 'com.miui.permcenter.autostart.AutoStartManagementActivity',
  },
  // Oppo / Realme (ColorOS)
  {
    packageName: 'com.coloros.safecenter',
    className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity',
  },
  {
    packageName: 'com.coloros.safecenter',
    className: 'com.coloros.safecenter.startupapp.StartupAppListActivity',
  },
  {
    packageName: 'com.oppo.safe',
    className: 'com.oppo.safe.permission.startup.StartupAppListActivity',
  },
  // Huawei / Honor (EMUI / MagicOS)
  {
    packageName: 'com.huawei.systemmanager',
    className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity',
  },
  {
    packageName: 'com.huawei.systemmanager',
    className: 'com.huawei.systemmanager.optimize.process.ProtectActivity',
  },
  // Samsung (OneUI) — device care
  {
    packageName: 'com.samsung.android.lool',
    className: 'com.samsung.android.sm.ui.battery.BatteryActivity',
  },
];

/** Try to open the OEM autostart/background-allow screen. Returns true if
 *  one resolved; otherwise lands on app-info and returns false. */
export async function openAutostartSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  for (const t of AUTOSTART_TARGETS) {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        packageName: t.packageName,
        className: t.className,
      });
      return true;
    } catch {
      /* this OEM component isn't present — try the next */
    }
  }
  await openAppDetails();
  return false;
}

/**
 * Nudge the user toward the battery + autostart settings, once per app
 * session. Called (fire-and-forget) from `coupleBootstrap.ts` when Couple
 * actually starts streaming location. No-op on iOS.
 *
 * Unlike the source app's version, this always shows once per session
 * rather than checking a live "already whitelisted?" flag first — see the
 * file header for why. If that one extra dialog for already-whitelisted
 * users bothers you, persist a "user tapped through this" flag (e.g. in
 * `store/settings.ts`) and gate on that instead.
 */
let promptedThisSession = false;
export function maybePromptBackgroundAccess(): void {
  if (Platform.OS !== 'android') return;
  if (promptedThisSession) return;
  promptedThisSession = true;

  setTimeout(() => {
    // Vivo/MIUI/ColorOS need TWO separate settings — battery "No restrictions"
    // AND "Autostart / Allow background". Battery alone is NOT enough on these
    // OEMs, which is exactly why proximity tracking "only works when the app
    // is open" without this. Offer both.
    Alert.alert(
      'Keep proximity tracking running',
      'Phones like Vivo, Xiaomi and Oppo freeze this app once the screen is off, so your wallpaper stops updating while the phone is locked. Turn ON both of these — you only do this once:\n\n1) Battery → No restrictions\n2) Allow background / Autostart',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Battery', onPress: () => void openBatteryOptimization() },
        { text: 'Background', onPress: () => void openAutostartSettings() },
      ],
    );
  }, 700);
}
