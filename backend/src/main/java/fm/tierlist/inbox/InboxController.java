package fm.tierlist.inbox;

import fm.tierlist.user.AppUserService;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Inbox "Not a song" list: liked videos to keep out of the Inbox. PUT and
// DELETE are idempotent (dismiss / undo). A malformed id is a 400 via
// Spring's built-in method validation (no @Validated needed).
@RestController
@RequestMapping("/api/inbox/dismissed")
public class InboxController {

    private static final String VIDEO_ID = "^[A-Za-z0-9_-]{11}$";

    private final AppUserService users;
    private final InboxService inbox;

    public InboxController(AppUserService users, InboxService inbox) {
        this.users = users;
        this.inbox = inbox;
    }

    @GetMapping
    public List<String> list(Authentication auth) {
        return inbox.dismissedVideoIds(auth.getName());
    }

    @PutMapping("/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dismiss(@PathVariable @Pattern(regexp = VIDEO_ID) String videoId, Authentication auth) {
        inbox.dismiss(users.current(auth).getId(), videoId);
    }

    @DeleteMapping("/{videoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restore(@PathVariable @Pattern(regexp = VIDEO_ID) String videoId, Authentication auth) {
        inbox.restore(auth.getName(), videoId);
    }
}
