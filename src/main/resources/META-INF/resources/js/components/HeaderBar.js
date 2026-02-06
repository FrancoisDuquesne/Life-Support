// HeaderBar.js — colony name, tick counter, status badge, reset button
(function() {
  const HeaderBar = {
    props: ['state', 'onReset'],
    template: `
      <header class="header">
        <h1>{{ state ? state.name : 'Life Support' }}</h1>
        <div class="header-info">
          <span class="tick-counter">Tick: {{ state ? state.tickCount : 0 }}</span>
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
