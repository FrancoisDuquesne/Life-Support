package com.colony.model;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Represents the state of the Life Support colony.
 *
 * LEARNING NOTE: This class uses several Java concepts:
 * - EnumMap: A Map optimized for enum keys (faster than HashMap for enums)
 * - AtomicInteger: Thread-safe integer for concurrent updates
 * - ConcurrentHashMap: Thread-safe map for building counts
 *
 * In Python, you might use a dict - but Java's type system requires us
 * to be explicit about what types the map can hold.
 */
public class Colony {

    private final String name;
    private final Map<ResourceType, AtomicInteger> resources;
    private final Map<BuildingType, AtomicInteger> buildings;
    private final List<PlacedBuilding> placedBuildings;
    private final Set<Long> occupiedCells;
    private int nextBuildingId;
    private int population;
    private int populationCapacity;
    private int tickCount;
    private boolean isAlive;

    public Colony(String name) {
        this.name = name;
        this.resources = new EnumMap<>(ResourceType.class);
        this.buildings = new ConcurrentHashMap<>();
        this.placedBuildings = new CopyOnWriteArrayList<>();
        this.occupiedCells = ConcurrentHashMap.newKeySet();
        this.nextBuildingId = 1;

        // Initialize all resources to 0
        for (ResourceType type : ResourceType.values()) {
            resources.put(type, new AtomicInteger(0));
        }

        // Initialize all building counts to 0
        for (BuildingType type : BuildingType.values()) {
            buildings.put(type, new AtomicInteger(0));
        }

        this.population = 5;  // Start with 5 colonists
        this.populationCapacity = 10;  // Initial capacity
        this.tickCount = 0;
        this.isAlive = true;
    }

    // Resource methods
    public int getResource(ResourceType type) {
        return resources.get(type).get();
    }

    public void setResource(ResourceType type, int amount) {
        resources.get(type).set(Math.max(0, amount));
    }

    public void addResource(ResourceType type, int amount) {
        resources.get(type).addAndGet(amount);
    }

    public boolean hasEnoughResources(Map<ResourceType, Integer> required) {
        for (Map.Entry<ResourceType, Integer> entry : required.entrySet()) {
            if (getResource(entry.getKey()) < entry.getValue()) {
                return false;
            }
        }
        return true;
    }

    public void subtractResources(Map<ResourceType, Integer> costs) {
        for (Map.Entry<ResourceType, Integer> entry : costs.entrySet()) {
            resources.get(entry.getKey()).addAndGet(-entry.getValue());
        }
    }

    // Building methods
    public int getBuildingCount(BuildingType type) {
        return buildings.get(type).get();
    }

    public void addBuilding(BuildingType type) {
        buildings.get(type).incrementAndGet();

        // Update population capacity if it's a habitat
        if (type == BuildingType.HABITAT) {
            populationCapacity += type.getPopulationCapacity();
        }
    }

    public PlacedBuilding placeBuilding(BuildingType type, int x, int y) {
        long key = cellKey(x, y);
        occupiedCells.add(key);
        PlacedBuilding placed = new PlacedBuilding(nextBuildingId++, type, x, y);
        placedBuildings.add(placed);
        addBuilding(type);
        return placed;
    }

    public boolean isCellOccupied(int x, int y) {
        return occupiedCells.contains(cellKey(x, y));
    }

    public List<PlacedBuilding> getPlacedBuildings() {
        return placedBuildings;
    }

    private static long cellKey(int x, int y) {
        return ((long) x << 32) | (y & 0xFFFFFFFFL);
    }

    // Getters and setters
    public String getName() {
        return name;
    }

    public int getPopulation() {
        return population;
    }

    public void setPopulation(int population) {
        this.population = population;
    }

    public int getPopulationCapacity() {
        return populationCapacity;
    }

    public int getTickCount() {
        return tickCount;
    }

    public void incrementTick() {
        this.tickCount++;
    }

    public boolean isAlive() {
        return isAlive;
    }

    public void setAlive(boolean alive) {
        isAlive = alive;
    }

    /**
     * Creates a snapshot of the colony state for JSON serialization.
     *
     * LEARNING NOTE: This is a Java Record - a concise way to create
     * immutable data classes (like Python's @dataclass with frozen=True).
     * Records automatically generate constructor, getters, equals, hashCode, and toString.
     */
    public ColonySnapshot toSnapshot() {
        Map<String, Integer> resourcesSimple = new java.util.LinkedHashMap<>();
        for (ResourceType type : ResourceType.values()) {
            resourcesSimple.put(type.name().toLowerCase(), getResource(type));
        }

        Map<String, Integer> buildingsSimple = new java.util.LinkedHashMap<>();
        for (BuildingType type : BuildingType.values()) {
            buildingsSimple.put(type.name().toLowerCase(), getBuildingCount(type));
        }

        List<PlacedBuildingDTO> placedList = placedBuildings.stream()
            .map(pb -> new PlacedBuildingDTO(pb.id(), pb.type().name(), pb.x(), pb.y()))
            .toList();

        return new ColonySnapshot(
            name,
            resourcesSimple,
            buildingsSimple,
            population,
            populationCapacity,
            tickCount,
            isAlive,
            placedList
        );
    }

    public record PlacedBuildingDTO(int id, String type, int x, int y) {}

    public record ColonySnapshot(
        String name,
        Map<String, Integer> resources,
        Map<String, Integer> buildings,
        int population,
        int populationCapacity,
        int tickCount,
        boolean alive,
        List<PlacedBuildingDTO> placedBuildings
    ) {}
}
