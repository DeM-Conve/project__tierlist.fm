package fm.tierlist.duel;

import fm.tierlist.duel.engine.BoardAnalysis;
import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.SongState;
import fm.tierlist.duel.engine.Verdict;
import fm.tierlist.duel.engine.pairing.Focus;
import fm.tierlist.duel.engine.pairing.Matchup;
import fm.tierlist.duel.engine.policy.Suggestion;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// The duel API's wire contract. The engine's types never leave the service
// layer except through these (the DTOs depend on the domain, never the reverse).
public final class DuelDtos {

    private DuelDtos() {
    }

    // ---------------------------------------------------------------- requests

    // The board as the browser has it (staged edits included): tier -> video ids, in order.
    public record LayoutDto(@NotNull @Size(max = 6) Map<TierSlot, @Size(max = 5000) List<String>> tiers) {
        public BoardLayout toLayout() {
            List<String> ranked = new ArrayList<>();
            Map<String, List<String>> songs = new LinkedHashMap<>();
            for (TierSlot slot : TierSlot.values()) {
                List<String> ids = tiers.get(slot);
                if (ids == null) continue;
                ids.forEach(DuelService::requireVideoId);
                songs.put(slot.name(), ids);
                if (slot.ranked()) ranked.add(slot.name());
            }
            return new BoardLayout(ranked, tiers.containsKey(TierSlot.TODO) ? TierSlot.TODO.name() : null, songs);
        }
    }

    public record LayoutRequest(@NotNull @Valid LayoutDto layout) {}

    public record StartRequest(@NotNull @Valid LayoutDto layout, @NotNull Focus focus, String songId,
                               @Min(1) @Max(60) int minutes) {}

    public record VerdictRequest(@NotNull @Valid LayoutDto layout, @NotNull String a, @NotNull String b, @NotNull Verdict verdict) {}

    public record SkipRequest(@NotNull @Valid LayoutDto layout, @NotNull String videoId) {}

    public record DecisionRequest(@NotNull TierSlot from, @NotNull TierSlot to,
                                  @Min(0) @Max(1) double confidence, @NotNull Decision.Kind decision) {}

    // --------------------------------------------------------------- responses

    public record SongDto(String id, String tier, double mu, double sigma, Map<String, Double> probabilities,
                          String bestTier, double bestProbability, int duels, int wins, int losses, int draws, boolean onFence) {
        static SongDto from(SongState s, BoardAnalysis a) {
            Map<String, Double> p = new LinkedHashMap<>();
            List<String> tiers = a.layout().rankedTiers();
            for (int k = 0; k < s.probabilities().length; k++) p.put(tiers.get(k), s.probabilities()[k]);
            String best = s.probabilities().length == 0 ? null : tiers.get(s.bestRank());
            return new SongDto(s.id(), s.tier(), s.rating().mu(), s.rating().sigma(), p, best, s.bestProbability(),
                s.duels().size(), s.wins(), s.losses(), s.draws(), a.onFence().contains(s.id()));
        }
    }

    public record KeyResultDto(String opponent, String opponentTier, int result) {}

    public record SuggestionDto(String song, String from, String to, double confidence, int wins, int losses, int draws,
                                List<KeyResultDto> keyResults, List<Double> trend) {
        static SuggestionDto from(Suggestion s) {
            return new SuggestionDto(s.song(), s.from() == null ? TierSlot.TODO.name() : s.from(), s.to(), s.confidence(),
                s.wins(), s.losses(), s.draws(),
                s.keyResults().stream().map(k -> new KeyResultDto(k.opponent(), k.opponentTier(), k.result())).toList(),
                s.trend());
        }
    }

    public record BorderDto(String upper, String lower, double score) {}

    public record AnalysisDto(double certainty, List<BorderDto> borders, List<SongDto> songs, int onFence, int unplaced,
                              List<SuggestionDto> suggestions, Map<String, List<String>> tierOrders, UUID activeSession,
                              long duelsTotal) {
        static AnalysisDto from(BoardAnalysis a, UUID activeSession, long duelsTotal) {
            List<String> tiers = a.layout().rankedTiers();
            double[] cuts = a.cutpoints();
            List<BorderDto> borders = new ArrayList<>();
            for (int k = 0; k < cuts.length; k++) borders.add(new BorderDto(tiers.get(k), tiers.get(k + 1), cuts[k]));
            int unplaced = (int) a.songs().values().stream().filter(s -> s.tier() == null).count();
            return new AnalysisDto(a.certainty(), borders, a.songs().values().stream().map(s -> SongDto.from(s, a)).toList(),
                a.onFence().size(), unplaced, a.suggestions().stream().map(SuggestionDto::from).toList(), a.tierOrders(),
                activeSession, duelsTotal);
        }
    }

    public record ReasonDto(Matchup.Kind kind, String upperTier, String lowerTier) {}

    public record MatchupDto(String a, String b, ReasonDto reason, SongDto songA, SongDto songB) {
        static MatchupDto from(Matchup m, BoardAnalysis a) {
            Matchup.Reason r = m.reason();
            return new MatchupDto(m.a(), m.b(), new ReasonDto(r.kind(), r.upperTier(), r.lowerTier()),
                SongDto.from(a.song(m.a()), a), SongDto.from(a.song(m.b()), a));
        }
    }

    public record DuelDto(long id, String a, String b, Verdict verdict, Instant at) {
        static DuelDto from(Duel d) {
            return new DuelDto(d.id(), d.a(), d.b(), d.verdict(), d.at());
        }
    }

    // Both songs of the last verdict as they stand after it (for "Nayaab is now 81% T1").
    public record PreviousDto(DuelDto duel, SongDto a, SongDto b) {}

    public record SessionDto(UUID id, String board, Focus focus, String songId, int minutes, Instant startedAt, Instant endsAt,
                             double certaintyStart, double certainty, List<DuelDto> duels, List<String> skipped,
                             PreviousDto previous, MatchupDto matchup, boolean done) {}

    public record UpsetDto(String winner, String loser, double odds, boolean clearly) {}

    public record PairDto(String a, String b) {}

    public record SummaryDto(UUID sessionId, int duels, long seconds, double certaintyStart, double certainty,
                             List<SuggestionDto> newMoves, int movesWaiting, int placed, int bordersSettled,
                             int tierOrders, UpsetDto upset, List<PairDto> undecided) {}

}
