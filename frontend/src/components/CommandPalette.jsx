import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';

function rank(item, needle) {
  const label = item.label.toLowerCase();
  if (label.startsWith(needle)) return 0;
  if (label.includes(needle)) return 1;
  return -1;
}

export default function CommandPalette({ items, onClose }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items
      .map((item) => ({ item, score: rank(item, needle) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.item);
  }, [items, query]);

  const sections = useMemo(() => {
    const bySection = {};
    filtered.forEach((item) => {
      bySection[item.section] = bySection[item.section] || [];
      bySection[item.section].push(item);
    });
    return bySection;
  }, [filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('.palette-item-active')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function runItem(item) {
    item.action();
    onClose();
  }

  function onKeyDown(e) {
    // Escape is handled by Dialog itself (onEscapeKeyDown below).
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) runItem(filtered[activeIndex]);
    }
  }

  let flatIndex = -1;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="palette-center-wrapper"
          onEscapeKeyDown={onClose}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="palette">
            <input
              ref={inputRef}
              className="palette-input"
              type="text"
              placeholder="Jump to a board, playlist, or action..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />

            <div className="palette-list" ref={listRef}>
              {filtered.length === 0 && <p className="palette-empty">No matches</p>}
              {Object.entries(sections).map(([section, sectionItems]) => (
                <div key={section} className="palette-section">
                  <p className="palette-section-label">{section}</p>
                  {sectionItems.map((item) => {
                    flatIndex += 1;
                    const isActive = flatIndex === activeIndex;
                    return (
                      <button
                        key={item.id}
                        className={`palette-item${isActive ? ' palette-item-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => runItem(item)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="palette-footer">
              <span>↵ select</span>
              <span>↑↓ navigate</span>
              <span>esc close</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
