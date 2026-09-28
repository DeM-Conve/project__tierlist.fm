package fm.tierlist.settings;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Embedded;

import java.util.Objects;

// Settings -> Playlist naming (frontend/src/naming.js): the template and what
// each tier is called in playlist names, and what the app shows for each
// (`tierDisplayNames`, optional). `migratingFrom` / `migratingFromTierLabels` are the
// previous naming while a rename job is unfinished, else null. The explicit
// to-do playlist -> board links live on UserSettings (their own table).
@Embeddable
public record Naming(
    @Column(name = "naming_template", nullable = false, length = NamingTemplate.MAX_LENGTH)
    String template,

    @Embedded
    TierLabels tierLabels,

    // All null reads back as a null embeddable; the constructor maps it to NONE.
    @Embedded
    TierDisplayNames tierDisplayNames,

    @Column(name = "naming_migrating_from", length = NamingTemplate.MAX_LENGTH)
    String migratingFrom,

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "s", column = @Column(name = "naming_migrating_from_tier_s", length = TierLabel.MAX_LENGTH)),
        @AttributeOverride(name = "a", column = @Column(name = "naming_migrating_from_tier_a", length = TierLabel.MAX_LENGTH)),
        @AttributeOverride(name = "b", column = @Column(name = "naming_migrating_from_tier_b", length = TierLabel.MAX_LENGTH)),
        @AttributeOverride(name = "c", column = @Column(name = "naming_migrating_from_tier_c", length = TierLabel.MAX_LENGTH)),
        @AttributeOverride(name = "d", column = @Column(name = "naming_migrating_from_tier_d", length = TierLabel.MAX_LENGTH)),
        @AttributeOverride(name = "todo", column = @Column(name = "naming_migrating_from_tier_todo", length = TierLabel.MAX_LENGTH)),
    })
    TierLabels migratingFromTierLabels
) {
    public Naming {
        Objects.requireNonNull(template, "template");
        Objects.requireNonNull(tierLabels, "tierLabels");
        tierDisplayNames = tierDisplayNames == null ? TierDisplayNames.NONE : tierDisplayNames;
    }
}
