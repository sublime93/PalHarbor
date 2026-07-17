<script setup lang="ts">
import {
  CircleAlert,
  CloudCog,
  RefreshCw,
  Search,
  Settings2,
} from '@lucide/vue'
import { usePalworldMonitor } from '../composables/usePalworldMonitor'

const {
  settings,
  errors,
  settingsSearch,
  filteredSettings,
  refresh,
  settingLabel,
} = usePalworldMonitor()
</script>

<template>
  <section class="page-content">
    <div class="page-intro">
      <div>
        <p class="section-kicker">SERVER CONFIGURATION</p>
        <h2>Runtime settings</h2>
        <p>A read-only view of the Palworld server’s active configuration.</p>
      </div>
      <span class="readonly-badge"><CloudCog :size="15" /> READ ONLY</span>
    </div>
    <div class="toolbar">
      <label class="search-field wide"
        ><Search :size="17" /><input
          v-model="settingsSearch"
          :placeholder="`Filter ${filteredSettings.length} settings`" /></label
      ><button class="secondary-button" @click="refresh('settings')">
        <RefreshCw :size="15" /> Reload settings
      </button>
    </div>
    <div v-if="errors.settings" class="inline-error" role="alert">
      <CircleAlert :size="16" />{{ errors.settings }}
    </div>
    <div class="settings-grid">
      <article
        v-for="[key, value] in filteredSettings"
        :key="key"
        class="setting-card"
      >
        <div>
          <strong>{{ settingLabel(key) }}</strong
          ><code>{{ key }}</code>
        </div>
        <span
          v-if="typeof value === 'boolean'"
          class="boolean-value"
          :class="{ on: value }"
          ><i />{{ value ? 'Enabled' : 'Disabled' }}</span
        >
        <span v-else class="setting-value" :title="String(value)">{{
          String(value === '' || value == null ? '—' : value)
        }}</span>
      </article>
    </div>
    <div v-if="!filteredSettings.length" class="empty-state panel">
      <Settings2 :size="34" /><strong>No settings found</strong
      ><span>{{
        settings
          ? 'Try another search.'
          : 'The server settings are not available.'
      }}</span>
    </div>
  </section>
</template>
