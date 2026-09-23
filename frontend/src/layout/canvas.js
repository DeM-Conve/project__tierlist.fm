import { createContext, useContext } from 'react';

// The page canvas is the app's scroll container (not the window): the shell
// is a fixed-height column of [sidebar | canvas | rail] above the player
// dock, so the dock takes real space instead of overlaying the page. Pages
// that measure or scroll "the viewport" use this instead of window.
//   ref    - the canvas element (scrollTop, getBoundingClientRect)
//   height - its current height (the visible page area, above the dock)
export const CanvasContext = createContext({ ref: { current: null }, height: 0 });

export const useCanvas = () => useContext(CanvasContext);
