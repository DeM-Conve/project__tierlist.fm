import { Separator } from 'react-resizable-panels';
import { EllipsisVertical } from 'lucide-react';

// The drag edge between two resizable panes (react-resizable-panels'
// <Separator>), drawn like VS Code's sash: a PART_GAP-wide hit area on the
// chrome with a centred ⋮ grip that says "drag me", which brightens - and an
// accent line runs the edge's length - on hover, while dragging or on
// keyboard focus. The states come from the library's data-separator
// attribute; the look is App.css `.sash` (a :hover-like state, no Mantine
// prop for it).
export default function Sash(props) {
  return (
    <Separator className="sash" {...props}>
      {/* Always visible at rest (the user: "clearly visible that it is adjustable"). */}
      <EllipsisVertical className="sash-grip" size={16} strokeWidth={2.5} aria-hidden />
    </Separator>
  );
}
