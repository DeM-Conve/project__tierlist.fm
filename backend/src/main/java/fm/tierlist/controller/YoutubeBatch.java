package fm.tierlist.controller;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.function.Function;

// Runs a batch of YouTube writes (tier-sync, rename, create) a few at a time
// instead of one after another: each write is a round trip of ~0.3-1s, so a
// 20-song push took 20+ seconds sequentially. Items sharing a key (the
// playlist they write to) still run one after another, in order - YouTube
// aborts concurrent writes to one playlist. Results come back in input order,
// so callers' per-item reports read exactly as before.
final class YoutubeBatch {

    private YoutubeBatch() {
    }

    static <T, R> List<R> run(List<T> items, int parallelism, Function<T, ?> key, Function<T, R> task) {
        Map<Object, List<Integer>> groups = new LinkedHashMap<>();
        for (int i = 0; i < items.size(); i++) {
            groups.computeIfAbsent(Objects.requireNonNullElse(key.apply(items.get(i)), ""), k -> new ArrayList<>()).add(i);
        }
        Object[] results = new Object[items.size()];
        if (groups.size() <= 1 || parallelism <= 1) {
            for (int i = 0; i < items.size(); i++) results[i] = task.apply(items.get(i));
            return castAll(results);
        }
        Semaphore slots = new Semaphore(parallelism);
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<?>> running = new ArrayList<>();
            for (List<Integer> group : groups.values()) {
                running.add(pool.submit(() -> {
                    slots.acquireUninterruptibly();
                    try {
                        for (int i : group) results[i] = task.apply(items.get(i));
                    } finally {
                        slots.release();
                    }
                }));
            }
            for (Future<?> f : running) f.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while writing to YouTube", e);
        } catch (ExecutionException e) {
            // Tasks report their own failures per item; reaching here is a bug.
            throw new IllegalStateException(e.getCause());
        }
        return castAll(results);
    }

    @SuppressWarnings("unchecked")
    private static <R> List<R> castAll(Object[] results) {
        return (List<R>) Arrays.asList(results);
    }
}
