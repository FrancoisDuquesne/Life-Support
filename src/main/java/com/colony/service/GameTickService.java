package com.colony.service;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import io.vertx.core.Vertx;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

@ApplicationScoped
public class GameTickService {

    private static final Logger LOG = Logger.getLogger(GameTickService.class);

    @Inject
    ColonyService colonyService;

    @Inject
    Vertx vertx;

    @ConfigProperty(name = "colony.tick.interval", defaultValue = "5s")
    String tickIntervalConfig;

    private final BroadcastProcessor<ColonyService.TickResult> tickBroadcaster =
        BroadcastProcessor.create();

    private long timerId = -1;
    private long intervalMs = 5000;

    @PostConstruct
    void init() {
        intervalMs = parseInterval(tickIntervalConfig);
        scheduleTimer();
    }

    private long parseInterval(String interval) {
        String s = interval.trim().toLowerCase();
        if (s.endsWith("ms")) return Long.parseLong(s.replace("ms", "").trim());
        if (s.endsWith("s")) return (long) (Double.parseDouble(s.replace("s", "").trim()) * 1000);
        return Long.parseLong(s);
    }

    private void scheduleTimer() {
        if (timerId >= 0) {
            vertx.cancelTimer(timerId);
        }
        timerId = vertx.setPeriodic(intervalMs, id -> gameTick());
    }

    void gameTick() {
        ColonyService.TickResult result = colonyService.processTick();
        LOG.infof("Game tick %d: %s", result.tick(), result.events());
        tickBroadcaster.onNext(result);
    }

    /**
     * Manually trigger a single tick and broadcast the result.
     */
    public ColonyService.TickResult manualTick() {
        ColonyService.TickResult result = colonyService.processTick();
        LOG.infof("Manual tick %d: %s", result.tick(), result.events());
        tickBroadcaster.onNext(result);
        return result;
    }

    /**
     * Change tick speed. Returns new interval in ms.
     */
    public long setSpeed(long newIntervalMs) {
        if (newIntervalMs < 200) newIntervalMs = 200;   // minimum 200ms
        if (newIntervalMs > 30000) newIntervalMs = 30000; // maximum 30s
        this.intervalMs = newIntervalMs;
        scheduleTimer();
        return this.intervalMs;
    }

    public long getIntervalMs() {
        return intervalMs;
    }

    public Multi<ColonyService.TickResult> getTickStream() {
        return tickBroadcaster;
    }

    public int getCurrentTick() {
        return colonyService.getColony().getTickCount();
    }
}
