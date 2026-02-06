// HeaderBar.js — colony name, tick counter, speed controls, status badge, reset button
(function() {
  const SPEEDS = [
    { label: '1x', ms: 5000 },
    { label: '2x', ms: 2500 },
    { label: '5x', ms: 1000 },
    { label: '10x', ms: 500 }
  ];

  const HeaderBar = {
    props: ['state', 'onReset', 'tickSpeed', 'onSetSpeed', 'onManualTick'],
    setup(props) {
      function isActive(ms) {
        return props.tickSpeed === ms;
      }
      return { SPEEDS, isActive };
    },
    template: `
      <header class="header">
        <h1>{{ state ? state.name : 'Life Support' }}</h1>
        <div class="header-info">
          <span class="tick-counter">T{{ state ? state.tickCount : 0 }}</span>
          <div class="speed-controls">
            <button v-for="s in SPEEDS" :key="s.ms"
                    :class="['btn', 'btn-speed', { active: isActive(s.ms) }]"
                    @click="onSetSpeed(s.ms)">{{ s.label }}</button>
            <button class="btn btn-next" @click="onManualTick" title="Advance one tick">Next</button>
          </div>
          <span :class="['status-badge', state && state.alive ? 'alive' : 'dead']">
            {{ state && state.alive ? 'Online' : 'Collapsed' }}
          </span>
          <button class="btn btn-danger" @click="onReset">Reset</button>
        </div>
      </header>
    `
  };

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.HeaderBar = HeaderBar;
})();
