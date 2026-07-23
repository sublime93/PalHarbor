import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'PalHarbor',
  description:
    'Configure and operate your Palworld dedicated server with PalHarbor.',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: [/^http:\/\/localhost/],
  head: [['meta', { name: 'theme-color', content: '#07131d' }]],
  themeConfig: {
    logo: {
      light: '/logo.svg',
      dark: '/logo.svg',
      alt: 'PalHarbor',
    },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Configuration', link: '/guide/configuration' },
      { text: 'Operations', link: '/guide/using-palharbor' },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/sublime93/PalHarbor' },
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Install and run', link: '/guide/getting-started' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Local map assets', link: '/guide/map-assets' },
        ],
      },
      {
        text: 'Operate PalHarbor',
        items: [
          { text: 'Use the dashboard', link: '/guide/using-palharbor' },
          { text: 'Player activity', link: '/guide/player-activity' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Contribute',
        items: [
          { text: 'Documentation workspace', link: '/guide/documentation' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    outline: {
      level: [2, 3],
      label: 'On this page',
    },
    footer: {
      message: 'Local-first administration for Palworld dedicated servers.',
    },
  },
})
