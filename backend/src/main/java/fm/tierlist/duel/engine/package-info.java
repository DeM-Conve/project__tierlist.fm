/**
 * The duel ranking engine - every algorithm behind Duel lives here and only
 * here. Plain Java: no Spring, no JPA, no HTTP; it takes the board and the duel
 * log as values and returns values, so it is unit-testable and swappable.
 *
 * <p>Four pluggable parts (Strategy pattern), composed by {@link DuelEngine}
 * (Facade, built with {@link DuelEngine.Builder}):
 * <ol>
 *   <li>{@link RatingModel} - a score and an uncertainty per song, updated
 *       after every duel ({@link WengLinBradleyTerry}, OpenSkill's Weng-Lin
 *       model), plus a {@link Refitter} that re-estimates every score from the
 *       whole log at once ({@link DavidsonBradleyTerryRefit}).</li>
 *   <li>{@link TierModel} - from score to tier: cutpoints learned from where
 *       the user already put songs ({@link OrdinalProbitTierModel}).</li>
 *   <li>{@link fm.tierlist.duel.engine.pairing.PairingStrategy} - which duel
 *       next, one strategy per {@link fm.tierlist.duel.engine.pairing.Focus}.</li>
 *   <li>{@link fm.tierlist.duel.engine.policy.SuggestionPolicy} - when a move
 *       is suggested: a composite of
 *       {@link fm.tierlist.duel.engine.policy.SuggestionRule}s.</li>
 * </ol>
 * Plus a {@link TierOrderPolicy} ({@link ConfidentSwapOrder}) for order within a tier.
 * The duel log is the source of truth (event sourcing): every score is rebuilt
 * from the starting scores ({@link PriorPolicy}) plus the log.
 */
package fm.tierlist.duel.engine;
