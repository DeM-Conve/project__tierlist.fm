package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.Objects;

// Settings -> Appearance. Each column is a native Postgres enum (NAMED_ENUM);
// `columnDefinition` names the type so `ddl-auto: validate` can match it.
@Embeddable
public record Appearance(
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "theme", nullable = false, columnDefinition = "theme_option")
    Theme theme,

    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "accent", nullable = false, columnDefinition = "accent_option")
    Accent accent,

    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "tier_palette", nullable = false, columnDefinition = "tier_palette_option")
    TierPalette tierPalette
) {
    public Appearance {
        Objects.requireNonNull(theme, "theme");
        Objects.requireNonNull(accent, "accent");
        Objects.requireNonNull(tierPalette, "tierPalette");
    }
}
