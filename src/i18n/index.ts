import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import bn from './locales/bn.json';
import cs from './locales/cs.json';
import de from './locales/de.json';
import el from './locales/el.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fa from './locales/fa.json';
import fil from './locales/fil.json';
import fr from './locales/fr.json';
import he from './locales/he.json';
import hi from './locales/hi.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ms from './locales/ms.json';
import ne from './locales/ne.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sv from './locales/sv.json';
import sw from './locales/sw.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import ur from './locales/ur.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type LanguageCode } from './languages';
import { useLanguageStore } from './store';

/**
 * i18n engine — see `languages.ts`'s doc comment for how to add a language,
 * and `store.ts` for the persisted user-override concept referenced below.
 *
 * Every locale file (`locales/<code>.json`) mirrors `en.json`'s key shape
 * exactly; i18next's `fallbackLng` covers the rare gap (a string added to
 * `en.json` before its translation lands everywhere) by showing English
 * rather than a raw missing-key string.
 *
 * RTL note (Arabic/Urdu/Persian/Hebrew — see `languages.ts`'s `rtl` flag):
 * this pass ships real, correct translated TEXT for these languages, and
 * React Native's own `Text` renders right-to-left script correctly on its
 * own. It does NOT flip this app's overall LAYOUT (icon positions, row
 * direction, alignment) to match — that needs `I18nManager.forceRTL()` plus
 * an app reload plus auditing every `flexDirection: 'row'` in the app, which
 * is real, separate follow-up work this pass doesn't include. Said honestly
 * rather than silently shipped as "full RTL support."
 */

// Every additional locale gets imported + added to `resources` here as its
// file is added under locales/ — see languages.ts for the full list this
// app claims to support.
const resources = {
  en: { translation: en },
  ko: { translation: ko },
  ja: { translation: ja },
  zh: { translation: zh },
  ne: { translation: ne },
  hi: { translation: hi },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ar: { translation: ar },
  ru: { translation: ru },
  id: { translation: id },
  vi: { translation: vi },
  th: { translation: th },
  tr: { translation: tr },
  it: { translation: it },
  pl: { translation: pl },
  uk: { translation: uk },
  nl: { translation: nl },
  bn: { translation: bn },
  ur: { translation: ur },
  fil: { translation: fil },
  ms: { translation: ms },
  fa: { translation: fa },
  sw: { translation: sw },
  ro: { translation: ro },
  el: { translation: el },
  he: { translation: he },
  cs: { translation: cs },
  sv: { translation: sv },
};

/** Best guess from the device's own OS language list — the very first
 *  thing i18next needs, before the (async) persisted-override store below
 *  has had a chance to load. Falls back to English for any language the
 *  device reports that this app doesn't (yet) have a translation file for. */
function detectDeviceLanguage(): LanguageCode {
  try {
    const locales = Localization.getLocales();
    for (const locale of locales) {
      if (locale.languageCode && isSupportedLanguage(locale.languageCode)) {
        return locale.languageCode;
      }
    }
  } catch {
    // expo-localization's native module isn't available yet (e.g. a dev
    // build from before this feature was added, still running old native
    // code) — degrade to the default instead of crashing app startup.
  }
  return DEFAULT_LANGUAGE;
}

// zustand's `persist` rehydrates from AsyncStorage ASYNCHRONOUSLY, so it
// can't be awaited here without delaying the very first render — read
// whatever's already in memory (usually nothing yet, on a cold launch) and
// let the subscriber below correct it the moment rehydration finishes. In
// practice this only matters for the (uncommon) case where a user's
// explicit language pick differs from their device's own OS language.
const initialLanguage: LanguageCode = useLanguageStore.getState().language ?? detectDeviceLanguage();

// This is the default-exported i18next singleton instance's own .use()/
// .init(), not the module's separate named export of the same name.
// eslint-disable-next-line import/no-named-as-default-member
void i18next.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // no HTML to escape in a native app
  returnNull: false,
});

// Correct the guess above once the persisted override is actually known,
// and keep i18next in sync with any later change from the language picker
// (Profile → Language). One subscriber covers both: it fires once
// immediately with whatever's in memory right now, then again on every
// future change.
useLanguageStore.subscribe((state) => {
  const target = state.language ?? detectDeviceLanguage();
  if (target !== i18next.language) {
    // Same singleton-instance-method false positive as the .use() call above.
    // eslint-disable-next-line import/no-named-as-default-member
    void i18next.changeLanguage(target);
  }
});

export default i18next;
export { detectDeviceLanguage };
