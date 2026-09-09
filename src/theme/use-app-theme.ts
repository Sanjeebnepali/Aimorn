import { useThemeStore } from '@/theme/store';
import { resolveTheme, type ThemeTokens } from '@/theme/tokens';

/** Resolves the persisted theme selection into ready-to-use RN color tokens. */
export function useAppTheme(): ThemeTokens {
  const theme = useThemeStore((s) => s.theme);
  return resolveTheme(theme);
}
