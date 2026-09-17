import { NavLink } from 'react-router-dom';
import { ActionIcon, Button, TextInput } from '@mantine/core';
import { Settings } from 'lucide-react';

export default function Sidebar({
  query,
  onQueryChange,
  tierCategories,
  playlistCount,
  onSelectSettings,
  onLogout,
  onOpenPalette,
  mobileOpen,
  onCloseMobile,
}) {
  const filteredCategories = tierCategories.filter((c) =>
    c.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">Playlist Tiers</div>

        <button className="sidebar-palette-btn" onClick={onOpenPalette}>
          <span>Jump to...</span>
          <kbd>⌘K</kbd>
        </button>

        <TextInput
          placeholder="Filter boards..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          mb="sm"
        />

        <nav className="sidebar-nav">
          {tierCategories.length > 0 && (
            <>
              <p className="sidebar-heading">Tier boards</p>
              {filteredCategories.length === 0 && <p className="sidebar-empty">No matches</p>}
              {filteredCategories.map((category) => (
                <NavLink
                  key={category}
                  to={`/tier/${encodeURIComponent(category)}`}
                  className={({ isActive }) => `sidebar-item${isActive ? ' sidebar-item-active' : ''}`}
                >
                  {category}
                </NavLink>
              ))}
              <div className="sidebar-divider" />
            </>
          )}

          <NavLink
            to="/"
            end
            className={({ isActive }) => `sidebar-item${isActive ? ' sidebar-item-active' : ''}`}
          >
            Playlists <span className="sidebar-item-count">{playlistCount}</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <ActionIcon
            variant="default"
            size="lg"
            onClick={onSelectSettings}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
          </ActionIcon>
          <Button variant="default" onClick={onLogout} style={{ flex: 1 }}>
            Log out
          </Button>
        </div>
      </aside>
    </>
  );
}
