package com.colony.resource;

import com.colony.model.BuildingType;
import com.colony.model.Colony;
import com.colony.service.ColonyService;
import com.colony.service.GameTickService;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestStreamElementType;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Path("/colony")
@Produces(MediaType.APPLICATION_JSON)
public class ColonyResource {

    @Inject
    ColonyService colonyService;

    @Inject
    GameTickService gameTickService;

    @GET
    public Uni<Colony.ColonySnapshot> getStatus() {
        return colonyService.getColonyStatus();
    }

    @GET
    @Path("/config")
    public GameConfig getConfig() {
        List<BuildingInfo> buildings = Arrays.stream(BuildingType.values())
            .map(b -> new BuildingInfo(
                b.name(),
                b.getDisplayName(),
                b.getDescription(),
                b.getBuildCost().entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().name().toLowerCase(),
                        Map.Entry::getValue
                    )),
                b.getProductionPerTick().entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().name().toLowerCase(),
                        Map.Entry::getValue
                    )),
                b.getConsumptionPerTick().entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().name().toLowerCase(),
                        Map.Entry::getValue
                    ))
            ))
            .toList();

        return new GameConfig(
            colonyService.getGridWidth(),
            colonyService.getGridHeight(),
            buildings
        );
    }

    @GET
    @Path("/buildings")
    public List<BuildingInfo> getBuildings() {
        return Arrays.stream(BuildingType.values())
            .map(b -> new BuildingInfo(
                b.name(),
                b.getDisplayName(),
                b.getDescription(),
                b.getBuildCost().entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().name().toLowerCase(),
                        Map.Entry::getValue
                    )),
                b.getProductionPerTick().entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().name().toLowerCase(),
                        Map.Entry::getValue
                    )),
                b.getConsumptionPerTick().entrySet().stream()
                    .collect(java.util.stream.Collectors.toMap(
                        e -> e.getKey().name().toLowerCase(),
                        Map.Entry::getValue
                    ))
            ))
            .toList();
    }

    @POST
    @Path("/build/{building}")
    @Consumes(MediaType.APPLICATION_JSON)
    public Uni<ColonyService.BuildResult> build(
            @PathParam("building") String buildingName,
            BuildRequest request) {
        try {
            BuildingType building = BuildingType.valueOf(buildingName.toUpperCase());
            return colonyService.build(building, request.x(), request.y());
        } catch (IllegalArgumentException e) {
            return Uni.createFrom().item(new ColonyService.BuildResult(
                false,
                "Unknown building type: " + buildingName + ". Valid types: " +
                    Arrays.toString(BuildingType.values()),
                null,
                null
            ));
        }
    }

    @POST
    @Path("/reset")
    public Uni<Colony.ColonySnapshot> reset() {
        colonyService.resetColony();
        return colonyService.getColonyStatus();
    }

    @GET
    @Path("/events")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<ColonyService.TickResult> streamEvents() {
        return gameTickService.getTickStream();
    }

    @GET
    @Path("/help")
    @Produces(MediaType.TEXT_PLAIN)
    public String help() {
        return """
            === LIFE SUPPORT ===

            ENDPOINTS:
              GET  /colony              - View colony status
              GET  /colony/config       - Get game configuration
              GET  /colony/buildings    - List available buildings
              POST /colony/build/{type} - Build a structure (body: {"x":0,"y":0})
              POST /colony/reset        - Reset the game
              GET  /colony/events       - SSE stream of game ticks

            BUILDING TYPES:
              SOLAR_PANEL     - Generates energy
              HYDROPONIC_FARM - Grows food (needs water & energy)
              WATER_EXTRACTOR - Extracts water (needs energy)
              MINE            - Extracts minerals (needs energy)
              HABITAT         - Houses colonists (increases capacity)

            GOAL: Grow your colony without running out of resources!
            """;
    }

    public record BuildRequest(int x, int y) {}

    public record BuildingInfo(
        String id,
        String name,
        String description,
        Map<String, Integer> cost,
        Map<String, Integer> produces,
        Map<String, Integer> consumes
    ) {}

    public record GameConfig(
        int gridWidth,
        int gridHeight,
        List<BuildingInfo> buildings
    ) {}
}
