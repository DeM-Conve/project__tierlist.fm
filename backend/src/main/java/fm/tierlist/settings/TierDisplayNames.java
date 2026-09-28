package fm.tierlist.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

// What the app shows for each tier (Settings -> Playlist naming -> Tier names,
// "Shown as"), e.g. "TODO" for a to-do list named "(**TODO**)" in playlists.
// Each is optional: null = show the tier's name from TierLabels.
@Embeddable
public record TierDisplayNames(
    @Column(name = "naming_tier_s_shown", length = TierLabel.MAX_LENGTH) String s,
    @Column(name = "naming_tier_a_shown", length = TierLabel.MAX_LENGTH) String a,
    @Column(name = "naming_tier_b_shown", length = TierLabel.MAX_LENGTH) String b,
    @Column(name = "naming_tier_c_shown", length = TierLabel.MAX_LENGTH) String c,
    @Column(name = "naming_tier_d_shown", length = TierLabel.MAX_LENGTH) String d,
    @Column(name = "naming_tier_todo_shown", length = TierLabel.MAX_LENGTH) String todo
) {
    public static final TierDisplayNames NONE = new TierDisplayNames(null, null, null, null, null, null);
}
