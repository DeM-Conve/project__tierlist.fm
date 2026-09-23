package fm.tierlist.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

// The settings the frontend syncs (see frontend/src/api/useSettingsSync.js).
// Option keys (theme names, strategies, ...) are defined by the frontend, so
// they're checked for shape here, not against a duplicated list.
public record SettingsDto(
    @NotBlank @Size(max = 40) @Pattern(regexp = KEY) String theme,
    @NotBlank @Size(max = 40) @Pattern(regexp = KEY) String accent,
    @NotBlank @Size(max = 40) @Pattern(regexp = KEY) String tierPalette,
    @NotBlank @Size(max = 200) String namingTemplate,
    @Size(max = 200) String namingMigratingFrom,
    @NotBlank @Size(max = 40) @Pattern(regexp = KEY) String duelStrategy
) {
    static final String KEY = "[A-Za-z0-9_-]+";
}
