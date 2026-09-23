import { useLayoutEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { MantineProvider } from '@mantine/core';
import { applyCssVars, buildAppearance, cssVariablesResolver } from '../themes';

// Rebuilds the CSS variables + Mantine theme whenever the Appearance
// settings change, so switching theme/accent/tier colors is instant.
export default function AppearanceRoot({ children }) {
  const appearance = useSelector((s) => s.appearance);
  const built = useMemo(() => buildAppearance(appearance), [appearance]);
  useLayoutEffect(() => applyCssVars(built.cssVars), [built]);
  return (
    <MantineProvider
      theme={built.mantineTheme}
      forceColorScheme={built.scheme}
      cssVariablesResolver={cssVariablesResolver}
    >
      {children}
    </MantineProvider>
  );
}

