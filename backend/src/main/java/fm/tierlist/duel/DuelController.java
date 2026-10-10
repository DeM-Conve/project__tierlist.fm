package fm.tierlist.duel;

import fm.tierlist.duel.DuelDtos.AnalysisDto;
import fm.tierlist.duel.DuelDtos.DecisionRequest;
import fm.tierlist.duel.DuelDtos.LayoutRequest;
import fm.tierlist.duel.DuelDtos.SessionDto;
import fm.tierlist.duel.DuelDtos.SkipRequest;
import fm.tierlist.duel.DuelDtos.StartRequest;
import fm.tierlist.duel.DuelDtos.SummaryDto;
import fm.tierlist.duel.DuelDtos.VerdictRequest;
import fm.tierlist.user.AppUserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Duels on one of the signed-in user's boards. HTTP only - DuelService does
// the work, fm.tierlist.duel.engine the ranking. Reads are POSTs because they
// carry the board as the browser has it (staged, unpushed edits included).
@RestController
@RequestMapping("/api/duels/{board}")
public class DuelController {

    private final AppUserService users;
    private final DuelService duels;

    public DuelController(AppUserService users, DuelService duels) {
        this.users = users;
        this.duels = duels;
    }

    private String user(Authentication auth) {
        return users.current(auth).getId();
    }

    // The board was renamed (its playlists, on YouTube): move its duel history.
    @PostMapping("/rename")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rename(@PathVariable String board, @Valid @RequestBody DuelDtos.RenameRequest req, Authentication auth) {
        duels.renameBoard(user(auth), DuelService.requireBoard(board), req.to());
    }

    // Board certainty, the score map, suggested moves, tier orders.
    @PostMapping("/analysis")
    public AnalysisDto analysis(@PathVariable String board, @Valid @RequestBody LayoutRequest req, Authentication auth) {
        return duels.analyze(user(auth), DuelService.requireBoard(board), req.layout().toLayout());
    }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionDto start(@PathVariable String board, @Valid @RequestBody StartRequest req, Authentication auth) {
        return duels.start(user(auth), DuelService.requireBoard(board), req);
    }

    // The session as it stands, with the next duel (resuming after a reload).
    @PostMapping("/sessions/{id}")
    public SessionDto session(@PathVariable String board, @PathVariable UUID id, @Valid @RequestBody LayoutRequest req, Authentication auth) {
        return duels.resume(user(auth), DuelService.requireBoard(board), id, req.layout().toLayout());
    }

    @PostMapping("/sessions/{id}/verdicts")
    public SessionDto verdict(@PathVariable String board, @PathVariable UUID id, @Valid @RequestBody VerdictRequest req, Authentication auth) {
        return duels.verdict(user(auth), DuelService.requireBoard(board), id, req);
    }

    @PostMapping("/sessions/{id}/skips")
    public SessionDto skip(@PathVariable String board, @PathVariable UUID id, @Valid @RequestBody SkipRequest req, Authentication auth) {
        return duels.skip(user(auth), DuelService.requireBoard(board), id, req);
    }

    @PostMapping("/sessions/{id}/undo")
    public SessionDto undo(@PathVariable String board, @PathVariable UUID id, @Valid @RequestBody DuelDtos.UndoRequest req, Authentication auth) {
        return duels.undo(user(auth), DuelService.requireBoard(board), id, req);
    }

    @PostMapping("/sessions/{id}/end")
    public SummaryDto end(@PathVariable String board, @PathVariable UUID id, @Valid @RequestBody LayoutRequest req, Authentication auth) {
        return duels.end(user(auth), DuelService.requireBoard(board), id, req.layout().toLayout());
    }

    @PutMapping("/decisions/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decide(@PathVariable String board, @PathVariable String videoId, @Valid @RequestBody DecisionRequest req, Authentication auth) {
        duels.decide(user(auth), DuelService.requireBoard(board), videoId, req);
    }

    @DeleteMapping("/decisions/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void undoDecision(@PathVariable String board, @PathVariable String videoId, Authentication auth) {
        duels.undoDecision(user(auth), DuelService.requireBoard(board), videoId);
    }

    @PutMapping("/locks/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void lock(@PathVariable String board, @PathVariable String videoId, Authentication auth) {
        duels.lock(user(auth), DuelService.requireBoard(board), videoId);
    }

    @DeleteMapping("/locks/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlock(@PathVariable String board, @PathVariable String videoId, Authentication auth) {
        duels.unlock(user(auth), DuelService.requireBoard(board), videoId);
    }
}
