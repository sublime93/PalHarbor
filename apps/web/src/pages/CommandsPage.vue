<script setup lang="ts">
import {
  BellRing,
  Check,
  CircleAlert,
  HardDrive,
  Megaphone,
  Power,
  Save,
  ShieldBan,
  Skull,
} from '@lucide/vue'
import { usePalworldMonitor } from '../composables/usePalworldMonitor'

const {
  announceMessage,
  unbanUserId,
  shutdownWait,
  shutdownMessage,
  actionBusy,
  announce,
  unbanPlayer,
  saveWorld,
  scheduleShutdown,
  forceStop,
} = usePalworldMonitor()
</script>

<template>
  <section class="page-content">
    <div class="page-intro">
      <div><p class="section-kicker">ADMIN OPERATIONS</p><h2>Command center</h2><p>Broadcast messages, save world state, and manage server lifecycle.</p></div>
      <span class="danger-zone-label"><CircleAlert :size="15" /> ADMIN AUTHORITY</span>
    </div>
    <div class="command-grid">
      <article class="panel command-card announce-card">
        <div class="command-icon"><Megaphone :size="21" /></div>
        <div class="command-copy"><span class="panel-kicker">BROADCAST</span><h3>Server announcement</h3><p>Send a message to every connected player.</p></div>
        <textarea v-model="announceMessage" maxlength="500" rows="4" placeholder="Server restart in 10 minutes…" />
        <div class="field-footer"><span>{{ announceMessage.length }} / 500</span><button class="primary-button" :disabled="!announceMessage.trim() || actionBusy" @click="announce"><BellRing :size="15" /> Broadcast</button></div>
      </article>

      <article class="panel command-card save-card">
        <div class="command-icon"><HardDrive :size="21" /></div>
        <div class="command-copy"><span class="panel-kicker">WORLD STATE</span><h3>Manual save</h3><p>Write the current world and player progress to disk before maintenance.</p></div>
        <button class="secondary-button full-button" :disabled="actionBusy" @click="saveWorld"><Save :size="16" /> Save world now</button>
      </article>

      <article class="panel command-card">
        <div class="command-icon"><ShieldBan :size="21" /></div>
        <div class="command-copy"><span class="panel-kicker">ACCESS CONTROL</span><h3>Unban user</h3><p>Restore server access using the player’s platform user ID.</p></div>
        <label class="stacked-field"><span>User ID</span><input v-model="unbanUserId" placeholder="steam_00000000000000000" /></label>
        <button class="secondary-button full-button" :disabled="!unbanUserId.trim() || actionBusy" @click="unbanPlayer"><Check :size="16" /> Remove ban</button>
      </article>

      <article class="panel command-card danger-card">
        <div class="command-icon danger"><Power :size="21" /></div>
        <div class="command-copy"><span class="panel-kicker danger-text">SERVER LIFECYCLE</span><h3>Graceful shutdown</h3><p>Warn players and stop after a countdown. The delay is in seconds.</p></div>
        <div class="split-fields"><label class="stacked-field narrow"><span>Delay</span><input v-model.number="shutdownWait" type="number" min="0" max="3600" /></label><label class="stacked-field"><span>Player message</span><input v-model="shutdownMessage" maxlength="500" /></label></div>
        <button class="danger-button full-button" :disabled="actionBusy" @click="scheduleShutdown"><Power :size="16" /> Schedule shutdown</button>
      </article>
    </div>

    <article class="force-stop-bar">
      <div class="force-icon"><Skull :size="21" /></div>
      <div><strong>Emergency force stop</strong><span>Immediately terminates the server. Unsaved progress may be lost.</span></div>
      <button class="outline-danger-button" :disabled="actionBusy" @click="forceStop">Force stop server</button>
    </article>
  </section>
</template>
