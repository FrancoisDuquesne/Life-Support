// ResourcePanel.js — 4 resource cards with delta pills, sparklines, flash animation
(function() {
  const RESOURCE_KEYS = ['energy', 'food', 'water', 'minerals'];
  const COLORS = {
    energy: '#d97706',
    food: '#16a34a',
    water: '#2563eb',
    minerals: '#ea580c'
  };

  const ResourcePanel = {
    props: ['state', 'deltas', 'history'],
    setup(props) {
      const { computed, ref, watch, nextTick } = Vue;

      const flashKeys = ref({});
      let prevVals = {};
      const sparkRefs = {};

      function setSparkRef(key, el) {
        if (el) sparkRefs[key] = el;
      }

      watch(() => props.state && props.state.resources, (newRes) => {
        if (!newRes) return;
        for (const key of RESOURCE_KEYS) {
          const val = newRes[key] || 0;
          if (prevVals[key] !== undefined && prevVals[key] !== val) {
            flashKeys.value = { ...flashKeys.value, [key]: true };
            setTimeout(() => {
              flashKeys.value = { ...flashKeys.value, [key]: false };
            }, 500);
          }
          prevVals[key] = val;
        }
      }, { deep: true });

      function drawSparklines() {
        const data = props.history;
        if (!data || data.length < 2) return;
        for (const key of RESOURCE_KEYS) {
          const canvas = sparkRefs[key];
          if (!canvas) continue;
          const ctx = canvas.getContext('2d');
          const dpr = window.devicePixelRatio || 1;
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, w, h);

          // Last 20 data points
          const slice = data.slice(-20);
          let min = Infinity, max = -Infinity;
          for (const d of slice) {
            const v = d[key] || 0;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (max === min) { max = min + 1; }

          ctx.strokeStyle = COLORS[key];
          ctx.lineWidth = 1.5;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < slice.length; i++) {
            const x = (i / (slice.length - 1)) * w;
            const y = h - ((slice[i][key] || 0) - min) / (max - min) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      watch(() => props.history && props.history.length, () => {
        nextTick(drawSparklines);
      });

      const resources = computed(() => {
        return RESOURCE_KEYS.map(key => {
          const val = (props.state && props.state.resources && props.state.resources[key]) || 0;
          const delta = (props.deltas && props.deltas[key]) || 0;
          return { key, val, delta };
        });
      });

      function isFlashing(key) {
        return !!flashKeys.value[key];
      }

      return { resources, isFlashing, setSparkRef };
    },
    template: `
      <div class="resources-strip">
        <div v-for="r in resources" :key="r.key"
             :class="['resource-card', r.key]">
          <div class="label">{{ r.key }}</div>
          <div class="resource-val-row">
            <span :class="['value', { flashing: isFlashing(r.key) }]">{{ r.val }}</span>
            <span :class="['delta-pill', r.delta > 0 ? 'positive' : r.delta < 0 ? 'negative' : 'neutral']">
              {{ r.delta > 0 ? '+' : '' }}{{ r.delta }}/t
            </span>
          </div>
          <canvas :ref="el => setSparkRef(r.key, el)" class="sparkline-canvas"></canvas>
        </div>
      </div>
    `
  };

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.ResourcePanel = ResourcePanel;
})();
