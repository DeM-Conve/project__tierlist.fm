import { createContext, useContext } from 'react';
import { useOutletContext } from 'react-router-dom';

// The shell's actions (Layout's push / discard / play ...), for parts of the
// shell itself - the global staged-changes bar sits beside the routed page,
// not inside it, so it can't read the outlet context. Pages read the same
// object through useOutletContext; useShellActions works in both places.
export const ShellActionsContext = createContext(null);

export function useShellActions() {
  const shell = useContext(ShellActionsContext);
  const outlet = useOutletContext();
  return shell ?? outlet ?? {};
}
