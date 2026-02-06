// EventLog.js — scrolling terminal log, color-coded
(function() {
  const EventLog = {
    props: ['log'],
    setup(props) {
      const { ref, watch, nextTick } = Vue;
      const logEl = ref(null);

      watch(() => props.log.length, () => {
        nextTick(() => {
          if (logEl.value) {
            logEl.value.scrollTop = logEl.value.scrollHeight;
          }
        });
      });

      return { logEl };
    },
    template: `
      <div class="event-log-section">
        <div class="build-panel-title">Event Log</div>
        <div class="event-log" ref="logEl">
          <div v-for="entry in log" :key="entry.id" :class="['log-entry', entry.severity]">
            <span v-if="entry.tick != null" class="log-tick">[T{{ entry.tick }}]</span>
            <span class="log-msg">{{ entry.msg }}</span>
          </div>
          <div v-if="!log.length" class="log-entry normal">
            <span class="log-msg">Awaiting colony data...</span>
          </div>
        </div>
      </div>
    `
  };

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.EventLog = EventLog;
})();
