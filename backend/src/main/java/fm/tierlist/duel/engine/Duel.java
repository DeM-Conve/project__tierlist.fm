package fm.tierlist.duel.engine;

import java.time.Instant;
import java.util.UUID;

// One entry of the duel log - the source of truth everything else is rebuilt
// from. `a` and `b` are video ids; the verdict is from a's side.
public record Duel(long id, UUID session, String a, String b, Verdict verdict, Instant at) {
    public boolean involves(String id) {
        return a.equals(id) || b.equals(id);
    }

    public String opponentOf(String id) {
        return a.equals(id) ? b : a;
    }

    // +1 win / 0 draw / -1 loss for `id`.
    public int resultFor(String id) {
        return verdict.signFor(a.equals(id));
    }

    public boolean samePair(String x, String y) {
        return (a.equals(x) && b.equals(y)) || (a.equals(y) && b.equals(x));
    }
}
