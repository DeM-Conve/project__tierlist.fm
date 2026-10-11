import { Separator } from 'react-resizable-panels';

// The drag edge between two resizable panes (react-resizable-panels'
// <Separator>), drawn like VS Code's sash: three small dots dead centre of
// the gap, replaced by an accent line on hover, while dragging or on
// keyboard focus. The states come from the library's data-separator
// attribute; the look is App.css `.sash` (pseudo-elements - no Mantine prop
// for it).
export default function Sash(props) {
  return <Separator className="sash" {...props} />;
}
