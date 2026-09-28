package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

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

    // tierLabels: what each tier is called, keyed by the frontend's tier ids.
    // migratingFrom + migratingFromTierLabels: the previous naming while a
    // rename job is unfinished (both set, or both null).
    // todoLinks: YouTube playlist id -> board (category) name.
    public record NamingDto(
        @NotNull @NamingTemplate String template,
        @Valid @NotNull TierLabelsDto tierLabels,
        @Valid TierDisplayNamesDto tierDisplayNames,
        @NamingTemplate String migratingFrom,
        @Valid TierLabelsDto migratingFromTierLabels,
        @NotNull @Size(max = 500) Map<
            @Pattern(regexp = "^[A-Za-z0-9_-]{1,64}$") String,
            @NotBlank @Size(max = NamingTemplate.MAX_LENGTH) String> todoLinks
    ) {

        @AssertTrue(message = "migratingFrom and migratingFromTierLabels must both be set or both be null")
        boolean isMigrationComplete() {
            return (migratingFrom == null) == (migratingFromTierLabels == null);
        }

        @AssertTrue(message = "the naming being migrated from must differ from the current one")
        boolean isMigratingFromDistinct() {
            return migratingFrom == null
                || !(migratingFrom.equals(template) && migratingFromTierLabels.equals(tierLabels));
        }
    }

    // What the app shows per tier; each optional (null = the tier's name).
    // Unlike the names themselves they may repeat - they're never matched.
    public record TierDisplayNamesDto(
        @JsonProperty("S") @TierLabel String s,
        @JsonProperty("A") @TierLabel String a,
        @JsonProperty("B") @TierLabel String b,
        @JsonProperty("C") @TierLabel String c,
        @JsonProperty("D") @TierLabel String d,
        @JsonProperty("TODO") @TierLabel String todo
    ) {
        static TierDisplayNamesDto from(TierDisplayNames n) {
            return new TierDisplayNamesDto(n.s(), n.a(), n.b(), n.c(), n.d(), n.todo());
        }

        TierDisplayNames toTierDisplayNames() {
            return new TierDisplayNames(s, a, b, c, d, todo);
        }
    }

    // Keys are the frontend's tier ids (tiers.js TIER_ORDER + TODO_TIER).
    public record TierLabelsDto(
        @JsonProperty("S") @NotNull @TierLabel String s,
        @JsonProperty("A") @NotNull @TierLabel String a,
        @JsonProperty("B") @NotNull @TierLabel String b,
        @JsonProperty("C") @NotNull @TierLabel String c,
        @JsonProperty("D") @NotNull @TierLabel String d,
        @JsonProperty("TODO") @NotNull @TierLabel String todo
    ) {

        // Two tiers with the same name (case and symbols aside) would be
        // indistinguishable in a playlist name.
        @AssertTrue(message = "tier names must all differ")
        boolean isDistinct() {
            List<String> all = Stream.of(s, a, b, c, d, todo).filter(Objects::nonNull).map(TierLabelValidator::words).toList();
            return all.stream().distinct().count() == all.size();
        }

        static TierLabelsDto from(TierLabels l) {
            return l == null ? null : new TierLabelsDto(l.s(), l.a(), l.b(), l.c(), l.d(), l.todo());
        }

        TierLabels toTierLabels() {
            return new TierLabels(s, a, b, c, d, todo);
        }
    }

    public record PrefsDto(@NotNull DuelStrategy duelStrategy) {
    }

    public static SettingsDto from(UserSettings row) {
        Appearance a = row.getAppearance();
        Naming n = row.getNaming();
        return new SettingsDto(
            new AppearanceDto(a.theme(), a.accent(), a.tierPalette()),
            new NamingDto(n.template(), TierLabelsDto.from(n.tierLabels()), TierDisplayNamesDto.from(n.tierDisplayNames()),
                n.migratingFrom(),
                TierLabelsDto.from(n.migratingFromTierLabels()), row.getTodoLinks()),
            new PrefsDto(row.getPrefs().duelStrategy())
        );
    }

    public Appearance toAppearance() {
        return new Appearance(appearance.theme(), appearance.accent(), appearance.tierPalette());
    }

    public Naming toNaming() {
        return new Naming(naming.template(), naming.tierLabels().toTierLabels(),
            naming.tierDisplayNames() == null ? TierDisplayNames.NONE : naming.tierDisplayNames().toTierDisplayNames(),
            naming.migratingFrom(),
            naming.migratingFromTierLabels() == null ? null : naming.migratingFromTierLabels().toTierLabels());
    }

    public Map<String, String> toTodoLinks() {
        return Map.copyOf(naming.todoLinks());
    }

    public Prefs toPrefs() {
        return new Prefs(prefs.duelStrategy());
    }
}
