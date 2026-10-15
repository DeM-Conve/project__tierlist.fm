package fm.tierlist.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

import java.util.Collections;
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

    // ---- PlaylistController.retryAborted ------------------------------------

    @Test
    void anAbortedWriteIsTriedAgain() {
        AtomicInteger calls = new AtomicInteger();
        String result = PlaylistController.retryAborted(() -> {
            if (calls.incrementAndGet() < 3) throw HttpClientErrorException.create(HttpStatus.CONFLICT, "Conflict", null, null, null);
            return "ok";
        });
        assertThat(result).isEqualTo("ok");
        assertThat(calls).hasValue(PlaylistController.WRITE_ATTEMPTS);
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
