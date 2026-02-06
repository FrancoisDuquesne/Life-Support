package com.colony.model;

import java.util.Map;

/**
 * Types of buildings that can be constructed in the colony.
 *
 * LEARNING NOTE: This enum demonstrates more complex enum usage in Java.
 * Each building has:
 * - A cost (resources needed to build)
 * - A production (resources generated per tick)
 * - A consumption (resources used per tick)
 */
public enum BuildingType {
    SOLAR_PANEL(
        "Solar Panel",
        "Generates energy from sunlight",
        Map.of(ResourceType.MINERALS, 10),           // Cost
        Map.of(ResourceType.ENERGY, 5),               // Produces
        Map.of()                                       // Consumes nothing
    ),

    HYDROPONIC_FARM(
        "Hydroponic Farm",
        "Grows food using water and energy",
        Map.of(ResourceType.MINERALS, 15, ResourceType.ENERGY, 5),
        Map.of(ResourceType.FOOD, 3),
        Map.of(ResourceType.WATER, 1, ResourceType.ENERGY, 1)
    ),

    WATER_EXTRACTOR(
        "Water Extractor",
        "Extracts water from the Martian ice",
        Map.of(ResourceType.MINERALS, 12),
        Map.of(ResourceType.WATER, 4),
        Map.of(ResourceType.ENERGY, 2)
    ),

    MINE(
        "Mining Facility",
        "Extracts minerals from the ground",
        Map.of(ResourceType.MINERALS, 8),
        Map.of(ResourceType.MINERALS, 2),
        Map.of(ResourceType.ENERGY, 3)
    ),

    HABITAT(
        "Living Habitat",
        "Houses colonists, increases population capacity by 5",
        Map.of(ResourceType.MINERALS, 25, ResourceType.WATER, 10),
        Map.of(),                                      // Doesn't produce resources
        Map.of(ResourceType.ENERGY, 2)                 // But consumes energy
    );

    private final String displayName;
    private final String description;
    private final Map<ResourceType, Integer> buildCost;
    private final Map<ResourceType, Integer> productionPerTick;
    private final Map<ResourceType, Integer> consumptionPerTick;

    BuildingType(String displayName, String description,
                 Map<ResourceType, Integer> buildCost,
                 Map<ResourceType, Integer> productionPerTick,
                 Map<ResourceType, Integer> consumptionPerTick) {
        this.displayName = displayName;
        this.description = description;
        this.buildCost = buildCost;
        this.productionPerTick = productionPerTick;
        this.consumptionPerTick = consumptionPerTick;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDescription() {
        return description;
    }

    public Map<ResourceType, Integer> getBuildCost() {
        return buildCost;
    }

    public Map<ResourceType, Integer> getProductionPerTick() {
        return productionPerTick;
    }

    public Map<ResourceType, Integer> getConsumptionPerTick() {
        return consumptionPerTick;
    }

    /**
     * Extra capacity provided by this building (for Habitats)
     */
    public int getPopulationCapacity() {
        return this == HABITAT ? 5 : 0;
    }
}
