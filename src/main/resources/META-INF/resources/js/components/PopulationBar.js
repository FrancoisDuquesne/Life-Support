// PopulationBar.js — population X/Y display
(function() {
  const PopulationBar = {
    props: ['state'],
    template: `
      <div class="pop-row">
        <span class="pop-label">Colonists</span>
        <span class="pop-value">
          {{ state ? state.population : 0 }} / {{ state ? state.populationCapacity : 0 }}
        </span>
      </div>
    `
  };

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.PopulationBar = PopulationBar;
})();
