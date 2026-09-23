package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.util.Objects;

// Settings -> Playlist naming (frontend/src/naming.js). `migratingFrom` is the
// previous template while a rename job is unfinished, else null.
@Embeddable
public record Naming(
    @Column(name = "naming_template", nullable = false, length = NamingTemplate.MAX_LENGTH)
    String template,

    @Column(name = "naming_migrating_from", length = NamingTemplate.MAX_LENGTH)
    String migratingFrom
) {
    public Naming {
        Objects.requireNonNull(template, "template");
    }
}
