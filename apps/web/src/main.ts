import { createApp } from 'vue'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import 'leaflet/dist/leaflet.css'
import App from './App.vue'
import { router } from './router'
import './styles.css'

createApp(App).use(router).mount('#app')
