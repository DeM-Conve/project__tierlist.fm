export default function Sidebar({
  query,
  onQueryChange,
  tierCategories,
  playlistCount,
  activeView,
  onSelectTierBoard,
  onSelectPlaylists,
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

        <input
          className="sidebar-search"
          type="text"
          placeholder="Filter boards..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />

        <nav className="sidebar-nav">
          {tierCategories.length > 0 && (
            <>
              <p className="sidebar-heading">Tier boards</p>
              {filteredCategories.length === 0 && <p className="sidebar-empty">No matches</p>}
              {filteredCategories.map((category) => (
                <button
                  key={category}
                  className={`sidebar-item${
                    activeView.type === 'tierBoard' && activeView.category === category ? ' sidebar-item-active' : ''
                  }`}
                  onClick={() => onSelectTierBoard(category)}
                >
                  {category}
                </button>
              ))}
              <div className="sidebar-divider" />
            </>
          )}

          <button
            className={`sidebar-item${activeView.type === 'playlists' ? ' sidebar-item-active' : ''}`}
            onClick={onSelectPlaylists}
          >
            Playlists <span className="sidebar-item-count">{playlistCount}</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className={`btn btn-ghost sidebar-settings-btn${
              activeView.type === 'settings' ? ' sidebar-item-active' : ''
            }`}
            onClick={onSelectSettings}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
          <button className="btn btn-ghost sidebar-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
