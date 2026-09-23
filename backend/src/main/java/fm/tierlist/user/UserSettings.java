package fm.tierlist.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "user_settings")
public class UserSettings {

    @Id
    @Column(name = "user_id")
    private String userId;

    @Column(nullable = false, length = 40)
    private String theme;

    @Column(nullable = false, length = 40)
    private String accent;

    @Column(name = "tier_palette", nullable = false, length = 40)
    private String tierPalette;

    @Column(name = "naming_template", nullable = false, length = 200)
    private String namingTemplate;

    @Column(name = "naming_migrating_from", length = 200)
    private String namingMigratingFrom;

    @Column(name = "duel_strategy", nullable = false, length = 40)
    private String duelStrategy;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected UserSettings() {
    }

    public UserSettings(String userId) {
        this.userId = userId;
    }

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = OffsetDateTime.now();
    }

    public SettingsDto toDto() {
        return new SettingsDto(theme, accent, tierPalette, namingTemplate, namingMigratingFrom, duelStrategy);
    }

    public void apply(SettingsDto dto) {
        theme = dto.theme();
        accent = dto.accent();
        tierPalette = dto.tierPalette();
        namingTemplate = dto.namingTemplate();
        namingMigratingFrom = dto.namingMigratingFrom();
        duelStrategy = dto.duelStrategy();
    }
}
