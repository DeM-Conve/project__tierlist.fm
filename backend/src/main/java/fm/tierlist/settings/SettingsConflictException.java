package fm.tierlist.settings;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

// 412: the settings changed since the client last read them (e.g. saved from
// another device). The client re-reads, merges its own edits and retries.
public class SettingsConflictException extends ErrorResponseException {

    public SettingsConflictException() {
        super(HttpStatus.PRECONDITION_FAILED);
        getBody().setTitle("Settings changed elsewhere");
        getBody().setDetail("These settings were saved from somewhere else since you loaded them - reload and retry.");
    }
}
