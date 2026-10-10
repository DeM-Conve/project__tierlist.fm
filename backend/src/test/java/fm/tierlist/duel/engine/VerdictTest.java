package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VerdictTest {

    @Test
    void scoresAndWeights() {
        assertThat(Verdict.A_CLEARLY.scoreA()).isEqualTo(1.0);
        assertThat(Verdict.A_CLEARLY.weight()).isEqualTo(2);
        assertThat(Verdict.TOO_CLOSE.scoreA()).isEqualTo(0.5);
        assertThat(Verdict.B.weight()).isEqualTo(1);
    }

    @Test
    void signFromEitherSide() {
        assertThat(Verdict.A.signFor(true)).isEqualTo(1);
        assertThat(Verdict.A.signFor(false)).isEqualTo(-1);
        assertThat(Verdict.B_CLEARLY.signFor(true)).isEqualTo(-1);
        assertThat(Verdict.TOO_CLOSE.signFor(false)).isZero();
    }

    @Test
    void duelHelpers() {
        Duel d = Boards.duel(1, "aaaaaaaaaaa", "bbbbbbbbbbb", Verdict.B);
        assertThat(d.opponentOf("aaaaaaaaaaa")).isEqualTo("bbbbbbbbbbb");
        assertThat(d.resultFor("bbbbbbbbbbb")).isEqualTo(1);
        assertThat(d.samePair("bbbbbbbbbbb", "aaaaaaaaaaa")).isTrue();
        assertThat(d.involves("ccccccccccc")).isFalse();
    }
}
