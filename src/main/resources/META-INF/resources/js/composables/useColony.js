// useColony.js — central reactive state for the colony
(function() {
  const { ref, computed } = Vue;

  // Hex utility functions (odd-q offset coordinates, flat-top)
  function hexNeighbors(col, row) {
    const parity = col & 1;
    if (parity === 0) {
      return [[col+1,row-1],[col+1,row],[col,row+1],[col-1,row],[col-1,row-1],[col,row-1]];
    } else {
      return [[col+1,row],[col+1,row+1],[col,row+1],[col-1,row+1],[col-1,row],[col,row-1]];
    }
  }

  function offsetToCube(col, row) {
    const x = col;
    const z = row - (col - (col & 1)) / 2;
    const y = -x - z;
    return { x, y, z };
  }

  function hexDistance(c1, r1, c2, r2) {
    const a = offsetToCube(c1, r1);
    const b = offsetToCube(c2, r2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }

  function hexesInRadius(col, row, radius, gw, gh) {
    const result = [];
    for (let c = Math.max(0, col - radius - 1); c <= Math.min(gw - 1, col + radius + 1); c++) {
      for (let r = Math.max(0, row - radius - 1); r <= Math.min(gh - 1, row + radius + 1); r++) {
        if (hexDistance(col, row, c, r) <= radius) {
          result.push([c, r]);
        }
      }
    }
    return result;
  }

  // Seeded PRNG (simple mulberry32)
  function mulberry32(seed) {
    return function() {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function useColony(colonyId) {
    const baseUrl = colonyId ? `/colony/${colonyId}` : '/colony';

    const state = ref(null);
    const config = ref(null);
    const buildingsInfo = ref([]);
    const eventLog = ref([]);
    const resourceHistory = ref([]);
    const MAX_HISTORY = 60;
    const connected = ref(false);
    let eventSource = null;

    // Revealed tiles state
    const revealedTiles = ref(new Set());

    function initRevealedMap(gw, gh) {
      const centerCol = Math.floor(gw / 2);
      const centerRow = Math.floor(gh / 2);
      const rng = mulberry32(42);
      const revealed = new Set();
      const TARGET = 180;

      // BFS flood-fill from center with distance-based probability falloff
      const queue = [[centerCol, centerRow]];
      const visited = new Set();
      visited.add(centerCol + ',' + centerRow);
      revealed.add(centerCol + ',' + centerRow);

      while (queue.length > 0 && revealed.size < TARGET) {
        const [col, row] = queue.shift();
        const neighbors = hexNeighbors(col, row);
        for (const [nc, nr] of neighbors) {
          const key = nc + ',' + nr;
          if (nc < 0 || nc >= gw || nr < 0 || nr >= gh) continue;
          if (visited.has(key)) continue;
          visited.add(key);

          const dist = hexDistance(centerCol, centerRow, nc, nr);
          // Probability falls off with distance: ~95% near center, ~30% at edges
          const prob = Math.max(0.25, 0.95 - dist * 0.065);
          if (rng() < prob) {
            revealed.add(key);
            queue.push([nc, nr]);
          }
        }
      }

      revealedTiles.value = revealed;
    }

    function revealAround(x, y, radius) {
      const gw = gridWidth.value;
      const gh = gridHeight.value;
      const hexes = hexesInRadius(x, y, radius, gw, gh);
      const newSet = new Set(revealedTiles.value);
      for (const [c, r] of hexes) {
        newSet.add(c + ',' + r);
      }
      revealedTiles.value = newSet;
    }

    async function init() {
      try {
        const [configRes, stateRes] = await Promise.all([
          fetch(`${baseUrl}/config`),
          fetch(baseUrl)
        ]);
        config.value = await configRes.json();
        state.value = await stateRes.json();
        buildingsInfo.value = config.value.buildings || [];
        pushHistory(state.value);
        addLog(0, 'Colony connection established.');
        initRevealedMap(config.value.gridWidth || 32, config.value.gridHeight || 32);
        connectSSE();
      } catch (e) {
        addLog(null, 'Failed to connect to colony server.');
      }
    }

    function connectSSE() {
      if (eventSource) { eventSource.close(); eventSource = null; }
      eventSource = new EventSource(`${baseUrl}/events`);
      connected.value = true;
      eventSource.onmessage = function(e) {
        try {
          const data = JSON.parse(e.data);
          if (data.colonyState) {
            state.value = data.colonyState;
            pushHistory(data.colonyState);
          }
          if (data.events) addLog(data.tick, data.events);
        } catch (err) { /* ignore */ }
      };
      eventSource.onerror = function() {
        connected.value = false;
        addLog(null, 'SSE connection lost. Retrying...');
      };
    }

    async function buildAt(type, x, y) {
      try {
        const res = await fetch(`${baseUrl}/build/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y })
        });
        const data = await res.json();
        if (data.colonyState) {
          state.value = data.colonyState;
        }
        addLog(state.value ? state.value.tickCount : null, data.message);
        return data;
      } catch (e) {
        addLog(null, 'Build request failed.');
        return { success: false, message: 'Network error' };
      }
    }

    async function resetColony() {
      try {
        const res = await fetch(`${baseUrl}/reset`, { method: 'POST' });
        state.value = await res.json();
        eventLog.value = [];
        resourceHistory.value = [];
        pushHistory(state.value);
        addLog(0, 'Colony has been reset.');
        // Re-initialize revealed map
        const gw = config.value ? config.value.gridWidth : 32;
        const gh = config.value ? config.value.gridHeight : 32;
        initRevealedMap(gw, gh);
        connectSSE();
      } catch (e) {
        addLog(null, 'Reset failed.');
      }
    }

    function pushHistory(cs) {
      if (!cs || !cs.resources) return;
      resourceHistory.value.push({
        tick: cs.tickCount || 0,
        energy: cs.resources.energy || 0,
        food: cs.resources.food || 0,
        water: cs.resources.water || 0,
        minerals: cs.resources.minerals || 0
      });
      if (resourceHistory.value.length > MAX_HISTORY) {
        resourceHistory.value = resourceHistory.value.slice(-MAX_HISTORY);
      }
    }

    function addLog(tick, msg) {
      let severity = 'normal';
      if (/COLLAPSED|DEAD/i.test(msg)) severity = 'collapse';
      else if (/WARNING|shortage/i.test(msg)) severity = 'warning';
      eventLog.value.push({ tick, msg, severity, id: Date.now() + Math.random() });
      if (eventLog.value.length > 200) {
        eventLog.value = eventLog.value.slice(-200);
      }
    }

    function canAfford(cost) {
      if (!cost || !state.value || !state.value.resources) return false;
      for (const k in cost) {
        if ((state.value.resources[k] || 0) < cost[k]) return false;
      }
      return true;
    }

    const resourceDeltas = computed(() => {
      const deltas = { energy: 0, food: 0, water: 0, minerals: 0 };
      if (!state.value || !buildingsInfo.value) return deltas;

      buildingsInfo.value.forEach(b => {
        const key = b.id.toLowerCase();
        const count = (state.value.buildings && state.value.buildings[key]) || 0;
        if (count > 0) {
          for (const r in b.produces) {
            deltas[r] = (deltas[r] || 0) + b.produces[r] * count;
          }
          for (const r in b.consumes) {
            deltas[r] = (deltas[r] || 0) - b.consumes[r] * count;
          }
        }
      });

      // Population consumption
      const pop = state.value.population || 0;
      deltas.food -= Math.floor(pop / 2);
      deltas.water -= Math.floor(pop / 3);

      return deltas;
    });

    const gridWidth = computed(() => config.value ? config.value.gridWidth : 32);
    const gridHeight = computed(() => config.value ? config.value.gridHeight : 32);

    const tickSpeed = ref(5000);

    async function manualTick() {
      try {
        await fetch(`${baseUrl}/tick`, { method: 'POST' });
      } catch (e) {
        addLog(null, 'Manual tick failed.');
      }
    }

    async function setSpeed(intervalMs) {
      try {
        const res = await fetch(`${baseUrl}/speed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intervalMs })
        });
        const data = await res.json();
        tickSpeed.value = data.intervalMs;
      } catch (e) {
        addLog(null, 'Speed change failed.');
      }
    }

    return {
      state,
      buildingsInfo,
      eventLog,
      gridWidth,
      gridHeight,
      resourceDeltas,
      resourceHistory,
      revealedTiles,
      tickSpeed,
      init,
      buildAt,
      resetColony,
      canAfford,
      revealAround,
      manualTick,
      setSpeed
    };
  }

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.useColony = useColony;
  window.SpaceColony.hexNeighbors = hexNeighbors;
})();
