package fm.tierlist.duel;

import fm.tierlist.duel.DuelDtos.AnalysisDto;
import fm.tierlist.duel.DuelDtos.DuelDto;
import fm.tierlist.duel.DuelDtos.MatchupDto;
import fm.tierlist.duel.DuelDtos.PairDto;
import fm.tierlist.duel.DuelDtos.SessionDto;
import fm.tierlist.duel.DuelDtos.SuggestionDto;
import fm.tierlist.duel.DuelDtos.SummaryDto;
import fm.tierlist.duel.DuelDtos.UpsetDto;
import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.DuelEngine;
import fm.tierlist.duel.engine.DuelHistory;
import fm.tierlist.duel.engine.Rating;
import fm.tierlist.duel.engine.pairing.Focus;
import fm.tierlist.duel.engine.pairing.Matchup;
import fm.tierlist.duel.engine.pairing.SessionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// Duels for one user's board: loads the stored log into the engine's
// DuelHistory, runs DuelEngine, stores what the user does. All the ranking
// logic is in fm.tierlist.duel.engine; this class is persistence + rules about
// sessions (ownership, time limit).
@Service
public class DuelService {

    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");

    private final DuelEngine engine;
    private final Clock clock;
    private final DuelSessionRepository sessions;
    private final DuelRecordRepository duels;
    private final DuelSkipRepository skips;
    private final DuelPriorRepository priors;
    private final DuelDecisionRepository decisions;
    private final DuelLockRepository locks;

    public DuelService(DuelEngine engine, Clock clock, DuelSessionRepository sessions, DuelRecordRepository duels,
                       DuelSkipRepository skips, DuelPriorRepository priors, DuelDecisionRepository decisions,
                       DuelLockRepository locks) {
        this.engine = engine;
        this.clock = clock;
        this.sessions = sessions;
        this.duels = duels;
        this.skips = skips;
        this.priors = priors;
        this.decisions = decisions;
        this.locks = locks;
    }

    static String requireVideoId(String id) {
        if (id == null || !VIDEO_ID.matcher(id).matches()) throw new IllegalArgumentException("Not a YouTube video id: " + id);
        return id;
    }

    // ------------------------------------------------------------- board-wide

    @Transactional
    public AnalysisDto analyze(String userId, String board, BoardLayout layout) {
        DuelHistory history = history(userId, board, layout);
        BoardAnalysis a = engine.analyze(layout, history, clock.instant());
        UUID active = openSession(userId, board).map(DuelSession::getId).orElse(null);
        return AnalysisDto.from(a, active, history.duels().size());
    }

    @Transactional
    public void decide(String userId, String board, String videoId, DuelDtos.DecisionRequest req) {
        requireVideoId(videoId);
        if (req.to() == TierSlot.TODO || req.from() == req.to()) throw new IllegalArgumentException("A move goes to another ranked tier");
        int count = (int) duels.findBoardLog(userId, board).stream().map(DuelRecord::toDuel).filter(d -> d.involves(videoId)).count();
        decisions.save(new DuelDecision(new BoardSongId(userId, board, videoId), req.from(), req.to(), req.confidence(),
            req.decision(), count, clock.instant()));
    }

    @Transactional
    public void undoDecision(String userId, String board, String videoId) {
        decisions.deleteById(new BoardSongId(userId, board, requireVideoId(videoId)));
    }

    @Transactional
    public void lock(String userId, String board, String videoId) {
        BoardSongId id = new BoardSongId(userId, board, requireVideoId(videoId));
        if (!locks.existsById(id)) locks.save(new DuelLock(id, clock.instant()));
    }

    @Transactional
    public void unlock(String userId, String board, String videoId) {
        locks.deleteById(new BoardSongId(userId, board, requireVideoId(videoId)));
    }

    // ---------------------------------------------------------------- sessions

    @Transactional
    public SessionDto start(String userId, String board, DuelDtos.StartRequest req) {
        BoardLayout layout = req.layout().toLayout();
        String song = req.focus() == Focus.ONE_SONG ? requireVideoId(req.songId()) : null;
        if (song != null && !layout.tierOf().containsKey(song)) throw new IllegalArgumentException("That song isn't on this board");
        Instant now = clock.instant();
        openSession(userId, board).ifPresent(s -> s.end(now));
        DuelHistory history = history(userId, board, layout);
        double certainty = engine.analyze(layout, history, now).certainty();
        DuelSession s = sessions.save(new DuelSession(userId, board, req.focus(), song, req.minutes(), now, certainty));
        return view(s, layout, history, null);
    }

    @Transactional
    public SessionDto resume(String userId, String board, UUID id, BoardLayout layout) {
        return view(session(userId, board, id), layout, null);
    }

    @Transactional
    public SessionDto verdict(String userId, String board, UUID id, DuelDtos.VerdictRequest req) {
        DuelSession s = openSessionOrThrow(userId, board, id);
        BoardLayout layout = req.layout().toLayout();
        Map<String, String> tierOf = layout.tierOf();
        if (requireVideoId(req.a()).equals(requireVideoId(req.b()))) throw new IllegalArgumentException("A duel needs two songs");
        if (!tierOf.containsKey(req.a()) || !tierOf.containsKey(req.b())) throw new IllegalArgumentException("Both songs must be on this board");
        duels.save(new DuelRecord(s.getId(), req.a(), req.b(), req.verdict(), clock.instant()));
        return view(s, layout, null);
    }

    @Transactional
    public SessionDto skip(String userId, String board, UUID id, DuelDtos.SkipRequest req) {
        DuelSession s = openSessionOrThrow(userId, board, id);
        DuelSkip.Key key = new DuelSkip.Key(s.getId(), requireVideoId(req.videoId()));
        if (!skips.existsById(key)) skips.save(new DuelSkip(s.getId(), req.videoId()));
        return view(s, req.layout().toLayout(), null);
    }

    // Takes back the session's last verdict and asks that pair again.
    @Transactional
    public SessionDto undo(String userId, String board, UUID id, BoardLayout layout) {
        DuelSession s = session(userId, board, id);
        Optional<DuelRecord> last = duels.findFirstBySessionIdOrderByCreatedAtDescIdDesc(s.getId());
        if (last.isEmpty()) return view(s, layout, null);
        Duel undone = last.get().toDuel();
        duels.delete(last.get());
        duels.flush();
        return view(s, layout, undone);
    }

    @Transactional
    public SummaryDto end(String userId, String board, UUID id, BoardLayout layout) {
        DuelSession s = session(userId, board, id);
        s.end(clock.instant());
        DuelHistory history = history(userId, board, layout);
        BoardAnalysis a = engine.analyze(layout, history, clock.instant());
        List<Duel> mine = history.duels().stream().filter(d -> s.getId().equals(d.session())).toList();
        Set<String> played = new HashSet<>();
        mine.forEach(d -> {
            played.add(d.a());
            played.add(d.b());
        });
        List<SuggestionDto> newMoves = a.suggestions().stream().filter(x -> played.contains(x.song())).map(SuggestionDto::from).toList();
        int placed = (int) newMoves.stream().filter(m -> TierSlot.TODO.name().equals(m.from())).count();
        Set<String> subjects = mine.stream().map(Duel::a).collect(Collectors.toSet());
        int settled = (int) subjects.stream().map(a::song)
            .filter(x -> x != null && x.tier() != null && !a.onFence().contains(x.id())).count();
        UpsetDto upset = mine.stream()
            .filter(d -> a.winnerOdds().containsKey(d.id()))
            .min(Comparator.comparingDouble(d -> a.winnerOdds().get(d.id())))
            .filter(d -> a.winnerOdds().get(d.id()) < 0.35)
            .map(d -> {
                boolean aWon = d.verdict().scoreA() == 1;
                return new UpsetDto(aWon ? d.a() : d.b(), aWon ? d.b() : d.a(), a.winnerOdds().get(d.id()), d.verdict().weight() == 2);
            })
            .orElse(null);
        List<PairDto> undecided = mine.stream()
            .filter(d -> a.areEquals(d.a(), d.b()))
            .map(d -> BoardAnalysis.pairKey(d.a(), d.b()))
            .distinct()
            .map(k -> new PairDto(k.substring(0, k.indexOf('|')), k.substring(k.indexOf('|') + 1)))
            .toList();
        long seconds = Duration.between(s.getStartedAt(), s.getEndedAt()).toSeconds();
        return new SummaryDto(s.getId(), mine.size(), seconds, s.getCertaintyStart(), a.certainty(), newMoves,
            a.suggestions().size(), placed, settled, a.tierOrders().size(), upset, undecided);
    }

    // ----------------------------------------------------------------- helpers

    private Optional<DuelSession> openSession(String userId, String board) {
        Instant now = clock.instant();
        return sessions.findFirstByUserIdAndBoardAndEndedAtIsNullOrderByStartedAtDesc(userId, board).filter(s -> s.isOpen(now));
    }

    private DuelSession session(String userId, String board, UUID id) {
        return sessions.findByIdAndUserIdAndBoard(id, userId, board).orElseThrow(DuelSessionNotFoundException::new);
    }

    private DuelSession openSessionOrThrow(String userId, String board, UUID id) {
        DuelSession s = session(userId, board, id);
        if (!s.isOpen(clock.instant())) throw new DuelSessionClosedException();
        return s;
    }

    // The stored history, after saving starting scores for songs seen for the first time.
    private DuelHistory history(String userId, String board, BoardLayout layout) {
        Map<String, Rating> stored = new HashMap<>();
        priors.findByIdUserIdAndIdBoard(userId, board).forEach(p -> stored.put(p.getVideoId(), p.toRating()));
        Instant now = clock.instant();
        Map<String, Rating> fresh = engine.newPriors(layout, stored);
        fresh.forEach((id, r) -> priors.save(new DuelPrior(new BoardSongId(userId, board, id), r, now)));
        stored.putAll(fresh);
        List<Duel> log = duels.findBoardLog(userId, board).stream().map(DuelRecord::toDuel).toList();
        Map<String, Decision> decided = new HashMap<>();
        decisions.findByIdUserIdAndIdBoard(userId, board).forEach(d -> decided.put(d.getVideoId(), d.toDecision()));
        Set<String> locked = locks.findByIdUserIdAndIdBoard(userId, board).stream().map(DuelLock::getVideoId).collect(Collectors.toSet());
        return new DuelHistory(stored, log, decided, locked);
    }

    private SessionDto view(DuelSession s, BoardLayout layout, Duel rematch) {
        return view(s, layout, history(s.getUserId(), s.getBoard(), layout), rematch);
    }

    private SessionDto view(DuelSession s, BoardLayout layout, DuelHistory history, Duel rematch) {
        Instant now = clock.instant();
        BoardAnalysis a = engine.analyze(layout, history, now);
        List<Duel> mine = history.duels().stream().filter(d -> s.getId().equals(d.session())).toList();
        List<String> skipped = skips.findByIdSessionId(s.getId()).stream().map(DuelSkip::getVideoId).toList();
        Optional<Matchup> next = Optional.empty();
        if (s.isOpen(now)) {
            if (rematch != null && a.song(rematch.a()) != null && a.song(rematch.b()) != null) {
                next = Optional.of(Matchup.of(a, rematch.a(), rematch.b()));
            } else {
                long seed = s.getId().getMostSignificantBits() ^ (31L * mine.size() + skipped.size());
                SessionContext ctx = new SessionContext(s.getFocus(), s.getSongId(), mine, Set.copyOf(skipped),
                    history.duels(), new Random(seed));
                next = engine.next(a, ctx);
            }
        }
        MatchupDto matchup = next.map(m -> MatchupDto.from(m, a)).orElse(null);
        DuelDtos.PreviousDto previous = mine.isEmpty() ? null : previous(mine.get(mine.size() - 1), a);
        return new SessionDto(s.getId(), s.getBoard(), s.getFocus(), s.getSongId(), s.getMinutes(), s.getStartedAt(),
            s.endsAt(), s.getCertaintyStart(), a.certainty(), mine.stream().map(DuelDto::from).toList(), skipped,
            previous, matchup, matchup == null);
    }

    private static DuelDtos.PreviousDto previous(Duel last, BoardAnalysis a) {
        if (a.song(last.a()) == null || a.song(last.b()) == null) return null;
        return new DuelDtos.PreviousDto(DuelDto.from(last), DuelDtos.SongDto.from(a.song(last.a()), a), DuelDtos.SongDto.from(a.song(last.b()), a));
    }

}
