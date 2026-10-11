package fm.tierlist.duel.engine.policy;

import fm.tierlist.duel.engine.BoardLayout;
import fm.tierlist.duel.engine.Boards;
import fm.tierlist.duel.engine.Decision;
import fm.tierlist.duel.engine.Duel;
import fm.tierlist.duel.engine.Rating;
import fm.tierlist.duel.engine.SongState;
import fm.tierlist.duel.engine.Verdict;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static fm.tierlist.duel.engine.Boards.id;
import static org.assertj.core.api.Assertions.assertThat;

class SuggestionRulesTest {

    private final BoardLayout board = Boards.board(4, 1);
    private final Map<String, String> tierOf = board.tierOf();
    private final String song = id("B", 0);

    private SongState state(List<Duel> duels) {
        return new SongState(song, "B", new Rating(30, 1), new double[] {0, 0.9, 0.1, 0, 0}, 0.3, 1, duels, List.of(30.0));
    }

    private Candidate candidate(List<Duel> duels, double confidence, Decision decision, boolean locked) {
        return new Candidate(state(duels), "B", "A", confidence, board, tierOf, decision, locked);
    }

    private List<Duel> wins(String tier, int n) {
        List<Duel> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(Boards.duel(i, song, id(tier, i % 4), Verdict.A));
        return out;
    }

    @Test
    void confidenceAndMinimumDuels() {
        assertThat(new ConfidenceRule(0.85).allows(candidate(List.of(), 0.9, null, false))).isTrue();
        assertThat(new ConfidenceRule(0.85).allows(candidate(List.of(), 0.8, null, false))).isFalse();
        assertThat(new MinimumDuelsRule(4).allows(candidate(wins("A", 3), 0.9, null, false))).isFalse();
        assertThat(new MinimumDuelsRule(4).allows(candidate(wins("A", 4), 0.9, null, false))).isTrue();
    }

    @Test
    void opponentsMustComeFromNearTheBorder() {
        assertThat(new BorderOpponentsRule(2).allows(candidate(wins("A", 4), 0.9, null, false))).isTrue();
        assertThat(new BorderOpponentsRule(2).allows(candidate(wins("D", 4), 0.9, null, false))).isFalse();
        assertThat(candidate(List.of(), 0.9, null, false).direction()).isEqualTo(1);
    }

    @Test
    void lockAndKeep() {
        assertThat(new NotLockedRule().allows(candidate(List.of(), 0.9, null, true))).isFalse();
        Decision kept = new Decision(Decision.Kind.KEPT, "B", "A", 4);
        assertThat(new KeepHysteresisRule(5).allows(candidate(wins("A", 8), 0.9, kept, false))).isFalse();
        assertThat(new KeepHysteresisRule(5).allows(candidate(wins("A", 9), 0.9, kept, false))).isTrue();
        Decision accepted = new Decision(Decision.Kind.ACCEPTED, "B", "A", 4);
        assertThat(new KeepHysteresisRule(5).allows(candidate(List.of(), 0.9, accepted, false))).isTrue();
    }

    @Test
    void policySortsByConfidenceAndSkipsTheCurrentTier() {
        SuggestionPolicy p = new SuggestionPolicy(List.of(c -> Optional.empty()), 0.85);
        SongState stay = new SongState(id("C", 0), "C", new Rating(20, 1), new double[] {0, 0, 0.1, 0.9, 0}, 0.2, 3, List.of(), List.of());
        SongState up = state(wins("A", 2));
        SongState none = new SongState(id("D", 0), "D", new Rating(20, 1), new double[0], 0, 0, List.of(), List.of());
        List<Suggestion> out = p.suggest(List.of(stay, up, none), board, tierOf, Map.of(), Set.of()).ready();
        assertThat(out).extracting(Suggestion::song).containsExactly(song);
        assertThat(out.get(0).keyResults()).hasSize(2);
    }

    @Test
    void rulesSayWhatIsMissing() {
        assertThat(new ConfidenceRule(0.85).shortfall(candidate(List.of(), 0.8, null, false)))
            .contains(new Shortfall(Shortfall.Kind.CONFIDENCE, 0.8, 0.85));
        assertThat(new MinimumDuelsRule(4).shortfall(candidate(wins("A", 3), 0.9, null, false)))
            .contains(new Shortfall(Shortfall.Kind.DUELS, 3, 4));
        assertThat(new BorderOpponentsRule(2).shortfall(candidate(wins("D", 4), 0.9, null, false)))
            .contains(new Shortfall(Shortfall.Kind.BORDER_OPPONENTS, 0, 2));
        assertThat(new NotLockedRule().shortfall(candidate(List.of(), 0.9, null, true)).orElseThrow().userDecided()).isTrue();
        Decision kept = new Decision(Decision.Kind.KEPT, "B", "A", 4);
        assertThat(new KeepHysteresisRule(5).shortfall(candidate(wins("A", 6), 0.9, kept, false)))
            .contains(new Shortfall(Shortfall.Kind.FRESH_DUELS, 2, 5));
    }

    private SongState inC(double[] p, int best, int duels) {
        return new SongState(id("C", 0), "C", new Rating(20, 1), p, 0.5, best, wins("B", duels), List.of());
    }

    @Test
    void aMoveGoesAsFarAsTheEvidenceSurelyReaches() {
        SuggestionPolicy p = new SuggestionPolicy(List.of(new ConfidenceRule(0.85)), 0.85);
        // Surely above C (99%), but S/A/B split: B is as far as 85% reaches.
        Suggestion up = p.suggest(List.of(inC(new double[] {0, 0.49, 0.49, 0.01, 0.01}, 1, 4)), board, tierOf, Map.of(), Set.of()).ready().get(0);
        assertThat(up.to()).isEqualTo("B");
        assertThat(up.confidence()).isCloseTo(0.98, org.assertj.core.data.Offset.offset(1e-9));
        // 89% "A or better": straight to A.
        Suggestion far = p.suggest(List.of(inC(new double[] {0.14, 0.75, 0.11, 0, 0}, 1, 4)), board, tierOf, Map.of(), Set.of()).ready().get(0);
        assertThat(far.to()).isEqualTo("A");
        assertThat(far.confidence()).isCloseTo(0.89, org.assertj.core.data.Offset.offset(1e-9));
        // Downwards the same way.
        Suggestion down = p.suggest(List.of(inC(new double[] {0, 0, 0.05, 0.05, 0.9}, 4, 4)), board, tierOf, Map.of(), Set.of()).ready().get(0);
        assertThat(down.to()).isEqualTo("D");
        assertThat(down.confidence()).isCloseTo(0.9, org.assertj.core.data.Offset.offset(1e-9));
    }

    @Test
    void aMoveShortOfTheBarIsLeaningWithWhatItLacks() {
        SuggestionPolicy p = new SuggestionPolicy(List.of(new NotLockedRule(), new ConfidenceRule(0.85), new MinimumDuelsRule(4)), 0.85);
        SongState unsure = inC(new double[] {0, 0.03, 0.8, 0.17, 0}, 2, 3);
        SuggestionPolicy.Result r = p.suggest(List.of(unsure), board, tierOf, Map.of(), Set.of());
        assertThat(r.ready()).isEmpty();
        Suggestion lean = r.leaning().get(0);
        assertThat(lean.to()).isEqualTo("B");
        assertThat(lean.confidence()).isCloseTo(0.83, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(lean.unmet()).extracting(Shortfall::kind).containsExactly(Shortfall.Kind.CONFIDENCE, Shortfall.Kind.DUELS);
        // A lock is the user's answer: not leaning either. Nor is a song with no duels at all.
        assertThat(p.suggest(List.of(unsure), board, tierOf, Map.of(), Set.of(unsure.id())).leaning()).isEmpty();
        assertThat(p.suggest(List.of(inC(unsure.probabilities(), 2, 0)), board, tierOf, Map.of(), Set.of()).leaning()).isEmpty();
    }

    // The user's call: "for to-do songs, the person will decide the tier" - a
    // to-do song gets no suggestion of any kind, however strong its duels.
    @Test
    void aToDoSongIsNeverSuggestedNorLeaning() {
        String td = id("TD", 0);
        List<Duel> strong = new ArrayList<>();
        for (int i = 0; i < 8; i++) strong.add(Boards.duel(i, td, id("B", i % 4), Verdict.A_CLEARLY));
        double[] sureA = {0.02, 0.95, 0.03, 0, 0};
        // Not in a ranked tier: both how a to-do song used to be marked (null) and the raw to-do tier id.
        for (String tier : java.util.Arrays.asList(null, "TODO")) {
            SongState todo = new SongState(td, tier, new Rating(32, 1), sureA, 0.1, 1, strong, List.of(25.0, 32.0));
            assertThat(SuggestionPolicy.userPlacesIt(todo, board)).isTrue();
            SuggestionPolicy.Result all = new SuggestionPolicy(List.of(c -> Optional.empty()), 0.85)
                .suggest(List.of(todo), board, tierOf, Map.of(), Set.of());
            assertThat(all.ready()).isEmpty();
            assertThat(all.leaning()).isEmpty();
            SuggestionPolicy.Result unmet = new SuggestionPolicy(List.of(new ConfidenceRule(0.99)), 0.85)
                .suggest(List.of(todo), board, tierOf, Map.of(), Set.of());
            assertThat(unmet.leaning()).isEmpty();
        }
        assertThat(SuggestionPolicy.userPlacesIt(state(List.of()), board)).isFalse();
    }
}
