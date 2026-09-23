package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.Objects;

// Behaviour preferences (Settings -> Duels, ...).
@Embeddable
public record Prefs(
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "duel_strategy", nullable = false, columnDefinition = "duel_strategy_option")
    DuelStrategy duelStrategy
) {
    public Prefs {
        Objects.requireNonNull(duelStrategy, "duelStrategy");
    }
}
