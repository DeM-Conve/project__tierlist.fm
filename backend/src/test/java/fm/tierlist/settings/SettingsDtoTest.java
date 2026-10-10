package fm.tierlist.settings;

import fm.tierlist.settings.SettingsDto.AppearanceDto;
import fm.tierlist.settings.SettingsDto.NamingDto;
import fm.tierlist.settings.SettingsDto.TierDisplayNamesDto;
import fm.tierlist.settings.SettingsDto.TierLabelsDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// The wire contract: conversions both ways, its JSON shape, and every
// Bean Validation rule on it (what turns a bad PUT into a 400).
class SettingsDtoTest {

    private static jakarta.validation.ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void validator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void close() {
        factory.close();
    }

    private static final TierLabelsDto DEFAULT = new TierLabelsDto("S", "A", "B", "C", "D", "TODO");
    private static final TierLabelsDto MINE = new TierLabelsDto("T1", "T2", "T3", "TE", "TZ", "(**TODO**)");

    private static NamingDto naming(String template, TierLabelsDto labels, String migratingFrom, TierLabelsDto migratingLabels,
                                    Map<String, String> links) {
        return new NamingDto(template, labels, null, migratingFrom, migratingLabels, links);
    }

    private static SettingsDto dto(NamingDto naming) {
        return new SettingsDto(new AppearanceDto(Theme.DRACULA, Accent.TEAL, TierPalette.CLASSIC), naming);
    }

    private static Set<String> violations(Object o) {
        return validator.validate(o).stream()
            .map(v -> v.getPropertyPath() + ": " + v.getMessage())
            .collect(Collectors.toSet());
    }

    // ---- conversions --------------------------------------------------------

    @Test
    void domainToDtoAndBackIsLossless() {
        Naming naming = new Naming("[{tag}] {category} {tier}", new TierLabels("T1", "T2", "T3", "TE", "TZ", "(**TODO**)"),
            new TierDisplayNames("S", null, null, null, null, "TODO"),
            "{category} {tier}", new TierLabels("S", "A", "B", "C", "D", "TODO"));
        UserSettings row = new UserSettings("alice", new Appearance(Theme.SAND, Accent.AMBER, TierPalette.HEAT), naming,
            Map.of("PLabc", "Rap"));

        SettingsDto dto = SettingsDto.from(row);

        assertThat(dto.appearance()).isEqualTo(new AppearanceDto(Theme.SAND, Accent.AMBER, TierPalette.HEAT));
        assertThat(dto.naming().template()).isEqualTo("[{tag}] {category} {tier}");
        assertThat(dto.naming().tierLabels()).isEqualTo(MINE);
        assertThat(dto.naming().tierDisplayNames()).isEqualTo(new TierDisplayNamesDto("S", null, null, null, null, "TODO"));
        assertThat(dto.naming().migratingFrom()).isEqualTo("{category} {tier}");
        assertThat(dto.naming().migratingFromTierLabels()).isEqualTo(DEFAULT);
        assertThat(dto.naming().todoLinks()).containsExactly(Map.entry("PLabc", "Rap"));

        assertThat(dto.toAppearance()).isEqualTo(row.getAppearance());
        assertThat(dto.toNaming()).isEqualTo(naming);
        assertThat(dto.toTodoLinks()).isEqualTo(row.getTodoLinks());
    }

    @Test
    void noMigrationAndNoShownNamesConvertToNullAndNone() {
        SettingsDto dto = dto(naming("{category} {tier}", DEFAULT, null, null, Map.of()));

        Naming naming = dto.toNaming();
        assertThat(naming.migratingFrom()).isNull();
        assertThat(naming.migratingFromTierLabels()).isNull();
        assertThat(naming.tierDisplayNames()).isEqualTo(TierDisplayNames.NONE);

        UserSettings row = new UserSettings("bob", dto.toAppearance(), naming, dto.toTodoLinks());
        SettingsDto back = SettingsDto.from(row);
        assertThat(back.naming().migratingFromTierLabels()).isNull();
        assertThat(back.naming().tierDisplayNames()).isEqualTo(new TierDisplayNamesDto(null, null, null, null, null, null));
        assertThat(back).isEqualTo(new SettingsDto(dto.appearance(),
            new NamingDto("{category} {tier}", DEFAULT, new TierDisplayNamesDto(null, null, null, null, null, null), null, null, Map.of())));
    }

    @Test
    void todoLinksAreCopiedNotShared() {
        Map<String, String> links = new HashMap<>(Map.of("PL1", "Rap"));
        SettingsDto dto = dto(naming("{category} {tier}", DEFAULT, null, null, links));

        Map<String, String> copy = dto.toTodoLinks();
        links.put("PL2", "Jazz");

        assertThat(copy).containsOnlyKeys("PL1");
        assertThatThrownBy(() -> copy.put("PL3", "x")).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void jsonUsesFrontendKeysAndTierIds() throws Exception {
        ObjectMapper json = new ObjectMapper();
        SettingsDto dto = new SettingsDto(new AppearanceDto(Theme.TOKYO, Accent.BLUE, TierPalette.VIVID),
            new NamingDto("{category} {tier}", MINE, new TierDisplayNamesDto(null, null, null, null, null, "TODO"), null, null,
                Map.of("PL1", "Rap")));

        JsonNode tree = json.valueToTree(dto);

        assertThat(tree.at("/appearance/theme").asText()).isEqualTo("tokyo");
        assertThat(tree.at("/appearance/accent").asText()).isEqualTo("blue");
        assertThat(tree.at("/appearance/tierPalette").asText()).isEqualTo("vivid");
        assertThat(tree.at("/naming/tierLabels").fieldNames()).toIterable().containsExactly("S", "A", "B", "C", "D", "TODO");
        assertThat(tree.at("/naming/tierLabels/TODO").asText()).isEqualTo("(**TODO**)");
        assertThat(tree.at("/naming/tierDisplayNames/TODO").asText()).isEqualTo("TODO");
        assertThat(tree.at("/naming/todoLinks/PL1").asText()).isEqualTo("Rap");
        // No helper getters leak into the contract.
        assertThat(tree.at("/naming").has("migrationComplete")).isFalse();
        assertThat(tree.at("/naming/tierLabels").has("distinct")).isFalse();

        assertThat(json.readValue(json.writeValueAsString(dto), SettingsDto.class)).isEqualTo(dto);
    }

    // ---- validation ---------------------------------------------------------

    @Test
    void aCompleteSettingsBodyIsValid() {
        assertThat(violations(dto(naming("[{tag}] {category} {tier}", MINE, "{category} {tier}", DEFAULT,
            Map.of("PLabc_-9", "Rap"))))).isEmpty();
    }

    @Test
    void everyGroupIsRequired() {
        assertThat(violations(new SettingsDto(null, null)))
            .containsExactlyInAnyOrder("appearance: must not be null", "naming: must not be null");
        assertThat(violations(new AppearanceDto(null, null, null))).hasSize(3);
    }

    @Test
    void namingNeedsATemplateTierNamesAndLinks() {
        assertThat(violations(new NamingDto(null, null, null, null, null, null)))
            .containsExactlyInAnyOrder("template: must not be null", "tierLabels: must not be null", "todoLinks: must not be null");
    }

    @Test
    void validationCascadesIntoEveryNestedGroup() {
        SettingsDto bad = new SettingsDto(new AppearanceDto(null, Accent.BLUE, TierPalette.VIVID),
            new NamingDto("{category}", new TierLabelsDto("S", "A", "B", "C", "D", null),
                new TierDisplayNamesDto(" x", null, null, null, null, null), null, null, Map.of()));

        assertThat(violations(bad)).containsExactlyInAnyOrder(
            "appearance.theme: must not be null",
            "naming.template: must use {category} and {tier} once each, and other tokens ({word}) at most once each",
            "naming.tierLabels.todo: must not be null",
            "naming.tierDisplayNames.s: must be at most 20 characters with a letter or digit, and no { } or surrounding spaces");
    }

    @Test
    void tierNamesMustDifferInTheirWords() {
        assertThat(violations(new TierLabelsDto("S", "s", "B", "C", "D", "TODO"))).containsExactly("distinct: tier names must all differ");
        assertThat(violations(new TierLabelsDto("S", "A", "B", "C", "D", "(**s**)"))).containsExactly("distinct: tier names must all differ");
        assertThat(violations(new TierLabelsDto("To do", "A", "B", "C", "D", "to-do"))).containsExactly("distinct: tier names must all differ");
        assertThat(violations(new TierLabelsDto("À", "A", "B", "C", "D", "TODO"))).containsExactly("distinct: tier names must all differ");
        assertThat(violations(MINE)).isEmpty();
        // A missing one is @NotNull's to report, not a distinctness failure.
        assertThat(violations(new TierLabelsDto("S", "A", "B", "C", "D", null))).containsExactly("todo: must not be null");
    }

    @Test
    void shownNamesMayRepeatAndBeAbsent() {
        assertThat(violations(new TierDisplayNamesDto("S", "S", "S", null, null, null))).isEmpty();
        assertThat(violations(new TierDisplayNamesDto(null, null, null, null, null, "{tier}"))).hasSize(1);
    }

    @Test
    void aMigrationIsAllOrNothing() {
        assertThat(violations(naming("{category} {tier}", MINE, "{category} - {tier}", null, Map.of())))
            .containsExactly("migrationComplete: migratingFrom and migratingFromTierLabels must both be set or both be null");
        assertThat(violations(naming("{category} {tier}", MINE, null, DEFAULT, Map.of())))
            .containsExactly("migrationComplete: migratingFrom and migratingFromTierLabels must both be set or both be null");
        assertThat(violations(naming("{category} {tier}", MINE, "{category} {tier}", DEFAULT, Map.of()))).isEmpty();
    }

    @Test
    void theNamingMigratedFromMustDifferFromTheCurrentOne() {
        assertThat(violations(naming("{category} {tier}", DEFAULT, "{category} {tier}", DEFAULT, Map.of())))
            .containsExactly("migratingFromDistinct: the naming being migrated from must differ from the current one");
        // A different template with the same names is a real migration.
        assertThat(violations(naming("[{tag}] {category} {tier}", DEFAULT, "{category} {tier}", DEFAULT, Map.of()))).isEmpty();
    }

    @Test
    void theNamingMigratedFromIsValidatedLikeTheCurrentOne() {
        assertThat(violations(naming("{category} {tier}", MINE, "{category} only", DEFAULT, Map.of())))
            .containsExactly("migratingFrom: must use {category} and {tier} once each, and other tokens ({word}) at most once each");
        assertThat(violations(naming("{category} {tier}", MINE, "{category} - {tier}", new TierLabelsDto("S", "S", "B", "C", "D", "TODO"),
            Map.of()))).containsExactly("migratingFromTierLabels.distinct: tier names must all differ");
    }

    @Test
    @Disabled("BUG: isMigratingFromDistinct() dereferences migratingFromTierLabels without a null check. A body whose "
        + "migratingFrom equals the current template but has migratingFromTierLabels: null (half a migration) throws a "
        + "NullPointerException inside Bean Validation (jakarta.validation.ValidationException) instead of reporting "
        + "the isMigrationComplete violation - the PUT becomes a 500, not a 400. See SettingsApiIT for the HTTP side.")
    void halfAMigrationFromTheCurrentTemplateIsAViolationNotACrash() {
        Set<ConstraintViolation<NamingDto>> result =
            validator.validate(naming("{category} {tier}", DEFAULT, "{category} {tier}", null, Map.of()));

        assertThat(result).extracting(v -> v.getPropertyPath().toString()).contains("migrationComplete");
    }

    @Test
    void todoLinkIdsAndBoardsAreChecked() {
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, Map.of("bad id!", "Rap")))).hasSize(1);
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, Map.of("x".repeat(65), "Rap")))).hasSize(1);
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, Map.of("x".repeat(64), "Rap")))).isEmpty();
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, Map.of("PL1", " ")))).hasSize(1);
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, Map.of("PL1", "r".repeat(201))))).hasSize(1);
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, Map.of("PL1", "r".repeat(200))))).isEmpty();
    }

    @Test
    void atMost500TodoLinks() {
        Map<String, String> links = IntStream.range(0, 501).boxed().collect(Collectors.toMap(i -> "PL" + i, i -> "Rap"));
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, links))).hasSize(1);
        links.remove("PL0");
        assertThat(violations(naming("{category} {tier}", DEFAULT, null, null, links))).isEmpty();
    }
}
