package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Stream;

// Settings -> Duels. `tierBorders`: learned or the user's own; the four
// minimums are each ranked tier's lowest score on the shown scale
// (fm.tierlist.duel.engine.ScoreScale) - D is everything below C's. All four
// or none; required for CUSTOM, kept (unused) under LEARNED so switching
// back restores them. Same rules as V3's CHECKs.
@Embeddable
public record DuelSettings(
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "duel_tier_borders", nullable = false, columnDefinition = "duel_tier_borders")
    TierBorderMode tierBorders,

    @Column(name = "duel_tier_s_min") Integer sMin,
    @Column(name = "duel_tier_a_min") Integer aMin,
    @Column(name = "duel_tier_b_min") Integer bMin,
    @Column(name = "duel_tier_c_min") Integer cMin
) {
    public static final int MIN_SCORE = 0;
    public static final int MAX_SCORE = 1000;
    public static final DuelSettings DEFAULT = new DuelSettings(TierBorderMode.LEARNED, null, null, null, null);

    public DuelSettings {
        Objects.requireNonNull(tierBorders, "tierBorders");
        long set = Stream.of(sMin, aMin, bMin, cMin).filter(Objects::nonNull).count();
        if (set != 0 && set != 4) throw new IllegalArgumentException("Set every tier's minimum, or none");
        if (tierBorders == TierBorderMode.CUSTOM && set == 0) throw new IllegalArgumentException("Your own ranges need every tier's minimum");
        if (set == 4 && !validMinimums(sMin, aMin, bMin, cMin)) {
            throw new IllegalArgumentException("Tier minimums must go down tier by tier, between " + MIN_SCORE + " and " + MAX_SCORE);
        }
    }

    static boolean validMinimums(int s, int a, int b, int c) {
        return s > a && a > b && b > c && c >= MIN_SCORE && s <= MAX_SCORE;
    }

    // The user's own minimums by tier id (S..C), when they are in use.
    public Optional<Map<String, Integer>> customMinimums() {
        if (tierBorders != TierBorderMode.CUSTOM) return Optional.empty();
        Map<String, Integer> out = new LinkedHashMap<>();
        out.put("S", sMin);
        out.put("A", aMin);
        out.put("B", bMin);
        out.put("C", cMin);
        return Optional.of(out);
    }
}
