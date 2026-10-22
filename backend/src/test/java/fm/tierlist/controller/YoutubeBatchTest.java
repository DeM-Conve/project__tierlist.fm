package fm.tierlist.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YoutubeBatchTest {

    record Job(String key, int n) {
    }

    @Test
    void resultsComeBackInInputOrder() {
        List<Job> jobs = IntStream.range(0, 20).mapToObj(i -> new Job("PL" + (i % 5), i)).toList();
        List<Integer> out = YoutubeBatch.run(jobs, 4, Job::key, j -> {
            sleep(20 - j.n()); // later jobs finish first
            return j.n();
        });
        assertThat(out).containsExactlyElementsOf(IntStream.range(0, 20).boxed().toList());
    }

    @Test
    void writesToDifferentPlaylistsRunAtTheSameTime() {
        CountDownLatch bothStarted = new CountDownLatch(2);
        List<Boolean> out = YoutubeBatch.run(List.of(new Job("A", 0), new Job("B", 1)), 4, Job::key, j -> {
            bothStarted.countDown();
            return await(bothStarted); // false if the other one never ran alongside
        });
        assertThat(out).containsExactly(true, true);
    }

    @Test
    void writesToOnePlaylistRunOneAfterAnotherInOrder() {
        List<Integer> seen = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger inPlaylistA = new AtomicInteger();
        AtomicInteger overlap = new AtomicInteger();
        List<Job> jobs = List.of(new Job("A", 0), new Job("B", 1), new Job("A", 2), new Job("A", 3), new Job("B", 4));
        YoutubeBatch.run(jobs, 4, Job::key, j -> {
            if (j.key().equals("A")) {
                if (inPlaylistA.incrementAndGet() > 1) overlap.incrementAndGet();
                seen.add(j.n());
                sleep(15);
                inPlaylistA.decrementAndGet();
            }
            return j.n();
        });
        assertThat(overlap).hasValue(0);
        assertThat(seen).containsExactly(0, 2, 3);
    }

    @Test
    void neverMoreThanParallelismAtOnce() {
        AtomicInteger running = new AtomicInteger();
        AtomicInteger peak = new AtomicInteger();
        List<Job> jobs = IntStream.range(0, 12).mapToObj(i -> new Job("PL" + i, i)).toList();
        YoutubeBatch.run(jobs, 3, Job::key, j -> {
            peak.accumulateAndGet(running.incrementAndGet(), Math::max);
            sleep(20);
            running.decrementAndGet();
            return j.n();
        });
        assertThat(peak.get()).isBetween(2, 3);
    }

    @Test
    void aMissingKeyIsOneGroupAndAnEmptyBatchIsEmpty() {
        List<Job> jobs = List.of(new Job(null, 0), new Job(null, 1));
        assertThat(YoutubeBatch.run(jobs, 4, Job::key, Job::n)).containsExactly(0, 1);
        assertThat(YoutubeBatch.<Job, Integer>run(List.of(), 4, Job::key, Job::n)).isEmpty();
    }

    // ---- runLocked: an item writing to several playlists ------------------

    record Move(Set<String> playlists, int n) {
    }

    @Test
    void itemsSharingAnyPlaylistNeverOverlapAndKeepTheirOrder() {
        // 0 writes A+S, 1 writes S+B (its source is 0's target), 2 writes B+C, 3 is unrelated.
        List<Move> moves = List.of(new Move(Set.of("A", "S"), 0), new Move(Set.of("S", "B"), 1),
            new Move(Set.of("B", "C"), 2), new Move(Set.of("X"), 3));
        Map<String, AtomicInteger> busy = new ConcurrentHashMap<>();
        AtomicInteger overlap = new AtomicInteger();
        List<Integer> chain = Collections.synchronizedList(new ArrayList<>());
        List<Integer> out = YoutubeBatch.runLocked(moves, 4, Move::playlists, m -> {
            for (String p : m.playlists()) if (busy.computeIfAbsent(p, k -> new AtomicInteger()).incrementAndGet() > 1) overlap.incrementAndGet();
            if (m.n() < 3) chain.add(m.n());
            sleep(15);
            for (String p : m.playlists()) busy.get(p).decrementAndGet();
            return m.n();
        });
        assertThat(overlap).hasValue(0);
        assertThat(chain).containsExactly(0, 1, 2);
        assertThat(out).containsExactly(0, 1, 2, 3);
    }

    @Test
    void itemsWithNoPlaylistInCommonStillRunAtTheSameTime() {
        CountDownLatch allStarted = new CountDownLatch(3);
        List<Move> moves = List.of(new Move(Set.of("A", "S"), 0), new Move(Set.of("B", "T"), 1), new Move(Set.of(), 2));
        List<Boolean> out = YoutubeBatch.runLocked(moves, 4, Move::playlists, m -> {
            allStarted.countDown();
            return await(allStarted);
        });
        assertThat(out).containsExactly(true, true, true);
    }

    @Test
    void aParallelismOfOneRunsEverythingInOrder() {
        List<Integer> seen = new ArrayList<>();
        YoutubeBatch.runLocked(List.of(new Move(Set.of("A"), 0), new Move(Set.of("B"), 1)), 1, Move::playlists, m -> {
            seen.add(m.n());
            return m.n();
        });
        assertThat(seen).containsExactly(0, 1);
    }

    // ---- PlaylistController.playlistsWritten --------------------------------

    @Test
    void aRowWithItsSourcePlaylistLocksTargetAndSource() {
        assertThat(PlaylistController.playlistsWritten(Map.of("toPlaylistId", "PLs", "fromPlaylistId", "PLa")))
            .containsExactlyInAnyOrder("PLs", "PLa");
        // A dedupe (delete only) locks just its source.
        assertThat(PlaylistController.playlistsWritten(Map.of("fromPlaylistId", "PLa", "toPlaylistId", " ")))
            .containsExactly("PLa");
    }

    @Test
    void aRowWithoutItsSourcePlaylistIsKeyedByItsTargetAsBefore() {
        assertThat(PlaylistController.playlistsWritten(Map.of("toPlaylistId", "PLs"))).containsExactly("PLs");
        assertThat(PlaylistController.playlistsWritten(Map.of("fromItemId", "OLD"))).containsExactly("");
        assertThat(PlaylistController.playlistsWritten(Map.of("toPlaylistId", "PLs", "fromPlaylistId", "")))
            .containsExactly("PLs");
    }

    // ---- PlaylistController.retryAborted ------------------------------------

    @Test
    void anAbortedWriteIsTriedAgain() {
        AtomicInteger calls = new AtomicInteger();
        String result = PlaylistController.retryAborted(() -> {
            if (calls.incrementAndGet() < 3) throw HttpClientErrorException.create(HttpStatus.CONFLICT, "Conflict", null, null, null);
            return "ok";
        });
        assertThat(result).isEqualTo("ok");
        assertThat(calls).hasValue(3);
    }

    @Test
    void anAbortedWriteGivesUpAfterTheLastAttempt() {
        AtomicInteger calls = new AtomicInteger();
        assertThatThrownBy(() -> PlaylistController.retryAborted(() -> {
            calls.incrementAndGet();
            throw HttpClientErrorException.create(HttpStatus.CONFLICT, "Conflict", null, null, null);
        })).isInstanceOf(HttpClientErrorException.Conflict.class);
        assertThat(calls).hasValue(PlaylistController.WRITE_ATTEMPTS);
    }

    @Test
    void anyOtherErrorIsNotRetried() {
        AtomicInteger calls = new AtomicInteger();
        assertThatThrownBy(() -> PlaylistController.retryAborted(() -> {
            calls.incrementAndGet();
            throw HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", null, null, null);
        })).isInstanceOf(HttpClientErrorException.Forbidden.class);
        assertThat(calls).hasValue(1);
    }

    @Test
    void aServerErrorIsNotRetriedForANonRepeatableWrite() {
        // An insert that 500s may still have landed - repeating it would duplicate the video.
        AtomicInteger calls = new AtomicInteger();
        assertThatThrownBy(() -> PlaylistController.retryAborted(() -> {
            calls.incrementAndGet();
            throw HttpServerErrorException.create(HttpStatus.INTERNAL_SERVER_ERROR, "Error", null, null, null);
        })).isInstanceOf(HttpServerErrorException.class);
        assertThat(calls).hasValue(1);
    }

    @Test
    void aRepeatableWriteRetriesServerErrorsNetworkFailuresAndAborts() {
        AtomicInteger calls = new AtomicInteger();
        String result = PlaylistController.retryTransient(() -> switch (calls.incrementAndGet()) {
            case 1 -> throw HttpServerErrorException.create(HttpStatus.SERVICE_UNAVAILABLE, "Unavailable", null, null, null);
            case 2 -> throw new ResourceAccessException("reset");
            case 3 -> throw HttpClientErrorException.create(HttpStatus.CONFLICT, "Conflict", null, null, null);
            default -> "ok";
        });
        assertThat(result).isEqualTo("ok");
        assertThat(calls).hasValue(4);
    }

    @Test
    void aRepeatableWriteStillStopsOnAFinalError() {
        AtomicInteger calls = new AtomicInteger();
        assertThatThrownBy(() -> PlaylistController.retryTransient(() -> {
            calls.incrementAndGet();
            throw HttpClientErrorException.create(HttpStatus.NOT_FOUND, "Not Found", null, null, null);
        })).isInstanceOf(HttpClientErrorException.NotFound.class);
        assertThat(calls).hasValue(1);
    }

    @Test
    void anInterruptedWaitGivesUpAtOnce() {
        AtomicInteger calls = new AtomicInteger();
        Thread.currentThread().interrupt();
        try {
            assertThatThrownBy(() -> PlaylistController.retryAborted(() -> {
                calls.incrementAndGet();
                throw HttpClientErrorException.create(HttpStatus.CONFLICT, "Conflict", null, null, null);
            })).isInstanceOf(HttpClientErrorException.Conflict.class);
            assertThat(calls).hasValue(1);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted(); // clear for the next test
        }
    }

    @Test
    void theWaitGrowsAndIsJittered() {
        for (int attempt = 1; attempt < PlaylistController.WRITE_ATTEMPTS; attempt++) {
            long base = PlaylistController.RETRY_BASE_MILLIS << (attempt - 1);
            for (int i = 0; i < 50; i++) {
                assertThat(PlaylistController.backoff(attempt)).isBetween(base, base + base / 2);
            }
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(Math.max(0, ms));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static boolean await(CountDownLatch latch) {
        try {
            return latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
