package fm.tierlist.duel.engine;

import fm.tierlist.duel.engine.policy.Suggestion;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static fm.tierlist.duel.engine.Boards.duel;
import static fm.tierlist.duel.engine.Boards.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

class FixedCutpointsTierModelTest {

    private static final double[] PRIORS = {34, 28, 22, 16};
    // Shown minimums 400 / 300 / 200 / 100 -> borders 39.95 / 29.95 / 19.95 / 9.95.
    private static final Map<String, Double> MINE = Map.of(
        "S", ScoreScale.borderBelow(400), "A", ScoreScale.borderBelow(300),
        "B", ScoreScale.borderBelow(200), "C", ScoreScale.borderBelow(100));

    private final FixedCutpointsTierModel model = new FixedCutpointsTierModel(MINE, new OrdinalProbitTierModel());

    private static List<TierModel.Placed> placed() {
        List<TierModel.Placed> out = new ArrayList<>();
        for (int k = 0; k < 5; k++) for (int i = 0; i < 8; i++) out.add(new TierModel.Placed(k, new Rating(37 - 6 * k + (i - 4) * 0.3, 2)));
        return out;
    }

    @Test
    void theBordersAreTheUsersOwnNotLearned() {
        TierModel.Fit fit = model.fit(placed(), Boards.TIERS, PRIORS);
        assertThat(fit.cutpoints()).containsExactly(39.95, 29.95, 19.95, 9.95);
        assertThat(fit.cutpoints()[0]).isNotCloseTo(new OrdinalProbitTierModel().fit(placed(), Boards.TIERS, PRIORS).cutpoints()[0], within(1.0));
    }

    @Test
    void probabilitiesFollowTheUsersBorders() {
        TierModel.Fit fit = model.fit(placed(), Boards.TIERS, PRIORS);
        // 37 is in the learned S band, but below the user's own S minimum (400 shown).
        double[] p = fit.probabilities(new Rating(37, 0.5));
        assertThat(Arrays.stream(p).sum()).isCloseTo(1, within(1e-9));
        assertThat(p[1]).isGreaterThan(p[0]);
        assertThat(fit.probabilities(new Rating(45, 0.5))[0]).isGreaterThan(0.9);
    }

    @Test
    void theNoiseIsStillLearnedFromThePlacements() {
        TierModel.Fit learned = new OrdinalProbitTierModel().fit(placed(), Boards.TIERS, PRIORS);
        assertThat(model.fit(placed(), Boards.TIERS, PRIORS).noise()).isEqualTo(learned.noise());
        assertThat(model.fit(List.of(), Boards.TIERS, PRIORS).noise()).isEqualTo(OrdinalProbitTierModel.DEFAULT_NOISE);
    }

    @Test
    void aBoardMissingATierUsesTheBordersOfTheTiersItHas() {
        // No B on this board: between A and C lies A's own border.
        TierModel.Fit fit = model.fit(List.of(), List.of("S", "A", "C", "D"), new double[] {34, 25, 16});
        assertThat(fit.cutpoints()).containsExactly(39.95, 29.95, 9.95);
        assertThat(model.fit(List.of(), List.of("S"), new double[0]).probabilities(new Rating(1, 1))).containsExactly(1.0);
    }

    @Test
    void refusesMissingOrUnorderedBorders() {
        assertThatThrownBy(() -> new FixedCutpointsTierModel(Map.of("S", 30.0), new OrdinalProbitTierModel()).fit(List.of(), Boards.TIERS, PRIORS))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new FixedCutpointsTierModel(Map.of("S", 20.0, "A", 30.0, "B", 10.0, "C", 5.0), new OrdinalProbitTierModel())
            .fit(List.of(), Boards.TIERS, PRIORS)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theShownScaleIsMuTimesTen() {
        assertThat(ScoreScale.shown(33.96)).isEqualTo(340);
        assertThat(ScoreScale.borderBelow(340)).isCloseTo(33.95, within(1e-9));
    }

    // The whole engine with the user's borders: an S song the duels put at
    // ~A level is suggested down once the user's S range starts higher, and
    // every downstream part (cutpoints, certainty) follows those borders.
    @Test
    void theEngineSuggestsMovesAgainstTheUsersBorders() {
        DuelEngine learned = DuelEngine.standard();
        DuelEngine mine = learned.withTierModel(new FixedCutpointsTierModel(Map.of(
            "S", ScoreScale.borderBelow(380), "A", ScoreScale.borderBelow(280),
            "B", ScoreScale.borderBelow(220), "C", ScoreScale.borderBelow(160)), learned.tierModel()));
        BoardLayout board = Boards.board(6, 0);
        String song = id("S", 5);
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 6; i++) log.add(duel(i + 1, song, id("A", i), Verdict.TOO_CLOSE));

        BoardAnalysis a = mine.analyze(board, Boards.history(mine, board, log), Boards.T0.plusSeconds(10_000));
        assertThat(a.cutpoints()).containsExactly(37.95, 27.95, 21.95, 15.95);
        Suggestion s = a.suggestions().stream().filter(x -> x.song().equals(song)).findFirst().orElseThrow();
        assertThat(s.from()).isEqualTo("S");
        assertThat(s.to()).isEqualTo("A");
        assertThat(mine.tierModel()).isInstanceOf(FixedCutpointsTierModel.class);
        assertThat(learned.tierModel()).isInstanceOf(OrdinalProbitTierModel.class);

        BoardAnalysis before = learned.analyze(board, Boards.history(learned, board, log), Boards.T0.plusSeconds(10_000));
        assertThat(a.certainty()).isLessThan(before.certainty());
    }
}
