package com.colony.model;

/**
 * Types of resources in Life Support.
 *
 * LEARNING NOTE: This is a Java enum - similar to Python's Enum class.
 * Enums in Java are type-safe and can have methods and fields.
 */
public enum ResourceType {
    ENERGY("Energy", "Powers all colony operations"),
    FOOD("Food", "Feeds the colonists"),
    WATER("Water", "Essential for survival"),
    MINERALS("Minerals", "Used for construction");

    private final String displayName;
    private final String description;

    // Constructor for enum values
    ResourceType(String displayName, String description) {
        this.displayName = displayName;
        this.description = description;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDescription() {
        return description;
    }
}
