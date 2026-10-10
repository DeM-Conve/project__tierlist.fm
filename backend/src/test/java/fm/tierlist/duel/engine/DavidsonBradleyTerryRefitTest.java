package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class DavidsonBradleyTerryRefitTest {

    private static final String X = "xxxxxxxxxxx";
    private static final String Y = "yyyyyyyyyyy";
    private static final String Z = "zzzzzzzzzzz";
    private final DavidsonBradleyTerryRefit refit = new DavidsonBradleyTerryRefit(DuelEngine.REFIT_SCALE, 0.99);
    private final Map<String, Rating> priors = Map.of(X, new Rating(25, 3.5), Y, new Rating(25, 3.5), Z, new Rating(25, 3.5));

    @Test
    void noDuelsKeepsPriors() {
        assertThat(refit.refit(List.of(), priors, Boards.T0)).containsEntry(X, new Rating(25, 3.5));
    }

    @Test
    void winnerEndsAboveLoserButFinite() {
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 6; i++) log.add(Boards.duel(i, X, Y, Verdict.A_CLEARLY));
        Map<String, Rating> mu = refit.refit(log, priors, Boards.T0);
        assertThat(mu.get(X).mu()).isGreaterThan(mu.get(Y).mu()).isLessThan(60);
        assertThat(mu.get(X).mu() - 25).isCloseTo(25 - mu.get(Y).mu(), within(1e-6));
        assertThat(mu.get(X).sigma()).isLessThan(3.5);
        assertThat(mu.get(Z).sigma()).isEqualTo(3.5);
    }

    @Test
    void drawsKeepEqualsEqual() {
        List<Duel> log = List.of(Boards.duel(1, X, Y, Verdict.TOO_CLOSE), Boards.duel(2, Y, X, Verdict.TOO_CLOSE));
        Map<String, Rating> mu = refit.refit(log, priors, Boards.T0);
        assertThat(mu.get(X).mu()).isCloseTo(mu.get(Y).mu(), within(1e-6));
    }

    @Test
    void orderDoesNotMatter() {
        List<Duel> log = new ArrayList<>();
        for (int i = 0; i < 9; i++) log.add(Boards.duel(i, i % 2 == 0 ? X : Y, i % 3 == 0 ? Z : (i % 2 == 0 ? Y : X), i % 4 == 0 ? Verdict.B : Verdict.A));
        Map<String, Rating> one = refit.refit(log, priors, Boards.T0.plusSeconds(100));
        List<Duel> shuffled = new ArrayList<>(log);
        Collections.shuffle(shuffled, new Random(3));
        Map<String, Rating> two = refit.refit(shuffled, priors, Boards.T0.plusSeconds(100));
        assertThat(one.get(X).mu()).isCloseTo(two.get(X).mu(), within(1e-6));
        assertThat(one.get(Z).mu()).isCloseTo(two.get(Z).mu(), within(1e-6));
    }

    @Test
    void oldDuelsCountLess() {
        List<Duel> log = List.of(Boards.duel(1, X, Y, Verdict.A_CLEARLY), Boards.duel(2, X, Y, Verdict.A_CLEARLY));
        double fresh = refit.refit(log, priors, Boards.T0).get(X).mu();
        double old = refit.refit(log, priors, Boards.T0.plus(Duration.ofDays(7 * 200))).get(X).mu();
        assertThat(old).isLessThan(fresh).isGreaterThan(25);
    }
}
