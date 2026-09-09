import { create } from 'zustand';

import i18n from '@/i18n';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
};

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
  show: (title: string, message?: string, buttons?: AlertButton[]) => void;
  hide: () => void;
}

/**
 * App-wide themed alert store, backing a single host component
 * (ThemedAlertHost) rendered once at the root layout. Keeping this as one
 * global store — rather than local state per screen — is what lets any
 * screen or utility module (native-media.ts included) trigger a themed
 * alert with a plain function call, exactly like the native `Alert.alert`
 * it replaces.
 */
export const useAlertStore = create<AlertState>((set) => ({
  visible: false,
  title: '',
  message: undefined,
  buttons: [],
  show: (title, message, buttons) =>
    set({
      visible: true,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: i18n.t('common.ok') }],
    }),
  hide: () => set({ visible: false }),
}));

/**
 * Drop-in themed replacement for React Native's `Alert.alert`. Deliberately
 * mirrors its exact signature — `(title, message?, buttons?)` with the same
 * `{ text, onPress?, style? }` button shape — so every existing call site
 * swaps over by changing only the import, not the call.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  useAlertStore.getState().show(title, message, buttons);
}
