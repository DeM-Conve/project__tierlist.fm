import { useEffect, useMemo, useRef, useState } from 'react';
import { tierName } from './tierLabels';
import { useDispatch, useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
  useMatch,
  useOutletContext,
} from 'react-router-dom';
import { spotlight } from '@mantine/spotlight';
import { ActionIcon, Affix, Box, Center, Flex, Loader } from '@mantine/core';
import { Menu as MenuIcon } from 'lucide-react';
import { useDisclosure, useElementSize, useHotkeys, useMediaQuery, useMergedRef, useWindowEvent } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import './App.css';
import { BOARD_TIERS, TODO_TIER } from './tiers';
import Sidebar, { SidebarPanel } from './components/Sidebar';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import HomeView from './components/HomeView';
import TierFocusView from './components/TierFocusView';
import CreateTierPlaylistsModal from './components/CreateTierPlaylistsModal';
import TodoListModal from './components/TodoListModal';
import TierRail from './components/TierRail';
import { CANVAS_TOP, CANVAS_X, SHELL_Y } from './layout/spacing';
import { CanvasContext } from './layout/canvas';
import PendingChanges from './components/PendingChanges';
import { loadBoard, moveWithFeedback, undoEdit } from './tierActions';
import { buildSyncPlan, succeeded, touchedPlaylists } from './syncPlan';
import { dragEnded, transfersDiscarded, transfersPushed } from './store/transfersSlice';
import TierBoardView from './components/TierBoardView';
import PlayerDock from './components/PlayerDock';
import CommandPalette from './components/CommandPalette';
import DuelHub from './components/duel/DuelHub';
import DuelMatch from './components/duel/DuelMatch';
import DuelMoves from './components/duel/DuelMoves';
import DuelWrap from './components/duel/DuelWrap';
import AddSongsView from './components/AddSongsView';
import { useAddSongs } from './addSongs/useAddSongs';
import { useAddSongsActions } from './addSongs/useAddSongsActions';
import { videoIdsFromText } from './addSongs/youtubeLink';
import { addVideos } from './store/addSongsSlice';
import LinkHints from './keyboard/LinkHints';
import { useVimKeys } from './keyboard/useVimKeys';
import SettingsView from './components/SettingsView';
import ShortcutsModal from './components/ShortcutsModal';
import LoginView from './components/LoginView';
import { setLoggedIn, setPlaylists } from './store/authSlice';
import { detectedNaming } from './store/namingSlice';
import { useSettingsSync } from './api/useSettingsSync';
import { detectNaming } from './naming';
import { setCurrentCategory, setHomeQuery, setSidebarQuery, setMobileSidebarOpen, toggleSidebarCollapsed, showSidebarView, setSidebarCollapsed } from './store/viewSlice';
import {
  setTierItems,
  applySyncedMoves,
  transfersApplied,
  discardTierChanges,
  setSyncStatus,
} from './store/tiersSlice';
import {
  openFocus as openFocusAction,
  removeFromQueue,
  closeFocus as closeFocusAction,
  minimizePlayer,
  expandPlayer,
  floatPlayer,
  startShuffle,
  playNextInQueue,
  playPrevInQueue,
  jumpInQueue,
  moveInQueue,
  reorderUpcoming,
  cycleRepeat,
} from './store/focusSlice';
import {
  selectTierGroups,
  selectTierPlaylists,
  selectTierCategories,
  selectPendingMoves,
  selectStagedChanges,
  selectTransfers,
  selectPlayingVideoIdOnBoard,
  selectFocusSequence,
  selectVideoLookup,
  selectFocusedVideoData,
  selectFocusedAvailableTiers,
  selectNaming,
} from './store/selectors';
import { api, API_BASE, errorMessage } from './api/client';
import { useLoadProgress } from './layout/useLoadProgress';
import {
  useAuthStatusQuery,
  usePlaylistsQuery,
  useTierBoardQueries,
  useTierSyncMutation,
  useInvalidatePlaylistItems,
  useFetchVideo,
} from './api/queries';


// Fetches a board's tiers via TanStack Query (one query per tier's
// underlying playlist, cached by playlist id) and mirrors the result into
// Redux's tiersSlice - which owns the *local editable draft* (drag-and-drop,
// duel results) layered on top. loadedCategory guards the mirror so it only
// re-applies once per fresh dataset: re-entering an already-loaded board
// (e.g. returning from a duel) must not stomp an unsynced local edit just
// because the query cache still holds data for it.
function useLoadTierBoard(category, tiers) {
  const dispatch = useDispatch();
  const loadedCategory = useSelector((s) => s.tiers.loadedCategory);
  const { data, isLoading } = useTierBoardQueries(category, tiers);
  const boardLoading = !tiers || isLoading || loadedCategory !== category;

  useEffect(() => {
    // `tiers` is undefined until the playlists list itself has loaded (e.g.
    // a refresh / deep link straight onto a board). Without this guard the
    // empty result from "no tiers yet" got marked as this board's loaded
    // data, and the board stayed blank until you navigated away and back.
    if (!tiers || !data || loadedCategory === category) return;
    dispatch(loadBoard({ category, data }));
  }, [data, tiers, category, loadedCategory, dispatch]);

  // The top-of-page progress bar while switching boards (skeletons show in
  // TierRow while `loading`; this is the accompanying visual feedback).
  useLoadProgress(boardLoading, category);

  return { isLoading: boardLoading };
}

export default function App() {
  const dispatch = useDispatch();
  const loggedIn = useSelector((s) => s.auth.loggedIn);

  const { data: authData, isError: authErrored } = useAuthStatusQuery();
  const { data: playlistsData } = usePlaylistsQuery(authData?.loggedIn === true);

  // Mirrors TanStack Query's cache into Redux so the many selectors built on
  // state.auth.playlists (tier groups, pending moves, duel pools, ...) don't
  // all need rewriting to read query state directly.
  useEffect(() => {
    if (authErrored) dispatch(setLoggedIn(false));
    else if (authData) dispatch(setLoggedIn(authData.loggedIn));
  }, [authData, authErrored, dispatch]);

  useEffect(() => {
    if (playlistsData) dispatch(setPlaylists(playlistsData));
  }, [playlistsData, dispatch]);

  // Settings live in Postgres per account; localStorage is only a cache.
  const { ready: settingsReady } = useSettingsSync(authData?.loggedIn === true);

  // First run for this account: adopt the naming (template + tier names)
  // that fits the user's existing playlists (no-op once one has been chosen -
  // wait for the account's saved settings, which may already have one).
  const needsNamingDetection = useSelector((s) => s.naming.needsDetection);
  const currentNaming = useSelector(selectNaming);
  useEffect(() => {
    if (playlistsData && settingsReady && needsNamingDetection) {
      dispatch(detectedNaming(detectNaming(playlistsData.map((p) => p.title), currentNaming)));
    }
  }, [playlistsData, settingsReady, needsNamingDetection, currentNaming, dispatch]);

  function login() {
    window.location.href = `${API_BASE}/oauth2/authorization/google`;
  }

  if (loggedIn === false) {
    return (
      <LoginView onLogin={login} />
    );
  }

  if (loggedIn === null) {
    return (
      <Center mih="100vh">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="playlist/:id" element={<PlaylistRedirect />} />
        <Route path="tier/:category" element={<TierBoardPage />} />
        <Route path="tier/:category/t/:tier" element={<TierFocusPage />} />
        <Route path="tier/:category/duel" element={<DuelPage view={DuelHub} />} />
        <Route path="tier/:category/duel/play/:sessionId" element={<DuelPage view={DuelMatch} />} />
        <Route path="tier/:category/duel/moves" element={<DuelPage view={DuelMoves} />} />
        <Route path="tier/:category/duel/done/:sessionId" element={<DuelPage view={DuelWrap} />} />
        <Route path="add" element={<AddSongsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Sidebar + the persistent player dock + command palette, all of which stay
// mounted across every route change - the routed page renders into
// <Outlet/>. Navigation never touches the mini player: it's meant to keep
// playing in the background regardless of what page you're on, so only an
// explicit "stop" (the dock's own ✕, or logout) closes it.
function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useSelector((s) => s.view.sidebarQuery);
  const mobileSidebarOpen = useSelector((s) => s.view.mobileSidebarOpen);
  const sidebarCollapsed = useSelector((s) => s.view.sidebarCollapsed);
  const sidebarView = useSelector((s) => s.view.sidebarView);
  // Below Mantine's md breakpoint the sidebar is a drawer (App.css).
  const narrow = useMediaQuery('(max-width: 61.99em)');
  // The panel's open/shut state lives in Redux (Ctrl+B, the activity bar);
  // the resizable panel follows it, and dragging it shut reports back.
  const sidebarPanelRef = usePanelRef();
  const sidebarCollapsedRef = useRef(sidebarCollapsed);
  sidebarCollapsedRef.current = sidebarCollapsed;
  useEffect(() => {
    const panel = sidebarPanelRef.current;
    if (!panel || narrow) return;
    if (sidebarCollapsed && !panel.isCollapsed()) panel.collapse();
    else if (!sidebarCollapsed && panel.isCollapsed()) panel.expand();
  }, [sidebarCollapsed, narrow, sidebarPanelRef]);
  const tierPlaylists = useSelector(selectTierPlaylists);
  const focusedVideo = useSelector((s) => s.focus.focusedVideo);
  const isShuffling = useSelector((s) => s.focus.isShuffling);
  const isTriage = useSelector((s) => s.focus.isTriage);
  const playerMode = useSelector((s) => s.focus.playerMode);

  const tierGroups = useSelector(selectTierGroups);
  const tierCategories = useSelector(selectTierCategories);
  const pendingMoves = useSelector(selectPendingMoves);
  const transfers = useSelector(selectTransfers);
  const stagedCount = useSelector(selectStagedChanges).length;
  const focusSequence = useSelector(selectFocusSequence);
  // A song dragged to another board unmounts its own tile on the way (the
  // sidebar opens that board), so its dragend never arrives - end the drag
  // whenever any drag ends or drops, anywhere.
  useWindowEvent('dragend', () => dispatch(dragEnded()));
  useWindowEvent('drop', () => dispatch(dragEnded()));
  const videoLookup = useSelector(selectVideoLookup);
  const queueHistory = useSelector((s) => s.focus.history);
  const queueUpcoming = useSelector((s) => s.focus.upcoming);
  const contextLabel = useSelector((s) => s.focus.contextLabel);
  const queueCurrent = useSelector((s) => s.focus.current);
  const repeatMode = useSelector((s) => s.focus.repeatMode);
  const focusedVideoData = useSelector(selectFocusedVideoData);
  const focusedAvailableTiers = useSelector(selectFocusedAvailableTiers);

  const tierMatch = useMatch('/tier/:category/*');
  const currentCategory = tierMatch ? decodeURIComponent(tierMatch.params.category) : null;
  const tierPageMatch = useMatch('/tier/:category/t/:tier');
  const duelMatch = useMatch('/tier/:category/duel/*');
  const addMatch = useMatch('/add');
  const focusedCategory = useSelector((s) => s.focus.focusedCategory);
  // The Tier Rail is global like the player: on a board page it shows that
  // board; anywhere else it follows the playing song's board, so the song
  // can still be rated from Home / Settings / a playlist page. The duel
  // screen keeps the whole width to itself.
  // The duel and Add songs (which has its own tier targets) keep the whole
  // width to themselves.
  const railCategory = duelMatch || addMatch
    ? null
    : currentCategory ?? (focusedVideoData ? focusedCategory : null);

  // Add songs lives up here: the sidebar count and paste-a-link-anywhere
  // need it, not just its page.
  const addSongs = useAddSongs();
  const addSongsActions = useAddSongsActions(addSongs);
  const fetchVideo = useFetchVideo();

  // Pasted YouTube link(s) - anywhere but a text box, or in Add songs' own
  // input - join Add songs. Returns whether there was a link at all.
  function handleAddLinks(text) {
    const ids = videoIdsFromText(text);
    if (!ids.length) return false;
    Promise.allSettled(ids.map(fetchVideo)).then((results) => {
      const videos = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failed = results.filter((r) => r.status === 'rejected');
      if (videos.length) {
        dispatch(addVideos(videos));
        navigate('/add');
      }
      if (failed.length) {
        const count = failed.length === 1 ? 'that song' : `${failed.length} of those songs`;
        notifications.show({
          color: 'red',
          title: `Couldn’t add ${count}`,
          message: errorMessage(failed[0].reason, 'The app couldn’t reach YouTube.'),
        });
      }
    });
    return true;
  }
  useWindowEvent('paste', (e) => {
    const el = document.activeElement;
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
    if (handleAddLinks(e.clipboardData?.getData('text'))) e.preventDefault();
  });

  const tierSyncMutation = useTierSyncMutation();
  const invalidatePlaylistItems = useInvalidatePlaylistItems();

  const [shortcutsOpened, shortcutsHandlers] = useDisclosure(false);
  const hintsRef = useRef(null);
  const canvasEl = useRef(null);
  const { ref: canvasSizeRef, height: canvasHeight } = useElementSize();
  const canvasRef = useMergedRef(canvasEl, canvasSizeRef);
  const canvas = useMemo(() => ({ ref: canvasEl, height: canvasHeight }), [canvasHeight]);
  useVimKeys({
    hintsRef,
    canvasRef: canvasEl,
    categories: tierCategories,
    currentCategory,
    playingCategory: focusedVideoData ? focusedCategory : null,
    playingVideoId: focusedVideoData?.videoId ?? null,
    hasTodo: !!tierGroups[currentCategory]?.[TODO_TIER],
  });
  // "?" is the one shortcut in the app with no state-machine/scoping needs
  // of its own (see shortcuts.js's header comment for why the others still
  // have bespoke handlers) - a flat, always-on binding is exactly what
  // useHotkeys is for, and it already ignores keydowns while typing.
  useHotkeys([
    ['shift+?', () => shortcutsHandlers.open()],
    // Every tier edit is one undo step (see tierActions.jsx).
    ['mod+Z', () => dispatch(undoEdit())],
    // Like VS Code: fold the sidebar to icons (on a phone: the drawer).
    ['mod+B', () => dispatch(narrow ? setMobileSidebarOpen(!mobileSidebarOpen) : toggleSidebarCollapsed())],
  ]);

  async function syncChanges(category) {
    dispatch(setSyncStatus('syncing'));
    const plan = buildSyncPlan(pendingMoves, transfers, tierGroups, category);

    try {
      const result = await tierSyncMutation.mutateAsync(plan.payload);
      const finishedStatus = result.applied < result.total ? 'partial' : 'done';

      // Apply whichever changes actually succeeded (per-item, from the
      // backend's own results) straight to the local draft, rather than
      // clearing it and waiting on a refetch of YouTube's playlist API to
      // reflect the change - that refetch can lag behind the write that
      // just happened, which used to leave the just-synced duplicate/moved
      // video sitting on screen looking unsynced. See the comment on
      // `tiersSlice.applySyncedMoves`.
      const done = succeeded(plan, result.results);
      dispatch(applySyncedMoves({ moves: done.moves }));
      dispatch(transfersApplied(done.transfers));
      dispatch(transfersPushed(done.transfers.map((t) => t.id)));

      // Still invalidate the underlying query cache in the background so a
      // stale copy isn't served if the user leaves and comes back later -
      // this no longer needs to be awaited before updating the UI. A
      // transfer also touched another board's playlists.
      invalidatePlaylistItems(touchedPlaylists(plan, tierGroups, category));
      if (done.transfers.length) queryClient.invalidateQueries({ queryKey: ['playlists'] });

      dispatch(setSyncStatus(finishedStatus));
      setTimeout(() => dispatch(setSyncStatus('idle')), 2500);
    } catch {
      dispatch(setSyncStatus('error'));
    }
  }

  // Discard drops this board's edits and every staged transfer.
  function discardChanges() {
    dispatch(discardTierChanges());
    dispatch(transfersDiscarded());
  }

  function moveVideoToTier(fromTier, toTier, videoId, dropIndex) {
    dispatch(moveWithFeedback([{ fromTier, toTier, videoId, dropIndex }]));
  }

  // A tier's own Play button plays just that tier, like playing one
  // playlist ("Playing from Rap · A"); with no tier (the board header's
  // Play) it plays the whole board in tier order. Playing the TODO list is
  // always a triage session.
  function playFrom(tier) {
    if (tier === TODO_TIER) return startTriage();
    const pool = tier ? focusSequence.filter((e) => e.tier === tier) : focusSequence;
    if (pool.length === 0) return;
    dispatch(
      openFocusAction({
        tier: pool[0].tier,
        videoId: pool[0].video.videoId,
        queue: pool.map((e) => e.video.videoId),
        entries: focusSequence,
        category: currentCategory,
        label: tier ? `${currentCategory} · ${tierName(tier)}` : currentCategory,
      })
    );
  }


  function openFocus(tier, videoId) {
    // Freeze the current tier-order sequence as this session's browsing
    // order, so later tier reassignments can't reshuffle where "next" goes.
    dispatch(
      openFocusAction({
        tier,
        videoId,
        queue: focusSequence.map((e) => e.video.videoId),
        entries: focusSequence,
        category: currentCategory,
        label: currentCategory,
      })
    );
  }

  // Triage: play the board's TODO list in order; rating the playing song
  // (rail, chips, Shift+digit) moves it out of TODO and on to the next one.
  function startTriage() {
    const todo = focusSequence.filter((e) => e.tier === TODO_TIER);
    if (todo.length === 0) return;
    dispatch(
      openFocusAction({
        tier: TODO_TIER,
        videoId: todo[0].video.videoId,
        queue: todo.map((e) => e.video.videoId),
        entries: focusSequence,
        category: currentCategory,
        label: `${currentCategory} · ${TODO_TIER}`,
        triage: true,
      })
    );
  }

  // With no `tier` argument, shuffles the whole board; passed a tier (the
  // per-tier "shuffle" button on each row), scopes both the shuffle order
  // and hasPrev/hasNext bounds to just that tier's videos - `entries` stays
  // the full board's snapshot either way so tier-reassignment mid-playback
  // still resolves, only `queue` (what defines the browsing sequence) is
  // narrowed.
  function startShufflePlay(tier) {
    const pool = tier ? focusSequence.filter((e) => e.tier === tier) : focusSequence;
    if (pool.length === 0) return;
    const ids = pool.map((e) => e.video.videoId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const first = videoLookup.get(ids[0]);
    dispatch(
      startShuffle({
        queue: ids,
        tier: first.tier,
        videoId: first.video.videoId,
        entries: focusSequence,
        category: currentCategory,
        label: `${currentCategory}${tier ? ` · ${tierName(tier)}` : ''} · shuffle`,
      })
    );
  }

  function changeFocusedTier(newTier) {
    if (!focusedVideo || newTier === focusedVideo.tier) return;
    // moveWithFeedback also re-points focusedVideo.tier at the new tier.
    moveVideoToTier(focusedVideo.tier, newTier, focusedVideo.videoId, null);
  }

  async function logout() {
    await api.post('/api/auth/logout');
    queryClient.clear();
    dispatch(setLoggedIn(false));
    dispatch(setPlaylists(null));
    dispatch(setTierItems({}));
    dispatch(setSyncStatus('idle'));
    dispatch(closeFocusAction());
    spotlight.close();
    navigate('/', { replace: true });
  }

  const commandItems = useMemo(() => {
    const list = [];
    for (const category of tierCategories) {
      list.push({
        id: `board-${category}`,
        section: 'Boards',
        label: `Go to board ${category}`,
        action: () => navigate(`/tier/${encodeURIComponent(category)}`),
      });
    }
    for (const p of tierPlaylists || []) {
      list.push({
        id: `playlist-${p.id}`,
        section: 'Playlists',
        label: `Open ${p.title}`,
        action: () => navigate(tierPagePath(p.parsed)),
      });
    }
    list.push({
      id: 'action-add-songs',
      section: 'Actions',
      label: 'Add a song (paste its YouTube link)',
      action: () => navigate('/add', { state: { focusInput: true } }),
    });
    // Pages and settings, findable by what's on them ("sett", "theme",
    // "dark mode", "todo keyword", ...) - Spotlight also filters on keywords.
    const pages = [
      { id: 'action-playlists', label: 'Home (boards & playlists)', to: '/', keywords: ['home', 'boards', 'tier lists'] },
      { id: 'page-add', label: 'Add songs (liked songs to rate)', to: '/add', keywords: ['inbox', 'likes', 'liked', 'new songs', 'paste link'] },
      { id: 'page-settings', label: 'Settings', to: '/settings', keywords: ['settings', 'preferences', 'options', 'config'] },
      { id: 'page-settings-appearance', label: 'Settings → Appearance', to: '/settings?tab=appearance', keywords: ['settings', 'theme', 'dark mode', 'light mode', 'accent', 'color', 'tier colors', 'palette'] },
      { id: 'page-settings-naming', label: 'Settings → Playlist naming', to: '/settings?tab=naming', keywords: ['settings', 'template', 'rename', 'naming', 'todo', 'to-do', 'keyword', 'tag'] },
      { id: 'page-settings-keyboard', label: 'Settings → Keyboard shortcuts', to: '/settings?tab=keyboard', keywords: ['settings', 'keys', 'hotkeys', 'shortcuts'] },
    ];
    for (const page of pages) {
      list.push({ id: page.id, section: 'Go to', label: page.label, keywords: page.keywords, action: () => navigate(page.to) });
    }
    list.push({
      id: 'action-shortcuts',
      section: 'Go to',
      label: 'Show keyboard shortcuts',
      keywords: ['help', 'keys', 'hotkeys', '?'],
      action: () => shortcutsHandlers.open(),
    });
    list.push({
      id: 'action-logout',
      section: 'Actions',
      label: 'Log out',
      keywords: ['sign out', 'logout', 'exit'],
      action: () => logout(),
    });
    if (currentCategory) {
      if (tierGroups[currentCategory]?.[TODO_TIER]) {
        list.push({
          id: 'action-triage',
          section: 'Actions',
          label: `Triage the ${currentCategory} TODO list`,
          action: () => startTriage(),
        });
      }
      for (const t of BOARD_TIERS.filter((x) => tierGroups[currentCategory]?.[x])) {
        list.push({
          id: `open-tier-${t}`,
          section: 'Tiers',
          label: `Open ${tierName(t)} of ${currentCategory}`,
          action: () => navigate(`/tier/${encodeURIComponent(currentCategory)}/t/${t}`),
        });
      }
      list.push({
        id: 'action-duel',
        section: 'Actions',
        label: `Start a duel on ${currentCategory}`,
        action: () => navigate(`/tier/${encodeURIComponent(currentCategory)}/duel`),
      });
      if (stagedCount > 0) {
        list.push({
          id: 'action-sync',
          section: 'Actions',
          label: `Sync ${currentCategory} to YouTube (${stagedCount} pending)`,
          action: () => syncChanges(currentCategory),
        });
        list.push({
          id: 'action-discard',
          section: 'Actions',
          label: `Discard changes on ${currentCategory}`,
          action: () => discardChanges(),
        });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierCategories, tierPlaylists, currentCategory, stagedCount, tierGroups, focusSequence]);

  return (
    // The shell is a fixed-height column: the body row (sidebar | canvas |
    // rail) above the player dock's own row. The mini dock takes real space
    // there, so nothing is fixed over the page or has to measure the dock -
    // everything simply ends where the dock begins. (Expanded and floating
    // dock modes are position: fixed overlays, so they leave the flow and
    // the body row gets the full height back.) Plain Flex rather than
    // Mantine AppShell: AppShell fixes its footer at a static height and
    // collapses it with a transform, which would re-anchor the dock's own
    // fixed expanded/floating modes to the footer box.
    <Flex direction="column" h="100dvh">
      <Affix position={{ top: 14, left: 14 }} hiddenFrom="md" zIndex={30}>
        <ActionIcon
          size="lg"
          variant="default"
          onClick={() => dispatch(setMobileSidebarOpen(true))}
          aria-label="Open menu"
        >
          <MenuIcon size={18} />
        </ActionIcon>
      </Affix>

      {/* pos="relative": the mobile sidebar drawer and the staged-changes
          bar are positioned against this row, i.e. above the dock. */}
      <Flex pos="relative" flex={1} mih={0} bg="var(--chrome)">
        {/* Activity bar always; on a phone the drawer also holds the panel. */}
        <Sidebar
          query={query}
          onQueryChange={(q) => dispatch(setSidebarQuery(q))}
          tierCategories={tierCategories}
          tierGroups={tierGroups}
          playlistCount={tierPlaylists?.length ?? 0}
          waitingCount={addSongs.list.length}
          loading={tierPlaylists === null}
          onSelectSettings={() => navigate('/settings')}
          onOpenShortcuts={shortcutsHandlers.open}
          onLogout={logout}
          onOpenPalette={() => spotlight.open()}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => dispatch(setMobileSidebarOpen(false))}
          collapsed={sidebarCollapsed && !narrow}
          view={sidebarView}
          onShowView={(v) => dispatch(showSidebarView(v))}
          withPanel={narrow}
        />

        {/* VS Code's sidebar | editor split, from react-resizable-panels:
            drag the separator to resize the panel (double-click resets it),
            drag it shut to collapse it. */}
        <Group orientation="horizontal" style={{ flex: 1, minWidth: 0 }}>
          {!narrow && (
            <Panel
              id="sidebar-panel"
              panelRef={sidebarPanelRef}
              collapsible
              collapsedSize={0}
              defaultSize={280}
              minSize={200}
              maxSize={520}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(size) => {
                const shut = size.inPixels < 1;
                if (shut !== sidebarCollapsedRef.current) dispatch(setSidebarCollapsed(shut));
              }}
            >
              <SidebarPanel
                query={query}
                onQueryChange={(q) => dispatch(setSidebarQuery(q))}
                tierCategories={tierCategories}
                tierGroups={tierGroups}
                playlistCount={tierPlaylists?.length ?? 0}
                loading={tierPlaylists === null}
                view={sidebarView}
              />
            </Panel>
          )}
          {!narrow && <Separator className="sidebar-resizer" />}
          <Panel id="page" minSize={320}>
            {/* VS Code-style: the page is a rounded card on the window chrome. */}
            <Box h="100%" py={{ base: 0, md: 8 }} pr={{ base: 0, md: railCategory ? 0 : 8 }} style={{ display: 'flex' }}>
              {/* The canvas is the page's scroll container (see layout/canvas.js).
                  scrollbarGutter: the scrollbar's space is always reserved, so the
                  board (which sizes itself to the canvas) can't flicker between
                  "fits -> no scrollbar -> wider -> overflows -> scrollbar". */}
              <Box
                component="main"
                ref={canvasRef}
                flex={1}
                miw={0}
                bg="var(--bg)"
                style={{ overflowY: 'auto', scrollbarGutter: 'stable' }}
                className="canvas-card"
              >
                <Box pt={CANVAS_TOP} px={CANVAS_X} pb={SHELL_Y}>
                  <CanvasContext.Provider value={canvas}>
                    <Outlet
                      context={{
                        syncChanges,
                        discardChanges,
                        moveVideoToTier,
                        openFocus,
                        startShufflePlay,
                        playFrom,
                        addSongs,
                        addSongsActions,
                        handleAddLinks,
                      }}
                    />
                  </CanvasContext.Provider>
                </Box>
              </Box>
            </Box>
          </Panel>
        </Group>

        {railCategory && <TierRail category={railCategory} activeTier={tierPageMatch?.params.tier} />}
      </Flex>

      {focusedVideoData && (
        <PlayerDock
          mode={playerMode}
          video={focusedVideoData}
          currentTier={focusedVideo.tier}
          availableTiers={focusedAvailableTiers}
          hasPrev={queueHistory.length > 0}
          hasNext={queueUpcoming.length > 0}
          repeatMode={repeatMode}
          onCycleRepeat={() => dispatch(cycleRepeat())}
          isShuffling={isShuffling}
          isTriage={isTriage}
          onStop={() => dispatch(closeFocusAction())}
          onMinimize={() => dispatch(minimizePlayer())}
          onExpand={() => dispatch(expandPlayer())}
          onFloat={() => dispatch(floatPlayer())}
          onPrev={() => dispatch(playPrevInQueue())}
          onNext={() => dispatch(playNextInQueue())}
          onChangeTier={changeFocusedTier}
          queue={{ history: queueHistory, current: queueCurrent, upcoming: queueUpcoming, contextLabel }}
          onJump={(section, index) => dispatch(jumpInQueue({ section, index }))}
          onRemove={(key) => dispatch(removeFromQueue(key))}
          onMoveInQueue={(from, to) => dispatch(moveInQueue({ from, to }))}
          onShuffleUpcoming={() => {
            const keys = queueUpcoming.map((e) => e.key);
            for (let i = keys.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [keys[i], keys[j]] = [keys[j], keys[i]];
            }
            dispatch(reorderUpcoming(keys));
          }}
        />
      )}

      <CommandPalette items={commandItems} />
      <LinkHints ref={hintsRef} />
      <ShortcutsModal opened={shortcutsOpened} onClose={shortcutsHandlers.close} />
    </Flex>
  );
}


function useCategoryParam() {
  const { category: rawCategory } = useParams();
  return decodeURIComponent(rawCategory);
}

// Shared by every page of a board (tier list, tier focus, duel):
// marks it as the current board, bounces unknown boards home, and loads
// (or reuses - see loadedCategory) its tiers.
function useBoardPage(category) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const playlists = useSelector((s) => s.auth.playlists);
  const tierGroups = useSelector(selectTierGroups);

  useEffect(() => {
    dispatch(setCurrentCategory(category));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch, category]);

  useEffect(() => {
    if (!playlists) return; // wait for playlists to load before judging validity
    if (!tierGroups[category]) navigate('/', { replace: true });
  }, [category, playlists, tierGroups, navigate]);

  const { isLoading } = useLoadTierBoard(category, tierGroups[category]);
  const tiers = BOARD_TIERS.filter((t) => tierGroups[category]?.[t]);
  const tierLoading = useMemo(
    () => (isLoading ? Object.fromEntries(tiers.map((t) => [t, true])) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, tiers.join()]
  );
  return { tierGroups, tiers, isLoading, tierLoading };
}

// Board pages sit beside the Tier Rail (desktop) and above the shared
// staged-changes bar.
// (The Tier Rail itself is global - mounted in Layout, see railCategory.)
function BoardShell({ children }) {
  return (
    <>
      {children}
      <PendingChanges />
    </>
  );
}

function usePendingRemovalKeys() {
  const pendingMoves = useSelector(selectPendingMoves);
  return useMemo(
    () => new Set(pendingMoves.filter((m) => m.kind === 'dedupe').map((m) => `${m.tier}:${m.video.videoId}`)),
    [pendingMoves]
  );
}

function HomePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const allPlaylists = useSelector((s) => s.auth.playlists);
  const tierPlaylists = useSelector(selectTierPlaylists);
  const query = useSelector((s) => s.view.homeQuery);
  const tierGroups = useSelector(selectTierGroups);
  const tierCategories = useSelector(selectTierCategories);
  const focusedCategory = useSelector((s) => s.focus.focusedCategory);
  const playingVideo = useSelector(selectFocusedVideoData);
  // Same cached query App() runs - read here only for its error.
  const { error: playlistsError, refetch: retryPlaylists, isFetching: retryingPlaylists } = usePlaylistsQuery(true);

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch]);

  return (
    <HomeView
      onAddSongs={() => navigate('/add', { state: { focusInput: true } })}
      playlists={tierPlaylists}
      loadError={
        playlistsError && tierPlaylists === null
          ? errorMessage(playlistsError, 'The app couldn’t load your playlists from YouTube.')
          : null
      }
      retrying={retryingPlaylists}
      onRetry={() => retryPlaylists()}
      onRelogin={() => (window.location.href = `${API_BASE}/oauth2/authorization/google`)}
      hiddenCount={allPlaylists && tierPlaylists ? allPlaylists.length - tierPlaylists.length : 0}
      onOpenNaming={() => navigate('/settings?tab=naming')}
      tierGroups={tierGroups}
      tierCategories={tierCategories}
      query={query}
      onQueryChange={(q) => dispatch(setHomeQuery(q))}
      nowPlaying={playingVideo ? { video: playingVideo, category: focusedCategory } : null}
      onOpenBoard={(c) => navigate(`/tier/${encodeURIComponent(c)}`)}
      onDuel={(c) => navigate(`/tier/${encodeURIComponent(c)}/duel`)}
      onOpenPlaylist={(p) => navigate(tierPagePath(p.parsed))}
    />
  );
}

// A tier playlist's page is its tier page (same list, player, tier chips,
// drag-to-reorder) - there's no separate playlist view. Old /playlist/<id>
// links land there; a hidden (non-matching) playlist's URL just goes home
// rather than exposing its contents.
const tierPagePath = ({ category, tier }) => `/tier/${encodeURIComponent(category)}/t/${tier}`;

function PlaylistRedirect() {
  const { id } = useParams();
  const tierPlaylists = useSelector(selectTierPlaylists);
  if (!tierPlaylists) return null;
  const playlist = tierPlaylists.find((p) => p.id === decodeURIComponent(id));
  return <Navigate to={playlist ? tierPagePath(playlist.parsed) : '/'} replace />;
}

function TierBoardPage() {
  const category = useCategoryParam();
  const navigate = useNavigate();
  const { openFocus, startShufflePlay, playFrom } = useOutletContext();
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const pendingMoves = useSelector(selectPendingMoves);
  const playingVideoId = useSelector(selectPlayingVideoIdOnBoard);
  const { tierGroups, tierLoading, isLoading } = useBoardPage(category);
  // null, or which tiers the "create playlists" modal should preselect.
  const [addingTiers, setAddingTiers] = useState(null);
  // "Add a TODO list": link an existing playlist first, create as a fallback.
  const [addingTodo, setAddingTodo] = useState(false);
  const base = `/tier/${encodeURIComponent(category)}`;

  return (
    <BoardShell>
      {addingTodo && (
        <TodoListModal
          category={category}
          onClose={() => setAddingTodo(false)}
          onCreateNew={() => {
            setAddingTodo(false);
            setAddingTiers([TODO_TIER]);
          }}
        />
      )}
      {addingTiers && (
        <CreateTierPlaylistsModal
          opened
          category={category}
          initialTiers={addingTiers}
          onClose={() => setAddingTiers(null)}
        />
      )}
      <TierBoardView
        category={category}
        tierGroups={tierGroups}
        tierItems={tierItems}
        tierLoading={tierLoading}
        boardLoading={isLoading}
        playingVideoId={playingVideoId}
        pendingMoves={pendingMoves}
        onPlay={openFocus}
        onPlayFrom={playFrom}
        onShufflePlay={startShufflePlay}
        onStartDuel={() => navigate(`${base}/duel`)}
        onOpenTier={(t) => navigate(`${base}/t/${t}`)}
        onAddMissingTiers={(tiers) =>
          tiers.length === 1 && tiers[0] === TODO_TIER ? setAddingTodo(true) : setAddingTiers(tiers)
        }
        onRenameBoard={(name) => navigate(`/tier/${encodeURIComponent(name)}`, { replace: true })}
      />
    </BoardShell>
  );
}

function TierFocusPage() {
  const category = useCategoryParam();
  const { tier } = useParams();
  const navigate = useNavigate();
  const { openFocus, startShufflePlay, playFrom } = useOutletContext();
  const tierItems = useSelector((s) => s.tiers.tierItems);
  const playingVideoId = useSelector(selectPlayingVideoIdOnBoard);
  const pendingRemovalKeys = usePendingRemovalKeys();
  const { tiers, isLoading } = useBoardPage(category);
  const base = `/tier/${encodeURIComponent(category)}`;

  useEffect(() => {
    if (!isLoading && tiers.length && !tiers.includes(tier)) navigate(base, { replace: true });
  }, [isLoading, tiers, tier, base, navigate]);

  return (
    <BoardShell>
      <TierFocusView
        category={category}
        tier={tier}
        tiers={tiers}
        tierItems={tierItems}
        loading={isLoading}
        playingVideoId={playingVideoId}
        pendingRemovalKeys={pendingRemovalKeys}
        onPlay={openFocus}
        onPlayFrom={playFrom}
        onShuffle={startShufflePlay}
        onBack={() => navigate(base)}
        onSwitchTier={(t) => navigate(`${base}/t/${t}`, { replace: true })}
      />
    </BoardShell>
  );
}

// Every duel screen (hub, matchup, moves, summary): the board loaded the same
// way the tier list loads it (deep links work), then the screen itself.
function DuelPage({ view: View }) {
  const category = useCategoryParam();
  const { sessionId } = useParams();
  const { isLoading } = useBoardPage(category);
  return <View category={category} sessionId={sessionId} boardLoading={isLoading} base={`/tier/${encodeURIComponent(category)}`} />;
}

function AddSongsPage() {
  const dispatch = useDispatch();
  const { addSongs, addSongsActions, handleAddLinks } = useOutletContext();

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch]);

  return <AddSongsView addSongs={addSongs} actions={addSongsActions} onAddLinks={handleAddLinks} />;
}

function SettingsPage() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setCurrentCategory(null));
    dispatch(setMobileSidebarOpen(false));
  }, [dispatch]);

  return <SettingsView />;
}
