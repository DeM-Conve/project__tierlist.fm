package fm.tierlist.settings;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

import java.util.Objects;

// The API contract for GET/PUT /api/settings, grouped like the frontend's
// slices (appearance / naming / prefs - see frontend/src/api/settingsMapping.js).
// Enums (de)serialise as their frontend keys, so an unknown theme, accent,
// palette or strategy is a 400 before it gets anywhere near the database.
// Kept separate from the @Embeddable value objects so the wire format and
// the table can evolve independently; conversion lives here, pointing inward.
public record SettingsDto(
    @Valid @NotNull AppearanceDto appearance,
    @Valid @NotNull NamingDto naming,
    @Valid @NotNull PrefsDto prefs
) {

    public record AppearanceDto(@NotNull Theme theme, @NotNull Accent accent, @NotNull TierPalette tierPalette) {
    }

    public record NamingDto(@NotNull @NamingTemplate String template, @NamingTemplate String migratingFrom) {

        @AssertTrue(message = "migratingFrom must differ from template")
        boolean isMigratingFromDistinct() {
            return !Objects.equals(template, migratingFrom);
        }
    }

    public record PrefsDto(@NotNull DuelStrategy duelStrategy, @NotNull BoardDensity boardDensity) {
    }

    public static SettingsDto from(UserSettings row) {
        Appearance a = row.getAppearance();
        Naming n = row.getNaming();
        return new SettingsDto(
            new AppearanceDto(a.theme(), a.accent(), a.tierPalette()),
            new NamingDto(n.template(), n.migratingFrom()),
            new PrefsDto(row.getPrefs().duelStrategy(), row.getPrefs().boardDensity())
        );
    }

    public Appearance toAppearance() {
        return new Appearance(appearance.theme(), appearance.accent(), appearance.tierPalette());
    }

    public Naming toNaming() {
        return new Naming(naming.template(), naming.migratingFrom());
    }

    public Prefs toPrefs() {
        return new Prefs(prefs.duelStrategy(), prefs.boardDensity());
    }
}
