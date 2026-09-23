package fm.tierlist.user;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

@Service
public class AppUserService {

    private final AppUserRepository users;

    public AppUserService(AppUserRepository users) {
        this.users = users;
    }

    // Called on every successful Google login: creates the user on first
    // login, refreshes profile details + last_login_at afterwards.
    @Transactional
    public AppUser recordLogin(Authentication auth) {
        AppUser user = users.findById(auth.getName()).orElseGet(() -> new AppUser(auth.getName()));
        if (auth.getPrincipal() instanceof OidcUser oidc) {
            user.setDisplayName(oidc.getFullName());
            user.setPictureUrl(oidc.getPicture());
        }
        user.setLastLoginAt(OffsetDateTime.now());
        return users.save(user);
    }

    // The row for the current session's user - created on the fly for
    // sessions that started before users were recorded.
    @Transactional
    public AppUser current(Authentication auth) {
        return users.findById(auth.getName()).orElseGet(() -> recordLogin(auth));
    }
}
