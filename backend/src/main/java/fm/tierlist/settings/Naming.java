package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.util.Objects;

// Settings -> Playlist naming (frontend/src/naming.js). `migratingFrom` is the
// previous template while a rename job is unfinished, else null.
// `todoKeyword` marks a playlist as a board's to-do list (frontend/src/todoLists.js);
// the explicit playlist -> board links live on UserSettings (their own table).
@Embeddable
public record Naming(
    @Column(name = "naming_template", nullable = false, length = NamingTemplate.MAX_LENGTH)
    String template,

    @Column(name = "naming_migrating_from", length = NamingTemplate.MAX_LENGTH)
    String migratingFrom,

    @Column(name = "naming_todo_keyword", nullable = false, length = TodoKeyword.MAX_LENGTH)
    String todoKeyword
) {
    public Naming {
        Objects.requireNonNull(template, "template");
        Objects.requireNonNull(todoKeyword, "todoKeyword");
    }
}
