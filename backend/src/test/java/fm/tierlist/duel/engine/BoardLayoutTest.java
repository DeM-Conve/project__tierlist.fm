package fm.tierlist.duel.engine;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class BoardLayoutTest {

    private final BoardLayout b = new BoardLayout(List.of("S", "A"), "TODO",
        Map.of("S", List.of("s1"), "A", List.of("a1", "a2", "s1"), "TODO", List.of("t1")));

    @Test
    void rankedUnrankedAndTiers() {
        assertThat(b.ranked()).containsExactly("s1", "a1", "a2", "s1");
        assertThat(b.unranked()).containsExactly("t1");
        assertThat(b.songsIn("B")).isEmpty();
        assertThat(b.tierOf()).containsEntry("s1", "S").containsEntry("t1", "TODO");
    }

    @Test
    void ranksAndNulls() {
        assertThat(b.rankOf("A")).contains(1);
        assertThat(b.rankOf("TODO")).isEmpty();
        assertThat(b.rankOf(null)).isEmpty();
        assertThat(b.isRanked("S")).isTrue();
        assertThat(b.isRanked("TODO")).isFalse();
        assertThat(b.isRanked(null)).isFalse();
    }

    @Test
    void noToDoListAndDefensiveCopies() {
        List<String> ids = new ArrayList<>(List.of("x"));
        BoardLayout plain = new BoardLayout(List.of("S"), null, Map.of("S", ids));
        ids.add("y");
        assertThat(plain.unranked()).isEmpty();
        assertThat(plain.songsIn("S")).containsExactly("x");
    }
}
