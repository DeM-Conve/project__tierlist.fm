package fm.tierlist.controller;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.function.Function;

// Runs a batch of YouTube writes (tier-sync, rename, create) a few at a time
// instead of one after another: each write is a round trip of ~0.3-1s, so a
// 20-song push took 20+ seconds sequentially. YouTube aborts (409) concurrent
// writes to one playlist, so each item names every playlist it writes to (a
// move: its target *and* its source) and two items sharing any of them run one
// after another, in input order; items with nothing in common run in parallel.
// Results come back in input order, so callers' per-item reports read exactly
// as before.
final class YoutubeBatch {

    private YoutubeBatch() {
    }

    // One key per item (a null key is a key of its own: "").
    static <T, R> List<R> run(List<T> items, int parallelism, Function<T, ?> key, Function<T, R> task) {
        return runLocked(items, parallelism, item -> Set.of(Objects.requireNonNullElse(key.apply(item), "")), task);
    }

    // Each item waits for the latest earlier item holding each of its keys -
    // so items sharing a key never overlap and keep their order, and the
    // waits only ever point backwards (no deadlock). An empty key set waits on
    // nothing. A slot is taken only once an item may start.
    static <T, R> List<R> runLocked(List<T> items, int parallelism, Function<T, Collection<?>> keys, Function<T, R> task) {
        Object[] results = new Object[items.size()];
        if (parallelism <= 1) {
            for (int i = 0; i < items.size(); i++) results[i] = task.apply(items.get(i));
            return castAll(results);
        }
        List<CompletableFuture<Void>> done = new ArrayList<>();
        List<List<Integer>> waitsFor = new ArrayList<>();
        Map<Object, Integer> lastHolder = new HashMap<>();
        for (int i = 0; i < items.size(); i++) {
            done.add(new CompletableFuture<>());
            Set<Integer> before = new LinkedHashSet<>();
            for (Object k : new LinkedHashSet<>(keys.apply(items.get(i)))) {
                Integer prev = lastHolder.put(k, i);
                if (prev != null) before.add(prev);
            }
            waitsFor.add(List.copyOf(before));
        }
        Semaphore slots = new Semaphore(parallelism);
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<?>> running = new ArrayList<>();
            for (int n = 0; n < items.size(); n++) {
                int i = n;
                running.add(pool.submit(() -> {
                    try {
                        for (int prev : waitsFor.get(i)) done.get(prev).join();
                        slots.acquireUninterruptibly();
                        try {
                            results[i] = task.apply(items.get(i));
                        } finally {
                            slots.release();
                        }
                    } finally {
                        done.get(i).complete(null); // even on a bug, never strand the items after it
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
