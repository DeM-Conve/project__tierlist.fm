package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.util.Objects;

// What each tier is called (Settings -> Playlist naming -> Tier names):
// the five ranked tiers best first, then the to-do list. The slots are fixed
// (frontend/src/tiers.js TIER_ORDER + TODO_TIER); the names are the user's.
// Column names here are the current ones; Naming overrides them for the
// copy a half-finished rename is migrating away from.
@Embeddable
public record TierLabels(
    @Column(name = "naming_tier_s", length = TierLabel.MAX_LENGTH) String s,
    @Column(name = "naming_tier_a", length = TierLabel.MAX_LENGTH) String a,
    @Column(name = "naming_tier_b", length = TierLabel.MAX_LENGTH) String b,
    @Column(name = "naming_tier_c", length = TierLabel.MAX_LENGTH) String c,
    @Column(name = "naming_tier_d", length = TierLabel.MAX_LENGTH) String d,
    @Column(name = "naming_tier_todo", length = TierLabel.MAX_LENGTH) String todo
) {
    public TierLabels {
        Objects.requireNonNull(s, "s");
        Objects.requireNonNull(a, "a");
        Objects.requireNonNull(b, "b");
        Objects.requireNonNull(c, "c");
        Objects.requireNonNull(d, "d");
        Objects.requireNonNull(todo, "todo");
    }
}
