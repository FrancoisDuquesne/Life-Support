package com.colony.service;

import io.quarkus.scheduler.Scheduled;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

/**
 * Service that handles the game tick loop.
 *
 * LEARNING NOTES:
 *
 * @Scheduled - Quarkus's way of running periodic tasks.
 * Like Django's celery beat or cron jobs, but built-in.
 *
 * BroadcastProcessor - A Mutiny "processor" that allows multiple subscribers
 * to receive the same events. Perfect for Server-Sent Events (SSE) where
 * multiple clients might be listening.
 *
 * Multi<T> - Mutiny's reactive type for a stream of values (0 to many).
 * Think of it like Python's generator or an async iterator.
 * - Multi emits items over time
 * - Subscribers can react to each item as it arrives
 * - Great for real-time updates, event streams, etc.
 */
@ApplicationScoped
public class GameTickService {

    private static final Logger LOG = Logger.getLogger(GameTickService.class);

    @Inject
    ColonyService colonyService;

    // BroadcastProcessor allows multiple SSE clients to subscribe to tick events
    private final BroadcastProcessor<ColonyService.TickResult> tickBroadcaster =
        BroadcastProcessor.create();

    /**
     * Game tick - runs every 5 seconds (configured in application.properties).
     *
     * The cron-like expression "every" is a Quarkus extension for simple intervals.
     * You could also use standard cron: @Scheduled(cron = "0/5 * * * * ?")
     */
    @Scheduled(every = "${colony.tick.interval}")
    void gameTick() {
        ColonyService.TickResult result = colonyService.processTick();

        LOG.infof("Game tick %d: %s", result.tick(), result.events());

        // Broadcast the tick result to all SSE subscribers
        tickBroadcaster.onNext(result);
    }

    /**
     * Get a Multi (stream) of tick events for SSE.
     *
     * Each subscriber gets their own connection to the broadcast.
     * When they connect, they'll receive all future tick events.
     */
    public Multi<ColonyService.TickResult> getTickStream() {
        return tickBroadcaster;
    }

    /**
     * Get the current tick count.
     */
    public int getCurrentTick() {
        return colonyService.getColony().getTickCount();
    }
}
