package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RatingTest {
    @Test
    void validatesAndCopies() {
        assertThatThrownBy(() -> new Rating(1, 0)).isInstanceOf(IllegalArgumentException.class);
        Rating r = new Rating(3, 2);
        assertThat(r.variance()).isEqualTo(4);
        assertThat(r.withMu(7)).isEqualTo(new Rating(7, 2));
    }
}
