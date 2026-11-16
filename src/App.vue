<template>
  <div
    class="weimzh-arcade-shell"
    :class="{ 'crt-active': crtEnabled }"
    @click="unlockAudio"
    @contextmenu.prevent
  >
    <!-- Top Luxury Arcade Cabinet Marquee -->
    <header class="arcade-marquee">
      <div class="marquee-left">
        <div class="neon-logo">
          <span class="logo-jp">麻雀電子基盤</span>
          <span class="logo-en">WEIMZH ARCADE · PVP REBORN</span>
        </div>

        <!-- Mode Badge: PVE vs 1v1 PVP -->
        <div class="mode-badge" :class="{ pvp: isPvpMode || isRoomConnected }">
          <span class="mode-dot"></span>
          <span>{{ isPvpMode ? `🟢 1v1 真人联机 (#${roomId})` : isRoomConnected ? `🟡 好友已进房 (#${roomId})` : '🕹️ 单机闯关模式 (PVE)' }}</span>
        </div>

        <div class="stage-pill" v-if="curGirl >= 0">
          <span class="pill-tag">{{ isPvpMode ? '对手形象' : `STAGE ${String.fromCharCode(65 + curGirl)}` }}</span>
          <span class="pill-name">{{ girlNames[curGirl] }}</span>
        </div>
      </div>

      <div class="marquee-center">
        <div class="led-scoreboard">
          <div class="led-item" :class="{ 'speaking-glow': remoteSpeaking }">
            <span class="led-lbl">{{ isPvpMode ? `🔊 ${opponentName}` : '电脑 COMPUTER' }}</span>
            <span class="led-val bot">{{ botScore }}</span>
          </div>
          <div class="led-divider">VS</div>
          <div class="led-item" :class="{ 'speaking-glow': localSpeaking }">
            <span class="led-lbl">🎙️ {{ myName }}</span>
            <span class="led-val ply">{{ playerScore }}</span>
          </div>
          <div class="led-divider">|</div>
          <div class="led-item">
            <span class="led-lbl">{{ isPvpMode ? `押注 ${betAmount} 筹码` : 'DONDEN 换牌' }}</span>
            <span class="led-val donden">{{ isPvpMode ? `${playerChips} 币` : `${dondenLeft} 次` }}</span>
          </div>
        </div>
      </div>

      <div class="marquee-right">
        <!-- PRD 4.6: Floating WebRTC Voice Capsule (Default Mic ON) -->
        <div class="voice-capsule" :class="{ 'is-speaking': localSpeaking || remoteSpeaking }">
          <button
            class="voice-circle-btn"
            :class="{ on: micOn, off: !micOn, pulse: localSpeaking }"
            @click.stop="toggleMic"
            title="一键开麦/闭麦 (进房默认开启)"
          >
            {{ micOn ? '🎙️ 开麦中' : '🔇 已闭麦' }}
          </button>
          <button
            class="voice-circle-btn speaker"
            :class="{ on: speakerOn, off: !speakerOn, pulse: remoteSpeaking }"
            @click.stop="toggleSpeaker"
            title="收听/静音对方语音"
          >
            {{ speakerOn ? '🔊 听筒:开' : '🔈 听筒:关' }}
          </button>
          <span v-if="localSpeaking || remoteSpeaking" class="ducking-tag" title="智能背景音闪避已触发 (-8dB)">
            📉 BGM闪避
          </span>
        </div>

        <!-- PRD 4.4: Prominent Guandan-style 1-Click Invite Capsule Button -->
        <button class="sys-btn invite-capsule" @click.stop="openInviteModal">
          🤝 邀请好友对战 {{ roomPeersCount > 1 ? `(${roomPeersCount}/2 在线)` : '' }}
        </button>

        <button class="sys-btn" :class="{ off: !musicOn }" @click.stop="toggleMusic">
          {{ musicOn ? '🎵 音乐' : '🔇 音乐' }}
        </button>
        <button class="sys-btn" :class="{ off: !soundOn }" @click.stop="toggleSound">
          {{ soundOn ? '🔊 音效' : '🔇 音效' }}
        </button>
        <button class="sys-btn" @click.stop="crtEnabled = !crtEnabled">
          {{ crtEnabled ? '📺 CRT' : '📺 纯净' }}
        </button>
      </div>
    </header>

    <!-- PRD 4.4.1: Seamless PVE -> PVP Transition Banner when Friend Joins Room -->
    <transition name="fade">
      <div v-if="showPvpHandoverBanner && !isPvpMode" class="pvp-handover-banner">
        <div class="banner-left">
          <span class="pulse-badge">🎉 好友已进房</span>
          <span class="banner-txt">
            好友 <strong>【{{ opponentName }}】</strong> 已通过邀请链接进入房间 (#{{ roomId }})，语音通道已默认连通！
          </span>
        </div>
        <div class="banner-actions">
          <button class="handover-btn primary" @click.stop="startPvpImmediately">
            ⚡ 立即重开 1v1 真人局 (押注 {{ betAmount }} 筹码)
          </button>
          <button class="handover-btn secondary" @click.stop="queuePvpAfterRound">
            🀄 打完当前手自动切换
          </button>
        </div>
      </div>
    </transition>

    <!-- PRD 4.4.1: 30-Second Disconnect Reconnect Banner & 1-Click AI Takeover -->
    <transition name="fade">
      <div v-if="disconnectCountdown > 0" class="disconnect-banner">
        <span>⚠️ 对手【{{ opponentName }}】网络波动断线，正在等待重连 ({{ disconnectCountdown }}s)...</span>
        <button class="takeover-btn" @click.stop="handleAiTakeover">
          🤖 立即由电脑 AI 托管接管
        </button>
      </div>
    </transition>

    <!-- Main Center Workspace: 640x480 Authentic Canvas + Side Panels -->
    <main class="cabinet-body">
      <!-- Left Panel: PVP Voice/Room Status + Arcade Secret DIP Switches -->
      <aside class="side-panel left-panel">
        <!-- PVP Live Room & Voice Card -->
        <div class="panel-card pvp-card">
          <div class="card-title">🌐 1v1 联机房间 & 实时语音</div>
          <div class="room-status-box">
            <div class="r-row">
              <span class="r-lbl">当前房间号:</span>
              <span class="r-val code">#{{ roomId || '未创建' }}</span>
            </div>
            <div class="r-row">
              <span class="r-lbl">对战状态:</span>
              <span class="r-val" :class="{ online: isRoomConnected }">
                {{ isPvpMode ? '🔥 1v1 真人激战中' : isRoomConnected ? '🟢 好友已就绪' : '🤖 单机 AI 陪练中' }}
              </span>
            </div>
            <div class="r-row">
              <span class="r-lbl">语音状态:</span>
              <span class="r-val voice">{{ voiceStatusText }}</span>
            </div>
          </div>

          <!-- Quick Voice Taunts / Emotes (with TTS & Audio Ducking) -->
          <div class="quick-voice-title">💬 快捷语音喊话 (带语音合成):</div>
          <div class="emote-grid">
            <button
              v-for="(txt, idx) in quickVoiceLines"
              :key="idx"
              class="emote-btn"
              @click.stop="sendQuickVoice(txt)"
            >
              🔊 {{ txt }}
            </button>
          </div>
        </div>

        <!-- Secret DIP Switches -->
        <div class="panel-card">
          <div class="card-title">🕹️ 街机秘技 & 彩蛋开关</div>
          <button
            class="dip-btn"
            :class="{ active: bonusQueued }"
            @click.stop="triggerNextBonus"
          >
            ⏰ 下局必出：配牌出血时钟游戏
          </button>
          <button
            class="dip-btn"
            :class="{ active: sangenQueued }"
            @click.stop="triggerNextSanGen"
          >
            🀄 下局必出：三元特快换字牌
          </button>
          <button
            class="dip-btn"
            :class="{ active: firstChanceQueued }"
            @click.stop="triggerNextFirstChance"
          >
            🎁 下局必出：开局换牌机会
          </button>
          <button
            class="dip-btn"
            :class="{ active: reachBonusActive }"
            @click.stop="triggerReachBonus"
          >
            🔥 激活本局：立直必胡
          </button>
          <button class="dip-btn gold" @click.stop="triggerInstantWin">
            ⚡ 立即胡牌 (闪电自摸与结算)
          </button>
          <button class="dip-btn" @click.stop="addPlayerCredit">
            🪙 投币加分 (玩家 +10000 点)
          </button>
        </div>
      </aside>

      <!-- Center 4:3 CRT Bezel & 640x480 Native SDL Canvas -->
      <div class="crt-monitor-frame">
        <div class="crt-glass">
          <canvas
            ref="gameCanvas"
            width="640"
            height="480"
            class="weimzh-canvas"
            @pointerdown="onCanvasPointerDown"
            @pointermove="onCanvasPointerMove"
            @pointerup="onCanvasPointerUp"
          ></canvas>

          <!-- PRD 4.1: Dynamic Action Bubbles on Bottom-Right of Screen -->
          <div class="dynamic-action-bubbles">
            <button
              v-if="validActions.mahjong"
              class="bubble-btn bubble-ron"
              @click.stop="triggerPlayerAction(3)"
            >
              ⚡ 胡 (RON)
            </button>
            <button
              v-if="validActions.reach"
              class="bubble-btn bubble-reach"
              @click.stop="triggerPlayerAction(7)"
            >
              🔥 听 (REACH)
            </button>
            <button
              v-if="validActions.kong"
              class="bubble-btn bubble-meld"
              @click.stop="triggerPlayerAction(6)"
            >
              杠 (KONG)
            </button>
            <button
              v-if="validActions.pung"
              class="bubble-btn bubble-meld"
              @click.stop="triggerPlayerAction(4)"
            >
              碰 (PUNG)
            </button>
            <button
              v-if="validActions.chow"
              class="bubble-btn bubble-meld"
              @click.stop="triggerPlayerAction(5)"
            >
              吃 (CHOW)
            </button>
          </div>

          <!-- Hover / Selected Tile Magnified Preview Indicator (PRD 4.1.2) -->
          <div v-if="hoveredTileLetter" class="swipe-hint-pill">
            🀄 当前选牌: <strong>[{{ hoveredTileLetter }}]</strong> · 单击/上滑 30px 直接打出
          </div>

          <!-- Voice Chat Emote Bubble Overlay -->
          <transition name="fade">
            <div v-if="chatBubbleText" class="voice-chat-bubble">
              🎙️ {{ chatBubbleText }}
            </div>
          </transition>

          <transition name="fade">
            <div v-if="toastText" class="cabinet-toast">{{ toastText }}</div>
          </transition>
        </div>
      </div>

      <!-- Right Stage Switcher & Action Panel -->
      <aside class="side-panel right-panel">
        <div class="panel-card">
          <div class="card-title">👩 四大原版女主选关</div>
          <div class="girl-grid">
            <button
              v-for="(gName, idx) in girlNames"
              :key="idx"
              class="girl-select-btn"
              :class="{ current: curGirl === idx }"
              @click.stop="switchGirl(idx)"
            >
              <span class="g-letter">{{ String.fromCharCode(65 + idx) }}</span>
              <span class="g-name">{{ gName }}</span>
            </button>
          </div>
        </div>

        <div class="panel-card">
          <div class="card-title">⚡ 街机动作面板</div>
          <div class="action-grid">
            <button
              class="act-btn chow"
              :class="{ valid: validActions.chow }"
              @click.stop="triggerPlayerAction(5)"
            >
              吃 牌 (CHOW)
            </button>
            <button
              class="act-btn pung"
              :class="{ valid: validActions.pung }"
              @click.stop="triggerPlayerAction(4)"
            >
              碰 牌 (PUNG)
            </button>
            <button
              class="act-btn kong"
              :class="{ valid: validActions.kong }"
              @click.stop="triggerPlayerAction(6)"
            >
              杠 牌 (KONG)
            </button>
            <button
              class="act-btn reach"
              :class="{ valid: validActions.reach }"
              @click.stop="triggerPlayerAction(7)"
            >
              听 牌 (REACH)
            </button>
            <button
              class="act-btn ron"
              :class="{ valid: validActions.mahjong }"
              @click.stop="triggerPlayerAction(3)"
            >
              和 牌 (MAHJONG)
            </button>
            <button
              class="act-btn donden"
              :disabled="dondenLeft <= 0"
              @click.stop="sendKey('y')"
            >
              换 牌 DONDEN [Y]
            </button>
            <button class="act-btn confirm" @click.stop="sendKey('Enter')">
              摸牌 / 确认 [Space/Enter]
            </button>
          </div>
        </div>
      </aside>
    </main>

    <!-- Bottom Physical Mahjong Keyboard Deck (A - N) -->
    <footer class="arcade-control-deck">
      <div class="deck-inner">
        <button
          v-for="letter in tileLetters"
          :key="letter"
          class="mahjong-key-btn"
          :class="{
            'draw-key': letter === 'N',
            'hovered-key': hoveredTileLetter === letter,
          }"
          @click.stop="sendKey(letter.toLowerCase())"
        >
          <span class="key-cap">{{ letter }}</span>
          <span class="key-sub">{{ letter === 'N' ? '摸牌/打牌' : '手牌' }}</span>
        </button>
      </div>
    </footer>

    <!-- PRD 4.4: Guandan-style 1-Click Invite & PVP Lobby Modal -->
    <transition name="fade">
      <div v-if="showInviteModal" class="modal-backdrop" @click.self="showInviteModal = false">
        <div class="invite-modal">
          <div class="modal-header">
            <h3>🤝 电子基盘 · 1v1 好友联机开黑房 (#{{ roomId }})</h3>
            <button class="close-btn" @click="showInviteModal = false">✕</button>
          </div>

          <div class="modal-body">
            <!-- Step 1: Share Link -->
            <div class="invite-section">
              <label class="sec-label">1. 复制专属邀请链接发给微信/QQ好友（或在本机新开标签页测试）：</label>
              <div class="link-copy-row">
                <input type="text" readonly :value="inviteUrl" class="link-input" />
                <button class="copy-primary-btn" @click="copyInviteLink">📋 一键复制链接</button>
                <button class="open-tab-btn" @click="openSecondTabForTest" title="在同一台电脑直接弹出第二个窗口模拟好友进房对战">
                  🖥️ 双开窗口测试联机
                </button>
              </div>
              <div v-if="lanInviteUrl" class="lan-url-row">
                <span>📱 局域网/手机 Wi-Fi 直连地址：</span>
                <code>{{ lanInviteUrl }}</code>
                <button class="mini-copy-btn" @click="copyLanLink">复制局域网链接</button>
              </div>
            </div>

            <!-- Step 2: Select Character & Bet Chips (PRD 4.4.2) -->
            <div class="invite-grid-2col">
              <div class="invite-section">
                <label class="sec-label">2. 选择您的代表角色（败北将触发退阶动画）：</label>
                <div class="modal-girl-selector">
                  <button
                    v-for="(gName, idx) in girlShortNames"
                    :key="idx"
                    class="m-girl-btn"
                    :class="{ selected: mySelectedGirl === idx }"
                    @click="selectMyPvpGirl(idx)"
                  >
                    <img :src="`/weimzh/images/mjgirl${idx + 1}b.jpg`" class="m-girl-thumb" />
                    <span>{{ String.fromCharCode(65 + idx) }}: {{ gName }}</span>
                  </button>
                </div>
              </div>

              <div class="invite-section">
                <label class="sec-label">3. 本局押注筹码 (10 ~ 99 币，番数翻倍结算)：</label>
                <div class="bet-selector-box">
                  <input
                    type="range"
                    min="10"
                    max="99"
                    v-model.number="betAmount"
                    @change="syncMyMeta"
                    class="bet-slider"
                  />
                  <div class="bet-display">当前押注: <strong>{{ betAmount }}</strong> 筹码/番</div>
                </div>

                <label class="sec-label" style="margin-top: 12px;">4. 房间内在线玩家 ({{ roomPeers.length }}/2)：</label>
                <div class="roster-list">
                  <div v-for="p in roomPeers" :key="p.peerId" class="roster-item">
                    <span class="r-dot">🟢</span>
                    <span class="r-name">{{ p.name }} {{ p.peerId === myPeerId ? '(我)' : '(好友)' }}</span>
                    <span class="r-char">角色: {{ girlShortNames[p.girl] || '结衣' }}</span>
                  </div>
                  <div v-if="roomPeers.length < 2" class="roster-waiting">
                    ⏳ 等待好友点击链接进入房间（进房默认开启实时语音）...
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showInviteModal = false">
              先玩单机 (好友进房自动提醒)
            </button>
            <button
              class="modal-btn start-pvp"
              :disabled="roomPeers.length < 2"
              @click="startPvpImmediately"
            >
              ⚡ {{ roomPeers.length >= 2 ? '好友已就绪！立即开始 1v1 真人局' : '等待好友进房后可开局' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { CGeneral, SoundId, TILE_WIDTH } from './weimzh/general'
import { CGame, playeraction } from './weimzh/player'
import { CTile } from './weimzh/tile'
import { handtile_flags } from './weimzh/hand'
import { PvpManager, type PvpPeerInfo } from './weimzh/pvpManager'

const gameCanvas = ref<HTMLCanvasElement | null>(null)
const crtEnabled = ref(true)
const musicOn = ref(true)
const soundOn = ref(true)
const toastText = ref('')
const chatBubbleText = ref('')

const curGirl = ref(-1)
const playerScore = ref(10000)
const botScore = ref(16000)
const dondenLeft = ref(8)

// PVP & Voice Reactive State
const roomId = ref('')
const myPeerId = ref('')
const myName = ref('街机雀神')
const opponentName = ref('电脑')
const isRoomConnected = ref(false)
const isPvpMode = ref(false)
const showInviteModal = ref(false)
const showPvpHandoverBanner = ref(false)
const queuePvpNextRound = ref(false)
const roomPeers = ref<PvpPeerInfo[]>([])
const lanIps = ref<string[]>([])

const mySelectedGirl = ref(2)
const betAmount = ref(20)
const playerChips = ref(1000)
const opponentChips = ref(1000)

const micOn = ref(true)
const speakerOn = ref(true)
const localSpeaking = ref(false)
const remoteSpeaking = ref(false)
const voiceStatusText = ref('🎙️ 默认开麦待机')

const disconnectCountdown = ref(0)
let disconnectTimer: any = null

// Touch / Swipe-Up gesture state (PRD 4.1)
const hoveredTileLetter = ref('')
let pointerDownPos: { x: number; y: number; tileLetter: string; time: number } | null = null
let lastTapInfo: { letter: string; time: number } = { letter: '', time: 0 }

const bonusQueued = ref(false)
const sangenQueued = ref(false)
const firstChanceQueued = ref(false)
const reachBonusActive = ref(false)

const girlNames = [
  '美纪 (Miki · 16000点)',
  '留美 (Rumi · 24000点)',
  '结衣 (Yui · 48000点)',
  '雅子 (Masako · 100000点)',
]
const girlShortNames = ['美纪 (Miki)', '留美 (Rumi)', '结衣 (Yui)', '雅子 (Masako)']

const quickVoiceLines = [
  '快点出牌呀，花儿都谢了！',
  '立直！这把大牌跑不了！',
  '承让承让，清一色跳满！',
  '手气太旺，再来决战一局！',
]

const tileLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']

const validActions = reactive({
  chow: false,
  pung: false,
  kong: false,
  reach: false,
  mahjong: false,
})

const roomPeersCount = computed(() => roomPeers.value.length)
const inviteUrl = computed(() => `${window.location.origin}/?room=${roomId.value || '884821'}`)
const lanInviteUrl = computed(() => {
  if (lanIps.value.length === 0) return ''
  return `http://${lanIps.value[0]}:3000/?room=${roomId.value || '884821'}`
})

let general: CGeneral | null = null
let game: CGame | null = null
const pvp = new PvpManager()

const showToast = (msgStr: string) => {
  toastText.value = msgStr
  setTimeout(() => {
    if (toastText.value === msgStr) toastText.value = ''
  }, 2600)
}

const syncUIState = () => {
  if (!game) return
  curGirl.value = game.m_iCurGirl
  playerScore.value = game.m_pPlayer.m_iScore
  botScore.value = game.m_pBot.m_iScore
  dondenLeft.value = Math.max(0, game.m_iTotalDonDen - game.m_iDonDen)
  isPvpMode.value = game.isPvpMode
  opponentName.value = game.pvpOpponentName
  playerChips.value = game.pvpPlayerChips
  opponentChips.value = game.pvpOpponentChips

  bonusQueued.value = game.forceNextBonusGame
  sangenQueued.value = game.forceNextSanGenRush
  firstChanceQueued.value = game.forceNextFirstChance
  reachBonusActive.value = game.m_fReachBonus

  const st = game.m_pPlayer.currentActionState
  validActions.chow = game.m_pPlayer.ActionIsValid(st, playeraction.PA_CHOW)
  validActions.pung = game.m_pPlayer.ActionIsValid(st, playeraction.PA_PUNG)
  validActions.kong = game.m_pPlayer.ActionIsValid(st, playeraction.PA_KONG)
  validActions.reach = game.m_pPlayer.ActionIsValid(st, playeraction.PA_REACH)
  validActions.mahjong = game.m_pPlayer.ActionIsValid(st, playeraction.PA_MAHJONG)
}

const unlockAudio = () => {
  if (general && general.currentAudio && general.currentAudio.paused && musicOn.value) {
    general.currentAudio.play().catch(() => {})
  }
}

const sendKey = (k: string) => {
  unlockAudio()
  if (general) {
    general.pushKey(k)
  }
}

const triggerPlayerAction = (act: playeraction) => {
  unlockAudio()
  if (!game || !general) return
  const st = game.m_pPlayer.currentActionState
  if (game.m_pPlayer.ActionIsValid(st, act)) {
    general.pushKey(`ACT:${act}`)
  } else {
    showToast('当前牌型不满足该动作条件')
  }
}

// =========================================================
// PRD 4.1: Touch & Swipe-Up (>30px) + Double Tap + Scrubbing
// =========================================================
const getTileLetterAtCanvasXY = (x: number, y: number): string => {
  if (y < 365) return ''
  const idx = Math.floor((x - 20) / TILE_WIDTH)
  if (idx >= 0 && idx <= 12) return String.fromCharCode(65 + idx)
  if (idx >= 13) return 'N'
  return ''
}

const onCanvasPointerDown = (e: PointerEvent) => {
  unlockAudio()
  if (!general || !gameCanvas.value) return
  const rect = gameCanvas.value.getBoundingClientRect()
  const scaleX = 640 / rect.width
  const scaleY = 480 / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  if (e.button === 2) {
    general.handleCanvasMouseDown(x, y, 2)
    return
  }

  const letter = getTileLetterAtCanvasXY(x, y)
  if (letter && general.m_iCurMusic !== 4) {
    hoveredTileLetter.value = letter
    pointerDownPos = { x, y, tileLetter: letter, time: Date.now() }
    if (navigator.vibrate) navigator.vibrate(10)
    return
  }

  general.handleCanvasMouseDown(x, y, e.button)
}

const onCanvasPointerMove = (e: PointerEvent) => {
  if (!gameCanvas.value) return
  const rect = gameCanvas.value.getBoundingClientRect()
  const scaleX = 640 / rect.width
  const scaleY = 480 / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY
  const letter = getTileLetterAtCanvasXY(x, y)
  if (letter) {
    hoveredTileLetter.value = letter
  } else if (!pointerDownPos) {
    hoveredTileLetter.value = ''
  }
}

const onCanvasPointerUp = (e: PointerEvent) => {
  if (!general || !gameCanvas.value || !pointerDownPos) return
  const rect = gameCanvas.value.getBoundingClientRect()
  const scaleY = 480 / rect.height
  const y = (e.clientY - rect.top) * scaleY
  const deltaY = y - pointerDownPos.y
  const letter = pointerDownPos.tileLetter
  pointerDownPos = null

  // PRD 4.1.2: Swipe up > 30px OR tap/double-tap to discard
  if (deltaY < -30) {
    showToast(`🀄 上滑出牌: [${letter}]`)
    general.pushKey(letter.toLowerCase())
    return
  }

  const now = Date.now()
  if (lastTapInfo.letter === letter && now - lastTapInfo.time < 350) {
    general.pushKey(letter.toLowerCase())
    lastTapInfo = { letter: '', time: 0 }
  } else {
    lastTapInfo = { letter, time: now }
    general.pushKey(letter.toLowerCase())
  }
}

const onKeyDown = (e: KeyboardEvent) => {
  unlockAudio()
  if (!general || showInviteModal.value) return
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault()
  }
  general.pushKey(e.key)
}

// =========================================================
// PRD 4.4 & 4.6: PVP Room & WebRTC Voice Chat Handlers
// =========================================================
const ensureRoomJoined = () => {
  if (!roomId.value) {
    const newId = Math.floor(100000 + Math.random() * 900000).toString()
    roomId.value = newId
    window.history.replaceState({}, '', `/?room=${newId}`)
  }
  pvp.joinRoom(roomId.value)
  lanIps.value = pvp.lanIps
  setTimeout(() => {
    lanIps.value = [...pvp.lanIps]
  }, 500)
}

const openInviteModal = () => {
  unlockAudio()
  ensureRoomJoined()
  showInviteModal.value = true
  navigator.clipboard?.writeText(inviteUrl.value).catch(() => {})
  showToast('🤝 已创建专属房间并复制邀请链接！')
}

const copyInviteLink = () => {
  navigator.clipboard?.writeText(inviteUrl.value)
  showToast('📋 邀请链接已复制，快发给好友或粘贴到新窗口吧！')
}

const copyLanLink = () => {
  if (!lanInviteUrl.value) return
  navigator.clipboard?.writeText(lanInviteUrl.value)
  showToast('📱 局域网直连链接已复制！')
}

const openSecondTabForTest = () => {
  window.open(inviteUrl.value, '_blank')
}

const selectMyPvpGirl = (idx: number) => {
  mySelectedGirl.value = idx
  syncMyMeta()
}

const syncMyMeta = () => {
  pvp.updateMyMeta(mySelectedGirl.value, betAmount.value)
}

const startPvpImmediately = () => {
  showInviteModal.value = false
  showPvpHandoverBanner.value = false
  pvp.requestStartPvpMatch()
}

const queuePvpAfterRound = () => {
  showPvpHandoverBanner.value = false
  queuePvpNextRound.value = true
  showToast('🀄 已设置：本手单机牌局结束后将自动切入 1v1 真人对战！')
}

const handleAiTakeover = () => {
  if (disconnectTimer) {
    clearInterval(disconnectTimer)
    disconnectTimer = null
  }
  disconnectCountdown.value = 0
  game?.switchToAiTakeover()
  showToast('🤖 已由电脑 AI 自动托管接管牌局！')
}

const sendQuickVoice = (text: string) => {
  ensureRoomJoined()
  pvp.sendVoiceEmote(text)
}

const toggleMusic = () => {
  if (!general) return
  musicOn.value = !musicOn.value
  general.isMusicMuted = !musicOn.value
  if (musicOn.value) {
    general.PlayBGMusic(general.m_iCurMusic >= 0 ? general.m_iCurMusic : 0)
  } else {
    general.PlayMusic(null)
  }
}

const toggleSound = () => {
  if (!general) return
  soundOn.value = !soundOn.value
  general.isSoundMuted = !soundOn.value
}

const toggleMic = () => {
  ensureRoomJoined()
  micOn.value = pvp.toggleMic()
  voiceStatusText.value = pvp.voiceStatus
  showToast(micOn.value ? '🎙️ 麦克风已开启 (实时语音通话)' : '🔇 麦克风已静音')
}

const toggleSpeaker = () => {
  speakerOn.value = pvp.toggleSpeaker()
  showToast(speakerOn.value ? '🔊 已开启对方语音收听' : '🔈 已静音对方语音')
}

const triggerNextBonus = () => {
  if (!game) return
  game.forceNextBonusGame = !game.forceNextBonusGame
  syncUIState()
  showToast(game.forceNextBonusGame ? '⏰ 已预约：下一局必进「配牌出血」时钟奖励游戏！' : '已取消预约')
}

const triggerNextSanGen = () => {
  if (!game) return
  game.forceNextSanGenRush = !game.forceNextSanGenRush
  syncUIState()
  showToast(game.forceNextSanGenRush ? '🀄 已预约：下一局必出「三元特快」换字牌！' : '已取消预约')
}

const triggerNextFirstChance = () => {
  if (!game) return
  game.forceNextFirstChance = !game.forceNextFirstChance
  syncUIState()
  showToast(game.forceNextFirstChance ? '🎁 已预约：下一局开局可自由换牌！' : '已取消预约')
}

const triggerReachBonus = () => {
  if (!game) return
  game.m_fReachBonus = true
  syncUIState()
  showToast('🔥 已激活「本局立直必胡」！听牌立直后摸牌必自摸！')
}

const addPlayerCredit = () => {
  if (!game || !general) return
  game.m_pPlayer.m_iScore += 10000
  general.PlaySound(SoundId.SND_SOUND1)
  if (game.m_iCurGirl >= 0) {
    game.DrawScore()
  }
  syncUIState()
  showToast('🪙 投币成功！玩家分数 +10000 点')
}

const switchGirl = (idx: number) => {
  unlockAudio()
  if (!game || !general) return
  if (game.m_iCurGirl === -1) {
    general.pushKey(String.fromCharCode(97 + idx))
  } else {
    game.m_iCurGirl = idx
    general.DrawBG(idx, 0)
    game.m_pPlayer.DrawHand()
    game.m_pPlayer.DrawDiscarded()
    game.m_pBot.DrawHand()
    game.m_pBot.DrawDiscarded()
    game.DrawScore()
    game.DrawDonDen()
    general.DrawTurn(game.m_iRound, 387, 202)
    general.DrawTiles(null, 7, 415, 215, 102, 0)
    general.DrawTiles(null, 7, 415, 200, 102, 0)
    general.DrawTile(game.m_Dora[0], Math.floor(415 + 42 * 0.7 * 2), 200, 2, 0)
    general.PlaySound(SoundId.SND_DING)
    syncUIState()
    showToast(`👩 已切换对手为：${girlNames[idx]}`)
  }
}

const triggerInstantWin = () => {
  unlockAudio()
  if (!game || !general) return
  if (game.m_iCurGirl === -1) {
    general.pushKey('a')
    setTimeout(() => triggerInstantWin(), 1500)
    return
  }
  const h = game.m_pPlayer.m_Hand
  h.NewHand()
  const winningCodes = ['1C', '1C', '1C', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '9C', '9C', '5C']
  for (let i = 0; i < 13; i++) {
    h.AddTile(new CTile(winningCodes[i]), 0)
  }
  h.AddTile(new CTile(winningCodes[13]), handtile_flags.HT_JUSTGOT)
  game.m_pPlayer.DrawHand()
  syncUIState()
  general.pushKey(`ACT:${playeraction.PA_MAHJONG}`)
}

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  myPeerId.value = pvp.peerId
  myName.value = pvp.myName

  // Setup PVP Callbacks
  pvp.onRosterUpdate = (peers, joinedPeerId) => {
    roomPeers.value = [...peers]
    isRoomConnected.value = peers.length >= 2
    voiceStatusText.value = pvp.voiceStatus
    lanIps.value = [...pvp.lanIps]

    const opp = pvp.getOpponentPeer()
    if (opp) {
      opponentName.value = opp.name
      if (disconnectTimer) {
        clearInterval(disconnectTimer)
        disconnectTimer = null
        disconnectCountdown.value = 0
      }
      if (joinedPeerId && joinedPeerId !== pvp.peerId) {
        general?.PlaySound(SoundId.SND_DING)
        showToast(`🎉 好友【${opp.name}】已进入房间！实时语音已连通！`)
        showPvpHandoverBanner.value = true
      } else if (!isPvpMode.value) {
        showPvpHandoverBanner.value = true
      }
    }
  }

  pvp.onPeerDisconnected = () => {
    isRoomConnected.value = false
    if (isPvpMode.value) {
      disconnectCountdown.value = 30
      if (disconnectTimer) clearInterval(disconnectTimer)
      disconnectTimer = setInterval(() => {
        if (disconnectCountdown.value > 1) {
          disconnectCountdown.value--
        } else {
          handleAiTakeover()
        }
      }, 1000)
    } else {
      showPvpHandoverBanner.value = false
      showToast('👋 好友已离开房间')
    }
  }

  pvp.onStartPvpMatch = (payload) => {
    showInviteModal.value = false
    showPvpHandoverBanner.value = false
    if (game) {
      game.startPvpMatchNow(payload)
      showToast(`🔥 1v1 真人对战开始！对手: 【${game.pvpOpponentName}】 (押注 ${payload.betAmount} 筹码)`)
    }
  }

  pvp.onOpponentDonden = () => {
    if (game && game.isPvpMode) {
      game.DonDen()
      showToast('⚡ 对手发动了 DONDEN 乾坤换牌！')
    }
  }

  pvp.onSpeakingChange = (localSpk, remoteSpk) => {
    localSpeaking.value = localSpk
    remoteSpeaking.value = remoteSpk
    general?.setAudioDucking(localSpk || remoteSpk)
  }

  pvp.onChatEmote = (sender, text) => {
    chatBubbleText.value = `${sender}: “${text}”`
    setTimeout(() => {
      chatBubbleText.value = ''
    }, 3500)
  }

  if (gameCanvas.value) {
    general = new CGeneral(gameCanvas.value)
    await general.initAssets()
    game = new CGame(general)
    game.pvpManager = pvp
    game.onUIUpdate = syncUIState

    const params = new URLSearchParams(window.location.search)
    const urlRoom = params.get('room')
    if (urlRoom) {
      roomId.value = urlRoom
      pvp.joinRoom(urlRoom)
      showToast(`🔗 已通过邀请链接进入房间 #${urlRoom}，默认已开麦！`)
    } else {
      pvp.fetchLanInfo().then(() => {
        lanIps.value = [...pvp.lanIps]
      })
    }

    if (params.get('girl')) {
      const g = parseInt(params.get('girl') || '0', 10)
      if (g >= 0 && g <= 3) {
        game.m_iCurGirl = g
      }
    }

    game.RunGame()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  pvp.leaveRoom()
})
</script>

<style scoped>
.weimzh-arcade-shell {
  width: 100vw;
  height: 100vh;
  background: radial-gradient(circle at center, #161f33 0%, #070a12 100%);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  user-select: none;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}

/* Top Marquee */
.arcade-marquee {
  height: 54px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 2px solid #eab308;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  z-index: 20;
}

.marquee-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.neon-logo {
  display: flex;
  flex-direction: column;
}
.logo-jp {
  font-size: 16px;
  font-weight: 900;
  color: #fde047;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(250, 204, 21, 0.7);
}
.logo-en {
  font-size: 9px;
  color: #38bdf8;
  letter-spacing: 1px;
  font-weight: 700;
}

.mode-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1e293b;
  border: 1px solid #475569;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  color: #cbd5e1;
}
.mode-badge.pvp {
  background: #064e3b;
  border-color: #10b981;
  color: #a7f3d0;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
}

.stage-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #111827;
  border: 1px solid #3b82f6;
  padding: 3px 10px;
  border-radius: 6px;
}
.pill-tag {
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  padding: 2px 5px;
  border-radius: 3px;
}
.pill-name {
  font-size: 12px;
  font-weight: 700;
  color: #fef08a;
}

.led-scoreboard {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #030712;
  border: 2px solid #15803d;
  padding: 4px 14px;
  border-radius: 6px;
  box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.25);
}
.led-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  transition: box-shadow 0.15s;
}
.led-item.speaking-glow {
  box-shadow: 0 0 14px #4ade80, inset 0 0 8px rgba(74, 222, 128, 0.4);
  background: rgba(22, 163, 74, 0.25);
}
.led-lbl {
  font-size: 11px;
  font-weight: 800;
  color: #4ade80;
}
.led-val {
  font-family: "Courier New", monospace;
  font-size: 17px;
  font-weight: 900;
}
.led-val.bot { color: #f87171; }
.led-val.ply { color: #fde047; }
.led-val.donden { color: #38bdf8; }
.led-divider {
  font-size: 11px;
  color: #475569;
  font-weight: 900;
}

.marquee-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* PRD 4.6: Floating Voice Capsule */
.voice-capsule {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #0f172a;
  border: 1px solid #334155;
  padding: 3px 6px;
  border-radius: 999px;
}
.voice-capsule.is-speaking {
  border-color: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.5);
}
.voice-circle-btn {
  border: none;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}
.voice-circle-btn.on {
  background: #065f46;
  color: #ecfdf5;
}
.voice-circle-btn.off {
  background: #7f1d1d;
  color: #fecaca;
}
.voice-circle-btn.pulse {
  animation: pulseAura 0.6s infinite alternate;
}
@keyframes pulseAura {
  0% { box-shadow: 0 0 4px #4ade80; }
  100% { box-shadow: 0 0 14px #4ade80, 0 0 22px #fde047; }
}
.ducking-tag {
  font-size: 10px;
  color: #fde047;
  font-weight: 800;
  padding: 0 4px;
}

.sys-btn {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 5px 9px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.sys-btn:hover {
  background: #334155;
}
.sys-btn.invite-capsule {
  background: linear-gradient(90deg, #059669 0%, #10b981 100%);
  border-color: #34d399;
  color: #ffffff;
  padding: 5px 12px;
  border-radius: 999px;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
}

/* PVE -> PVP Handover Banner */
.pvp-handover-banner {
  background: linear-gradient(90deg, #064e3b 0%, #0f172a 100%);
  border-bottom: 2px solid #10b981;
  padding: 7px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 25;
}
.banner-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.pulse-badge {
  background: #10b981;
  color: #022c22;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.banner-actions {
  display: flex;
  gap: 10px;
}
.handover-btn {
  padding: 5px 14px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  border: 1px solid transparent;
}
.handover-btn.primary {
  background: #f59e0b;
  color: #000;
  border-color: #fde047;
}
.handover-btn.secondary {
  background: #1e293b;
  color: #e2e8f0;
  border-color: #475569;
}

.disconnect-banner {
  background: #7f1d1d;
  border-bottom: 2px solid #ef4444;
  padding: 6px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 800;
  z-index: 25;
}
.takeover-btn {
  background: #fde047;
  color: #000;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-weight: 900;
  cursor: pointer;
}

/* Center Cabinet Body */
.cabinet-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  min-height: 0;
}

.side-panel {
  width: 255px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-card {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
}
.pvp-card {
  border-color: #059669;
}

.card-title {
  font-size: 13px;
  font-weight: 900;
  color: #fbbf24;
  margin-bottom: 7px;
  border-bottom: 1px solid #334155;
  padding-bottom: 4px;
}

.room-status-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  margin-bottom: 8px;
}
.r-row {
  display: flex;
  justify-content: space-between;
}
.r-lbl { color: #94a3b8; }
.r-val { font-weight: 800; color: #e2e8f0; }
.r-val.code { color: #38bdf8; font-family: monospace; font-size: 13px; }
.r-val.online { color: #4ade80; }
.r-val.voice { color: #fde047; }

.quick-voice-title {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 5px;
}
.emote-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.emote-btn {
  text-align: left;
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;
}
.emote-btn:hover {
  background: #065f46;
  border-color: #10b981;
  color: #fff;
}

.dip-btn {
  width: 100%;
  text-align: left;
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 6px 9px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 700;
  margin-bottom: 5px;
  cursor: pointer;
  transition: all 0.15s;
}
.dip-btn:hover {
  background: #334155;
  border-color: #38bdf8;
}
.dip-btn.active {
  background: #065f46;
  border-color: #34d399;
  color: #fef08a;
}
.dip-btn.gold {
  background: linear-gradient(90deg, #b45309 0%, #d97706 100%);
  border-color: #fde047;
  color: #fff;
}

/* CRT Monitor Frame */
.crt-monitor-frame {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111827;
  padding: 10px;
  border-radius: 14px;
  border: 4px solid #374151;
  box-shadow: 0 0 50px rgba(0, 0, 0, 0.9), inset 0 0 20px rgba(0, 0, 0, 0.8);
}

.crt-glass {
  position: relative;
  height: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 0 25px rgba(56, 189, 248, 0.2);
}

.weimzh-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: pointer;
  touch-action: none;
}

.crt-active .crt-glass::after {
  content: " ";
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
  background-size: 100% 3px;
  pointer-events: none;
  z-index: 10;
}

/* PRD 4.1.3: Dynamic Action Bubbles */
.dynamic-action-bubbles {
  position: absolute;
  right: 16px;
  bottom: 110px;
  display: flex;
  gap: 10px;
  z-index: 25;
}
.bubble-btn {
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 900;
  color: #fff;
  cursor: pointer;
  border: 2px solid #fde047;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.85);
  animation: popSpring 0.35s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
.bubble-ron {
  background: radial-gradient(circle, #ef4444 0%, #991b1b 100%);
  box-shadow: 0 0 20px #ef4444;
}
.bubble-reach {
  background: radial-gradient(circle, #f97316 0%, #9a3412 100%);
  box-shadow: 0 0 18px #f97316;
}
.bubble-meld {
  background: rgba(30, 41, 59, 0.92);
  border-color: #cbd5e1;
}
@keyframes popSpring {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.swipe-hint-pill {
  position: absolute;
  bottom: 112px;
  left: 20px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid #facc15;
  color: #fef08a;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  pointer-events: none;
  z-index: 20;
}

.voice-chat-bubble {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(6, 95, 70, 0.95);
  border: 2px solid #34d399;
  color: #ecfdf5;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  z-index: 30;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
}

.cabinet-toast {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  border: 2px solid #facc15;
  color: #fef08a;
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 800;
  z-index: 30;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
}

/* Right Panel */
.girl-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.girl-select-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1e293b;
  border: 1px solid #475569;
  color: #f1f5f9;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.girl-select-btn:hover { background: #334155; }
.girl-select-btn.current {
  background: #1e3a8a;
  border-color: #38bdf8;
}
.g-letter {
  background: #eab308;
  color: #000;
  font-weight: 900;
  padding: 1px 7px;
  border-radius: 3px;
}

.action-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.act-btn {
  padding: 7px 12px;
  border-radius: 5px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #94a3b8;
  font-size: 12.5px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.15s;
}
.act-btn.valid {
  color: #fff;
  border-color: #fde047;
  box-shadow: 0 0 12px rgba(250, 204, 21, 0.6);
  animation: pulseBtn 0.9s infinite alternate;
}
.act-btn.chow.valid { background: #0284c7; }
.act-btn.pung.valid { background: #16a34a; }
.act-btn.kong.valid { background: #7c3aed; }
.act-btn.reach.valid { background: #ea580c; }
.act-btn.ron.valid { background: #dc2626; }
.act-btn.donden {
  background: #422006;
  border-color: #ca8a04;
  color: #fde047;
}
.act-btn.confirm {
  background: #1e3a8a;
  border-color: #3b82f6;
  color: #fff;
}

@keyframes pulseBtn {
  0% { transform: scale(1); }
  100% { transform: scale(1.03); }
}

/* Bottom Mahjong Physical Keys */
.arcade-control-deck {
  height: 60px;
  background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
  border-top: 2px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  z-index: 20;
}
.deck-inner {
  display: flex;
  gap: 8px;
}
.mahjong-key-btn {
  width: 56px;
  height: 42px;
  background: linear-gradient(180deg, #fef08a 0%, #eab308 100%);
  border: 2px solid #713f12;
  border-bottom-width: 4px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.08s;
}
.mahjong-key-btn.hovered-key {
  transform: translateY(-4px);
  box-shadow: 0 0 14px #fde047;
}
.mahjong-key-btn:active {
  transform: translateY(2px);
  border-bottom-width: 2px;
}
.mahjong-key-btn.draw-key {
  margin-left: 14px;
  background: linear-gradient(180deg, #fca5a5 0%, #ef4444 100%);
  border-color: #7f1d1d;
}
.key-cap {
  font-size: 15px;
  font-weight: 900;
  color: #0f172a;
  line-height: 1;
}
.mahjong-key-btn.draw-key .key-cap { color: #fff; }
.key-sub {
  font-size: 9px;
  font-weight: 800;
  color: #422006;
  margin-top: 2px;
}
.mahjong-key-btn.draw-key .key-sub { color: #fef2f2; }

/* Invite Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.82);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.invite-modal {
  width: 680px;
  max-width: 94vw;
  background: #0f172a;
  border: 2px solid #10b981;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9);
  overflow: hidden;
}
.modal-header {
  background: linear-gradient(90deg, #064e3b 0%, #0f172a 100%);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #10b981;
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #ecfdf5;
}
.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
}
.modal-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sec-label {
  display: block;
  font-size: 12.5px;
  font-weight: 800;
  color: #fde047;
  margin-bottom: 8px;
}
.link-copy-row {
  display: flex;
  gap: 8px;
}
.link-input {
  flex: 1;
  background: #020617;
  border: 1px solid #334155;
  color: #38bdf8;
  padding: 8px 12px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 13px;
}
.copy-primary-btn {
  background: #10b981;
  color: #022c22;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 900;
  cursor: pointer;
}
.open-tab-btn {
  background: #2563eb;
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 800;
  cursor: pointer;
}
.lan-url-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}
.lan-url-row code {
  color: #4ade80;
  background: #020617;
  padding: 2px 6px;
  border-radius: 4px;
}
.mini-copy-btn {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.invite-grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.modal-girl-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.m-girl-btn {
  background: #1e293b;
  border: 2px solid #334155;
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.m-girl-btn.selected {
  border-color: #fde047;
  background: #1e3a8a;
}
.m-girl-thumb {
  width: 100%;
  height: 58px;
  object-fit: cover;
  border-radius: 4px;
}
.bet-selector-box {
  background: #020617;
  border: 1px solid #334155;
  padding: 10px;
  border-radius: 6px;
}
.bet-slider {
  width: 100%;
}
.bet-display {
  font-size: 13px;
  color: #cbd5e1;
  margin-top: 4px;
}
.bet-display strong {
  color: #fde047;
  font-size: 16px;
}
.roster-list {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.roster-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.r-name { font-weight: 800; color: #f8fafc; }
.r-char { color: #fde047; }
.roster-waiting {
  color: #94a3b8;
  font-size: 11.5px;
}
.modal-footer {
  padding: 12px 20px;
  background: #020617;
  border-top: 1px solid #1e293b;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.modal-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  border: none;
}
.modal-btn.cancel {
  background: #334155;
  color: #e2e8f0;
}
.modal-btn.start-pvp {
  background: linear-gradient(90deg, #f59e0b 0%, #ea580c 100%);
  color: #fff;
}
.modal-btn.start-pvp:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
