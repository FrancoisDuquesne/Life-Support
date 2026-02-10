export default defineAppConfig({
  ui: {
    colors: {
      primary: 'orange',
      neutral: 'slate',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'sky',
      'resource-energy': 'resource-energy',
      'resource-food': 'resource-food',
      'resource-water': 'resource-water',
      'resource-minerals': 'resource-minerals',
      'resource-oxygen': 'resource-oxygen',
    },
    card: {
      slots: {
        root: 'rounded-md',
        header: 'px-2 py-1.5',
        body: 'p-2',
        footer: 'px-2 py-1.5',
      },
    },
  },
  gameUi: {
    background: '#dbeafe',
  },
})
