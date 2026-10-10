package fm.tierlist.duel.engine;

// What the user said about a suggested move. KEPT raises the bar for that song
// (see policy.KeepHysteresisRule); ACCEPTED is recorded for the history.
public record Decision(Kind kind, String from, String to, int duelsAtDecision) {
    public enum Kind { ACCEPTED, KEPT }
}
