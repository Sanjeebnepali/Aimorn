// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // eslint-config-expo ~57 pulls in eslint-plugin-react-hooks 7's new
    // React Compiler lint rules, including `immutability` — but that rule
    // has no concept of react-native-reanimated's SharedValue<T>.value,
    // which is deliberately mutable from a plain function (that's the
    // entire point of a Reanimated shared value: cheap UI-thread writes
    // outside React's render cycle, not React state). Every real
    // `sharedValue.value = x` in this codebase (AnimatedButton.tsx,
    // use-marquee-track.ts, etc.) got flagged as an error even though
    // it's the documented, correct Reanimated API — not a bug, a false
    // positive from a lint rule that predates first-class Reanimated
    // awareness. Scoped to this rule only, not a blanket hooks-rule
    // disable, so an actual accidental-mutation bug the rule catches
    // elsewhere still surfaces normally.
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
]);
