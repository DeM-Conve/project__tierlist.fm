package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

// One row per user (`user_settings`). Grouped into the same value objects the
// frontend has slices for, so each group can grow without touching the others.
@Entity
@Table(name = "user_settings")
public class UserSettings {

    @Id
    @Column(name = "user_id")
    private String userId;

    @Embedded
    private Appearance appearance;

    @Embedded
    private Naming naming;

    @Embedded
    private Prefs prefs;

    // Optimistic lock + ETag. A wrapper type so Spring Data treats a fresh
    // entity (null version) as new and INSERTs it instead of merging.
    @Version
    private Long version;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected UserSettings() {
    }

    UserSettings(String userId, Appearance appearance, Naming naming, Prefs prefs) {
        this.userId = userId;
        replace(appearance, naming, prefs);
    }

    void replace(Appearance appearance, Naming naming, Prefs prefs) {
        this.appearance = appearance;
        this.naming = naming;
        this.prefs = prefs;
    }

    public String getUserId() {
        return userId;
    }

    public Appearance getAppearance() {
        return appearance;
    }

    public Naming getNaming() {
        return naming;
    }

    public Prefs getPrefs() {
        return prefs;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
