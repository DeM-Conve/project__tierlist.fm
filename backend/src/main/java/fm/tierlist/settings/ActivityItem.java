package fm.tierlist.settings;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

// The reorderable top group of the activity bar (the left icon strip) -
// frontend/src/store/appearanceSlice.js ACTIVITY_ITEMS. Constant names are the
// labels of the Postgres enum `activity_item` (V1; DUELS added by V2); `key` is the id
// the frontend uses, and what the API speaks. Declaration order is the default
// order.
public enum ActivityItem {
    HOME("home"),
    JUMP("jump"),
    BOARDS("boards"),
    PLAYLISTS("playlists"),
    ADD_SONGS("addSongs"),
    DUELS("duels");

    public static final List<ActivityItem> DEFAULT_ORDER = List.of(values());

    private final String key;

    ActivityItem(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    // The full order a (possibly partial) list stands for: its items first, as
    // given, then any it leaves out in default order - so an older client that
    // doesn't know a newer item still saves, and the new item lands at the end.
    // null = the default order. Duplicates (and nulls) are refused: which copy
    // would win is a guess (the wire contract reports them as a 400 first).
    public static List<ActivityItem> completeOrder(List<ActivityItem> order) {
        if (order == null) {
            return DEFAULT_ORDER;
        }
        Set<ActivityItem> seen = new LinkedHashSet<>();
        for (ActivityItem item : order) {
            if (!seen.add(Objects.requireNonNull(item, "activity item"))) {
                throw new IllegalArgumentException("activity item listed twice: " + item.key);
            }
        }
        List<ActivityItem> full = new ArrayList<>(seen);
        DEFAULT_ORDER.stream().filter(item -> !seen.contains(item)).forEach(full::add);
        return List.copyOf(full);
    }
}
