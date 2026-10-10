package fm.tierlist.duel;

import fm.tierlist.duel.engine.BoardLayout;
import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DuelDtosTest {

    private static Map<TierSlot, List<String>> tiers(Object... kv) {
        Map<TierSlot, List<String>> m = new EnumMap<>(TierSlot.class);
        for (int i = 0; i < kv.length; i += 2) m.put((TierSlot) kv[i], List.of(((String) kv[i + 1]).split(",")));
        return m;
    }

    @Test
    void layoutKeepsTierOrderAndTheToDoList() {
        BoardLayout l = new DuelDtos.LayoutDto(tiers(TierSlot.TODO, "ttttttttttt", TierSlot.B, "bbbbbbbbbbb", TierSlot.S, "sssssssssss")).toLayout();
        assertThat(l.rankedTiers()).containsExactly("S", "B");
        assertThat(l.unrankedTier()).isEqualTo("TODO");
        assertThat(l.unranked()).containsExactly("ttttttttttt");
    }

    @Test
    void noToDoListMeansNoUnrankedTier() {
        assertThat(new DuelDtos.LayoutDto(tiers(TierSlot.A, "aaaaaaaaaaa")).toLayout().unrankedTier()).isNull();
    }

    @Test
    void rejectsSomethingThatIsNotAVideoId() {
        assertThatThrownBy(() -> new DuelDtos.LayoutDto(tiers(TierSlot.A, "not an id")).toLayout())
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DuelService.requireVideoId(null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(DuelService.requireVideoId("aaaaaaaaaaa")).isEqualTo("aaaaaaaaaaa");
    }

    @Test
    void tierSlots() {
        assertThat(TierSlot.TODO.ranked()).isFalse();
        assertThat(TierSlot.D.ranked()).isTrue();
    }
}
