package com.colony.service;

import com.colony.model.BuildingType;
import com.colony.model.Colony;
import com.colony.model.ResourceType;
import io.smallrye.mutiny.Uni;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Service managing the Life Support game logic.
 *
 * LEARNING NOTES:
 *
 * @ApplicationScoped - This is CDI (Context and Dependency Injection).
 * Similar to Django's singleton services, this creates ONE instance of this
 * class that's shared across the entire application. Quarkus manages its lifecycle.
 *
 * @ConfigProperty - Injects values from application.properties.
 * Like Django's settings.py but with type safety and default values.
 *
 * Uni<T> - This is Mutiny's reactive type for a single async result.
 * Think of it like Python's Future or JavaScript's Promise.
 * - Uni.createFrom().item(x) = immediately resolve with value x
 * - uni.map(x -> y) = transform the value when it arrives
 * - uni.flatMap(x -> anotherUni) = chain async operations
 */
@ApplicationScoped
public class ColonyService {

    // Configuration from application.properties
    @ConfigProperty(name = "colony.start.energy", defaultValue = "100")
    int startEnergy;

    @ConfigProperty(name = "colony.start.food", defaultValue = "50")
    int startFood;

    @ConfigProperty(name = "colony.start.water", defaultValue = "50")
    int startWater;

    @ConfigProperty(name = "colony.start.minerals", defaultValue = "30")
    int startMinerals;

    @ConfigProperty(name = "colony.grid.width", defaultValue = "32")
    int gridWidth;

    @ConfigProperty(name = "colony.grid.height", defaultValue = "32")
    int gridHeight;

    // The colony instance (single game state for simplicity)
    private Colony colony;

    /**
     * Initialize the colony when the service starts.
     *
     * @PostConstruct runs after dependency injection is complete.
     * Like Django's AppConfig.ready() method.
     */
    @PostConstruct
    void init() {
        resetColony();
    }

    /**
     * Reset the colony to starting state.
     */
    public void resetColony() {
        colony = new Colony("Life Support");
        colony.setResource(ResourceType.ENERGY, startEnergy);
        colony.setResource(ResourceType.FOOD, startFood);
        colony.setResource(ResourceType.WATER, startWater);
        colony.setResource(ResourceType.MINERALS, startMinerals);
    }

    /**
     * Get current colony state (reactive version).
     *
     * Even though this is synchronous, wrapping in Uni allows us to:
     * 1. Chain with other async operations
     * 2. Handle errors consistently
     * 3. Integrate with reactive REST endpoints
     */
    public Uni<Colony.ColonySnapshot> getColonyStatus() {
        return Uni.createFrom().item(colony.toSnapshot());
    }

    /**
     * Get the colony directly (for scheduled tasks).
     */
    public Colony getColony() {
        return colony;
    }

    public int getGridWidth() {
        return gridWidth;
    }

    public int getGridHeight() {
        return gridHeight;
    }

    /**
     * Attempt to build a structure at grid coordinates.
     */
    public Uni<BuildResult> build(BuildingType buildingType, int x, int y) {
        if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
            return Uni.createFrom().item(new BuildResult(
                false,
                "Invalid coordinates (" + x + "," + y + "). Grid is " + gridWidth + "x" + gridHeight,
                buildingType,
                colony.toSnapshot()
            ));
        }

        if (colony.isCellOccupied(x, y)) {
            return Uni.createFrom().item(new BuildResult(
                false,
                "Cell (" + x + "," + y + ") is already occupied",
                buildingType,
                colony.toSnapshot()
            ));
        }

        if (!colony.hasEnoughResources(buildingType.getBuildCost())) {
            return Uni.createFrom().item(new BuildResult(
                false,
                "Not enough resources to build " + buildingType.getDisplayName(),
                buildingType,
                colony.toSnapshot()
            ));
        }

        colony.subtractResources(buildingType.getBuildCost());
        colony.placeBuilding(buildingType, x, y);

        return Uni.createFrom().item(new BuildResult(
            true,
            "Successfully built " + buildingType.getDisplayName() + " at (" + x + "," + y + ")",
            buildingType,
            colony.toSnapshot()
        ));
    }

    /**
     * Process one game tick - update resources based on buildings and population.
     *
     * This is called by the GameTickService on a schedule.
     */
    public TickResult processTick() {
        if (!colony.isAlive()) {
            return new TickResult(colony.getTickCount(), "Colony has collapsed!", colony.toSnapshot());
        }

        colony.incrementTick();

        // Process production from buildings
        for (BuildingType building : BuildingType.values()) {
            int count = colony.getBuildingCount(building);
            if (count > 0) {
                // Add production
                building.getProductionPerTick().forEach((resource, amount) -> {
                    colony.addResource(resource, amount * count);
                });

                // Subtract consumption
                building.getConsumptionPerTick().forEach((resource, amount) -> {
                    colony.addResource(resource, -(amount * count));
                });
            }
        }

        // Population consumes food and water
        int foodConsumed = colony.getPopulation() / 2;  // 1 food per 2 people
        int waterConsumed = colony.getPopulation() / 3; // 1 water per 3 people
        colony.addResource(ResourceType.FOOD, -foodConsumed);
        colony.addResource(ResourceType.WATER, -waterConsumed);

        // Check for colony death conditions
        StringBuilder events = new StringBuilder();
        events.append("Tick ").append(colony.getTickCount()).append(" processed. ");

        if (colony.getResource(ResourceType.FOOD) <= 0) {
            colony.setAlive(false);
            events.append("COLONY COLLAPSED: Starvation! ");
        } else if (colony.getResource(ResourceType.WATER) <= 0) {
            colony.setAlive(false);
            events.append("COLONY COLLAPSED: Dehydration! ");
        } else if (colony.getResource(ResourceType.ENERGY) < 0) {
            colony.setResource(ResourceType.ENERGY, 0);
            events.append("WARNING: Power shortage! ");
        }

        // Population growth (if food and water are abundant)
        if (colony.isAlive() &&
            colony.getResource(ResourceType.FOOD) > 20 &&
            colony.getResource(ResourceType.WATER) > 20 &&
            colony.getPopulation() < colony.getPopulationCapacity()) {
            colony.setPopulation(colony.getPopulation() + 1);
            events.append("Population grew! ");
        }

        return new TickResult(colony.getTickCount(), events.toString(), colony.toSnapshot());
    }

    /**
     * Result of a build operation.
     * Using a record for immutable data.
     */
    public record BuildResult(
        boolean success,
        String message,
        BuildingType buildingType,
        Colony.ColonySnapshot colonyState
    ) {}

    /**
     * Result of a tick operation.
     */
    public record TickResult(
        int tick,
        String events,
        Colony.ColonySnapshot colonyState
    ) {}
}
