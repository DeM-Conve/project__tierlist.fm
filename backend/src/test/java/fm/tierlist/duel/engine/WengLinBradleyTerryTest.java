package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class WengLinBradleyTerryTest {

    private final WengLinBradleyTerry model = new WengLinBradleyTerry(0.25);
    private final Rating even = new Rating(25, 5);

    @Test
    void winnerUpLoserDownBothMoreCertain() {
        Rating[] out = model.update(even, even, 1);
        assertThat(out[0].mu()).isGreaterThan(25);
        assertThat(out[1].mu()).isLessThan(25);
        assertThat(out[0].mu() - 25).isCloseTo(25 - out[1].mu(), within(1e-9));
        assertThat(out[0].sigma()).isLessThan(5);
    }

    @Test
    void drawBetweenEqualsChangesNoScore() {
        Rating[] out = model.update(even, even, 0.5);
        assertThat(out[0].mu()).isCloseTo(25, within(1e-9));
        assertThat(out[0].sigma()).isLessThan(5);
    }

    @Test
    void drawPullsTogether() {
        Rating[] out = model.update(new Rating(30, 3), new Rating(20, 3), 0.5);
        assertThat(out[0].mu()).isLessThan(30);
        assertThat(out[1].mu()).isGreaterThan(20);
    }

    @Test
    void clearlyMovesFurtherThanAWin() {
        double once = model.apply(even, even, Verdict.A)[0].mu();
        double twice = model.apply(even, even, Verdict.A_CLEARLY)[0].mu();
        assertThat(twice).isGreaterThan(once);
        assertThat(model.apply(even, even, Verdict.B_CLEARLY)[0].mu()).isLessThan(model.apply(even, even, Verdict.B)[0].mu());
    }

    @Test
    void unsureSongMovesMore() {
        Rating unsure = new Rating(25, 8);
        double unsureGain = model.update(unsure, even, 1)[0].mu() - 25;
        double sureGain = model.update(even, unsure, 1)[0].mu() - 25;
        assertThat(unsureGain).isGreaterThan(sureGain);
    }

    @Test
    void winProbability() {
        assertThat(model.winProbability(even, even)).isCloseTo(0.5, within(1e-9));
        assertThat(model.winProbability(new Rating(30, 3), new Rating(20, 3))).isGreaterThan(0.85);
    }

    @Test
    void driftGrowsUncertaintyUpToUnknown() {
        Rating r = new Rating(25, 2);
        assertThat(model.drift(r, Duration.ofDays(70)).sigma()).isGreaterThan(2);
        assertThat(model.drift(r, Duration.ofDays(70_000)).sigma()).isEqualTo(WengLinBradleyTerry.SIGMA);
        assertThat(model.drift(r, Duration.ZERO).sigma()).isEqualTo(2);
        assertThat(model.unknown()).isEqualTo(new Rating(25, 25.0 / 3));
    }
}
