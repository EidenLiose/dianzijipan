<template>
  <div
    class="weimzh-arcade-shell"
    :class="{ 'crt-active': crtEnabled, 'fullscreen-mode': isFullscreen }"
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

        <!-- Mode Badge: PVE vs 2P/4P Public PVP -->
        <div class="mode-badge" :class="{ pvp: isPvpMode || isRoomConnected }">
          <span class="mode-dot"></span>
          <span>{{
            isPvpMode
              ? pvpGameMode === '4P'
                ? `🀄 四人麻将联机 (#${roomId})`
                : `🟢 1v1 真人联机 (#${roomId})`
              : isRoomConnected
              ? `🟡 雀友已进房 (#${roomId})`
              : '🕹️ 单机闯关模式 (PVE)'
          }}</span>
        </div>

        <div v-if="roomId" class="stage-pill">
          <span class="pill-tag">{{ publicConnected ? '🌐 公网已连通' : '📡 局域网/本地' }}</span>
          <span class="pill-name">{{ allowDonden ? '🎪 街机娱乐' : '🏆 公平竞技' }}</span>
        </div>

        <div class="stage-pill" v-else-if="curGirl >= 0">
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
          <div class="led-item" :class="{ 'speaking-glow': localSpeaking }" @click.stop="editMyName" title="点击修改我的昵称" style="cursor: pointer;">
            <span class="led-lbl">🎙️ {{ myName }} ✏️</span>
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
          🤝 公网/好友联机 {{ roomPeersCount > 1 ? `(${roomPeersCount}/${pvpGameMode === '4P' ? 4 : 2} 在线)` : '' }}
        </button>

        <button class="sys-btn" :class="{ off: !musicOn }" @click.stop="toggleMusic">
          {{ musicOn ? '🎵 音乐' : '🔇 音乐' }}
        </button>
        <button class="sys-btn" :class="{ off: !soundOn }" @click.stop="toggleSound">
          {{ soundOn ? '🔊 音效' : '🔇 音效' }}
        </button>
        <button
          class="sys-btn autoplay-top-btn"
          :class="{ active: isAutoPlay }"
          @click.stop="toggleAutoPlay"
          title="开启或关闭电脑 AI 自动托管代打"
        >
          {{ isAutoPlay ? '🤖 托管中(取消)' : '🤖 电脑托管' }}
        </button>
        <button class="sys-btn fullscreen-entry-btn" @click.stop="toggleFullscreen" title="进入沉浸全屏模式，隐藏两侧与上下控制面板">
          {{ isFullscreen ? '✕ 退出全屏' : '⛶ 全屏专注' }}
        </button>
        <button class="sys-btn" @click.stop="crtEnabled = !crtEnabled">
          {{ crtEnabled ? '📺 CRT' : '📺 纯净' }}
        </button>
        <button class="sys-btn" @click.stop="restartMatch" title="清空当前牌局进度并重新选关开局">
          🔄 重开
        </button>
      </div>
    </header>

    <!-- PRD 4.4.1: Seamless PVE -> PVP Transition Banner when Friend Joins Room -->
    <transition name="fade">
      <div v-if="showPvpHandoverBanner && !isPvpMode" class="pvp-handover-banner">
        <div class="banner-left">
          <span class="pulse-badge">🎉 雀友已进房 ({{ roomPeersCount }}人)</span>
          <span class="banner-txt">
            好友 <strong>【{{ opponentName }}】</strong> 已进入公网房间 (#{{ roomId }})，语音已默认连通！
          </span>
        </div>
        <div class="banner-actions">
          <button class="handover-btn primary" @click.stop="startPvpImmediately">
            ⚡ 立即开局 ({{ pvpGameMode === '4P' ? '🀄 四人麻将·AI补位' : '⚔️ 1v1 真人死斗' }})
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
          <div class="card-title">🌐 公网/局域网房间 & 实时语音</div>
          <div class="room-status-box">
            <div class="r-row">
              <span class="r-lbl">当前房间号:</span>
              <span class="r-val code">#{{ roomId || '未创建' }}</span>
            </div>
            <div class="r-row">
              <span class="r-lbl">公网通道:</span>
              <span class="r-val" :class="{ online: publicConnected }">
                {{ publicStatusText }}
              </span>
            </div>
            <div class="r-row">
              <span class="r-lbl">对战状态:</span>
              <span class="r-val" :class="{ online: isRoomConnected || isPvpMode }">
                {{
                  isPvpMode
                    ? pvpGameMode === '4P'
                      ? '🀄 四人麻将激战中'
                      : '🔥 1v1 真人激战中'
                    : isRoomConnected
                    ? `🟢 ${roomPeersCount}人已就绪`
                    : '🤖 单机 AI 陪练中'
                }}
              </span>
            </div>
            <div class="r-row">
              <span class="r-lbl">语音状态:</span>
              <span class="r-val voice">{{ voiceStatusText }}</span>
            </div>
          </div>

          <!-- Real Microphone Walkie-Talkie + Quick Voice Taunts -->
          <button
            class="walkie-btn"
            :class="{ recording: isRecordingVoice }"
            @click.stop="sendRealVoiceClip"
          >
            {{ isRecordingVoice ? '🔴 正在录制真人语音 (3秒)...' : '🎤 点击发送 3 秒真人麦克风语音' }}
          </button>

          <div class="quick-voice-title">💬 腾讯棋牌经典快捷语音 (台湾甜美女声):</div>
          <div class="emote-grid">
            <button
              v-for="(txt, idx) in quickVoiceLines"
              :key="idx"
              class="emote-btn"
              @click.stop="sendQuickVoice(txt, idx)"
            >
              🔊 {{ txt }}
            </button>
          </div>
        </div>

        <!-- In PVP Mode: Auto-replace Cheat Menu with Fair Play Scoreboard -->
        <div v-if="isPvpMode" class="panel-card pvp-standings-card">
          <div class="card-title">🏆 联机风位战况榜 ({{ pvpGameMode === '4P' ? '四人环桌' : '二人死斗' }})</div>
          <div class="seat-standings-list">
            <div
              v-for="s in seatsDisplayList"
              :key="s.seatIndex"
              class="seat-row"
              :class="{ active: activeTurnSeat === s.seatIndex, me: s.seatIndex === mySeatIndex }"
            >
              <span class="wind-badge">{{ ['东', '南', '西', '北'][s.seatIndex] }}</span>
              <div class="seat-meta">
                <div class="seat-name-line">
                  <span class="s-name">{{ s.name }}</span>
                  <span class="s-tag" :class="{ bot: s.isBot }">{{ s.isBot ? '🤖AI' : '🟢真人' }}</span>
                </div>
                <div class="seat-score-line">
                  <span>{{ s.score }} 点</span>
                  <span class="s-chips">🪙 {{ s.chips }}币</span>
                </div>
              </div>
            </div>
          </div>
          <button class="dip-btn gold" style="margin-top: 8px;" @click.stop="handleAiTakeover">
            🤖 对手掉线/不操作？立即由 AI 接管对手
          </button>
          <div class="fair-lock-notice">
            🔒 <strong>联网防作弊保护中</strong>：单机改牌/必胡/加分秘技已自动锁定（当前规则：{{
              allowDonden && pvpGameMode === '2P' ? '🎪 允许1次换牌' : '🏆 严禁DONDEN换牌'
            }}）
          </div>
        </div>

        <!-- Secret DIP Switches (Only shown in Single-Player PVE Mode) -->
        <div v-else class="panel-card">
          <div class="card-title">🕹️ 街机秘技 & 彩蛋开关 (单机专属)</div>
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

          <!-- Top-Left Live Turn Countdown & Auto-Play Status Badge -->
          <div v-if="turnCountdown > 0 && !isAutoPlay" class="turn-timer-pill" :class="{ urgent: turnCountdown <= 5 }">
            ⏱️ {{
              isWaitingOpponentTurn
                ? `等待对手操作: ${turnCountdown}s (超时AI自动接管)`
                : `出牌倒计时: ${turnCountdown}s (超时自动托管)`
            }}
          </div>
          <div v-if="isAutoPlay" class="autoplay-active-banner" @click.stop="toggleAutoPlay">
            🤖 <strong>电脑 AI 正在为您自动托管代打</strong> · 点击此处恢复手动出牌
          </div>

          <!-- Floating Mini HUD Pill (Always accessible in Fullscreen or Mobile) -->
          <div class="floating-fs-hud">
            <button
              class="fs-pill-btn"
              :class="{ active: isAutoPlay }"
              @click.stop="toggleAutoPlay"
              title="开启/关闭电脑自动托管代打"
            >
              {{ isAutoPlay ? '🤖 取消托管' : '🤖 托管' }}
            </button>
            <button v-if="isFullscreen" class="fs-pill-btn exit" @click.stop="toggleFullscreen">
              ✕ 退出全屏
            </button>
            <button v-else class="fs-pill-btn enter-mobile" @click.stop="toggleFullscreen">
              ⛶ 全屏
            </button>
            <template v-if="isFullscreen">
              <button class="fs-pill-btn" @click.stop="editMyName" title="修改昵称">
                👤 {{ myName }} ✏️
              </button>
              <button class="fs-pill-btn invite" @click.stop="openInviteModal">
                🤝 联机{{ roomId ? `(#${roomId})` : '' }}
              </button>
              <button class="fs-pill-btn" :class="{ active: micOn }" @click.stop="toggleMic">
                {{ micOn ? '🎙️' : '🔇' }}
              </button>
              <button class="fs-pill-btn" @click.stop="sendRealVoiceClip" title="发送3秒真人语音">
                🎤语音
              </button>
              <button class="fs-pill-btn" @click.stop="restartMatch" title="重开牌局">
                🔄
              </button>
            </template>
          </div>

          <!-- PRD 4.1: Dynamic Action Bubbles on Bottom-Right of Screen -->
          <div class="dynamic-action-bubbles">
            <button
              v-if="hasActivePrompt"
              class="bubble-btn bubble-confirm"
              @click.stop="sendKey('Enter')"
            >
              ✅ 确认完成 [Enter]
            </button>
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
            <button
              v-if="
                currentActionState === 0 &&
                (validActions.mahjong || validActions.kong || validActions.pung || validActions.chow)
              "
              class="bubble-btn bubble-pass"
              @click.stop="sendKey('n')"
            >
              ⏭️ 跳过/摸牌 [N]
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
          <div class="card-title">
            {{ isPvpMode ? '👩 我的出战代表形象 (联机同步)' : '👩 四大原版女主选关 (单机对手)' }}
          </div>
          <div class="girl-grid">
            <button
              v-for="(gName, idx) in girlNames"
              :key="idx"
              class="girl-select-btn"
              :class="{ current: (isPvpMode ? mySelectedGirl : curGirl) === idx }"
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
              :disabled="dondenLeft <= 0 || (isPvpMode && (!allowDonden || pvpGameMode === '4P'))"
              @click.stop="sendKey('y')"
            >
              {{
                isPvpMode && (!allowDonden || pvpGameMode === '4P')
                  ? '🔒 联机禁换牌 (公平规则)'
                  : `换 牌 DONDEN [Y] (${dondenLeft})`
              }}
            </button>
            <button class="act-btn confirm" @click.stop="sendKey('Enter')">
              摸牌 / 确认 [Space/Enter]
            </button>
            <button
              class="act-btn autoplay-panel-btn"
              :class="{ active: isAutoPlay }"
              @click.stop="toggleAutoPlay"
            >
              {{ isAutoPlay ? '🤖 电脑托管中 [点击恢复手动]' : '🤖 开启电脑 AI 自动托管' }}
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

    <!-- PRD 4.4: Guandan-style 1-Click Invite & Public 2P/4P PVP Lobby Modal -->
    <transition name="fade">
      <div v-if="showInviteModal" class="modal-backdrop" @click.self="showInviteModal = false">
        <div class="invite-modal">
          <div class="modal-header">
            <h3>🌐 电子基盘 · 公网跨网 & 四人麻将联机大厅 (#{{ roomId }})</h3>
            <div class="header-badges">
              <span class="pub-pill" :class="{ ok: publicConnected }">{{ publicStatusText }}</span>
              <button class="close-btn" @click="showInviteModal = false">✕</button>
            </div>
          </div>

          <div class="modal-body">
            <!-- Step 0: Prominent Nickname Editor -->
            <div class="invite-section nick-edit-section">
              <div class="nick-edit-row">
                <span class="sec-label" style="margin-bottom: 0;">👤 我的固定昵称（刷新保持不变，方便牌友识别）：</span>
                <input
                  type="text"
                  v-model="customNameInput"
                  placeholder="输入您的个性化昵称"
                  maxlength="14"
                  class="nick-input"
                  @keyup.enter="saveCustomNickname"
                />
                <button class="save-nick-btn" @click="saveCustomNickname">💾 保存昵称</button>
              </div>
            </div>

            <!-- Step 1: Share Link OR Join by 6-Digit Public Room Code -->
            <div class="invite-section">
              <label class="sec-label">1. 一链入房 / 输入 6 位房间号跨公网直连（支持异地宽带、手机5G、多开窗口）：</label>
              <div class="link-copy-row">
                <input type="text" readonly :value="inviteUrl" class="link-input" />
                <button class="copy-primary-btn" @click="copyInviteLink">📋 一键复制链接</button>
                <button class="open-tab-btn" @click="openSecondTabForTest" title="在同一台电脑直接弹出新窗口模拟多位雀友进房对战">
                  🖥️ 弹出新窗口测试联机
                </button>
              </div>
              <div class="join-code-row">
                <span class="join-lbl">🔑 跨公网加入好友房间号：</span>
                <input
                  type="text"
                  v-model="joinRoomInput"
                  placeholder="输入6位房间号 (如 884821)"
                  maxlength="12"
                  class="room-code-input"
                />
                <button class="mini-join-btn" @click="joinCustomRoom">🌐 立即跨网加入该房</button>
                <span class="lan-inline">
                  | 🌍 公网域名直连: <code>{{ publicDomainUrl }}</code>
                  <button class="mini-copy-btn" @click="copyPublicDomainLink">复制公网链接</button>
                </span>
              </div>
            </div>

            <!-- Step 2: Mode (2P Default vs 4P) & Fair Rule Switch -->
            <div class="invite-grid-2col">
              <div class="invite-section">
                <label class="sec-label">2. 选择对局模式（默认二人模式）与防作弊规则：</label>
                <div class="mode-switch-grid">
                  <button
                    class="rule-card-btn"
                    :class="{ selected: pvpGameMode === '2P' }"
                    @click="setGameMode('2P')"
                  >
                    <div class="rc-title">⚔️ 二人街机死斗 (1v1 默认)</div>
                    <div class="rc-desc">原版电子基盘二人对坐、17列牌河满贯死斗</div>
                  </button>
                  <button
                    class="rule-card-btn"
                    :class="{ selected: pvpGameMode === '4P' }"
                    @click="setGameMode('4P')"
                  >
                    <div class="rc-title">🀄 四人环桌麻将 (4P 东南西北)</div>
                    <div class="rc-desc">支持 1~4 名真人同桌，空位由街机 AI 自动补齐</div>
                  </button>
                </div>

                <div class="rule-toggle-row" style="margin-top: 8px;">
                  <button
                    class="fair-btn"
                    :class="{ selected: !allowDonden }"
                    @click="setAllowDonden(false)"
                  >
                    🏆 公平竞技 (禁DONDEN换牌/禁秘技)
                  </button>
                  <button
                    class="fair-btn"
                    :class="{ selected: allowDonden }"
                    :disabled="pvpGameMode === '4P'"
                    @click="setAllowDonden(true)"
                  >
                    🎪 街机娱乐 (1v1限1次DONDEN换牌)
                  </button>
                </div>

                <label class="sec-label" style="margin-top: 10px;">3. 选择您的出战代表角色（实时同步）：</label>
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
                <label class="sec-label">4. 本局押注筹码 (10 ~ 99 币，番数翻倍结算)：</label>
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

                <label class="sec-label" style="margin-top: 12px;">
                  5. 房间座位席 ({{ roomPeers.length }}/{{ pvpGameMode === '4P' ? 4 : 2 }} 真人在线，空位由 AI 自动补位)：
                </label>
                <div class="roster-list">
                  <div
                    v-for="seatIdx in (pvpGameMode === '4P' ? [0, 1, 2, 3] : [0, 1])"
                    :key="seatIdx"
                    class="roster-item"
                  >
                    <span class="wind-pill">{{ ['东', '南', '西', '北'][seatIdx] }}</span>
                    <template v-if="roomPeers[seatIdx]">
                      <span class="r-dot">🟢</span>
                      <span class="r-name">
                        {{ roomPeers[seatIdx].name }}
                        {{ roomPeers[seatIdx].peerId === myPeerId ? '(我)' : '(真人雀友)' }}
                      </span>
                      <span class="r-char">角色: {{ girlShortNames[roomPeers[seatIdx].girl] || '结衣' }}</span>
                    </template>
                    <template v-else>
                      <span class="r-dot">🤖</span>
                      <span class="r-name bot-slot">电脑 AI 自动补位 ({{ girlShortNames[(mySelectedGirl + seatIdx) % 4] }})</span>
                      <span class="r-char">待好友进房顶替</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showInviteModal = false">
              返回单机 (好友进房自动提醒)
            </button>
            <button
              class="modal-btn start-pvp"
              :disabled="pvpGameMode === '2P' && roomPeers.length < 2"
              @click="startPvpImmediately"
            >
              ⚡ {{
                pvpGameMode === '4P'
                  ? `立即开局四人麻将 (${roomPeers.length}真人 + ${Math.max(0, 4 - roomPeers.length)}AI补位)`
                  : roomPeers.length >= 2
                  ? '好友已就绪！立即开始 1v1 真人局'
                  : '1v1 模式等待第 2 位好友进房 (或切换上方四人模式含AI立即开局)'
              }}
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
const isFullscreen = ref(false)
const isAutoPlay = ref(false)
const turnCountdown = ref(0)
const isWaitingOpponentTurn = ref(false)
const isRecordingVoice = ref(false)
const hasActivePrompt = ref(false)
const currentActionState = ref(0)
const roomId = ref('')
const joinRoomInput = ref('')
const customNameInput = ref('')
const myPeerId = ref('')
const myName = ref('街机雀神')
const opponentName = ref('电脑')
const isRoomConnected = ref(false)
const isPvpMode = ref(false)
const pvpGameMode = ref<'2P' | '4P'>('2P')
const allowDonden = ref(false)
const publicConnected = ref(false)
const publicStatusText = ref('🌐 公网待机')
const showInviteModal = ref(false)
const showPvpHandoverBanner = ref(false)
const queuePvpNextRound = ref(false)
const roomPeers = ref<PvpPeerInfo[]>([])
const lanIps = ref<string[]>([])
const mySeatIndex = ref(0)
const activeTurnSeat = ref(0)
const seatsDisplayList = ref<
  { seatIndex: number; name: string; girl: number; isBot: boolean; score: number; chips: number }[]
>([])

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
  '快点吧，我等的花儿都谢了！',
  '不要走，决战到天亮！',
  '你是MM还是GG？',
  '和你合作真是太愉快了！',
  '你的牌打得也太好了吧！',
  '怎么又断线了，网络怎么这么差呀！',
  '下次再玩吧，我要走了。',
  '再见了，我会想念大家的。',
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
const inviteUrl = computed(() => {
  const origin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin
    : `https://mj.eduready.ai`
  return `${origin}/?room=${roomId.value || '884821'}`
})
const publicDomainUrl = computed(() => `https://mj.eduready.ai/?room=${roomId.value || '884821'}`)
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
  pvpGameMode.value = game.isPvpMode ? game.pvpGameMode : pvp.gameMode
  allowDonden.value = game.isPvpMode ? game.allowDonden : pvp.allowDonden
  opponentName.value = game.pvpOpponentName
  playerChips.value = game.pvpPlayerChips
  opponentChips.value = game.pvpOpponentChips
  mySeatIndex.value = game.mySeatIndex
  activeTurnSeat.value = game.activeTurnSeat
  isAutoPlay.value = game.isAutoPlay
  turnCountdown.value = game.turnCountdown
  isWaitingOpponentTurn.value = game.isWaitingOpponentTurn

  if (game.isPvpMode && game.seats4P.length > 0) {
    seatsDisplayList.value = game.seats4P.map((s) => ({
      seatIndex: s.seatIndex,
      name: s.name,
      girl: s.girl,
      isBot: s.isBot,
      score: s.playerObj.m_iScore,
      chips: s.chips,
    }))
  } else if (game.isPvpMode) {
    seatsDisplayList.value = [
      { seatIndex: 0, name: myName.value, girl: mySelectedGirl.value, isBot: false, score: game.m_pPlayer.m_iScore, chips: game.pvpPlayerChips },
      { seatIndex: 1, name: game.pvpOpponentName, girl: game.m_iCurGirl, isBot: false, score: game.m_pBot.m_iScore, chips: game.pvpOpponentChips },
    ]
  }

  bonusQueued.value = game.forceNextBonusGame
  sangenQueued.value = game.forceNextSanGenRush
  firstChanceQueued.value = game.forceNextFirstChance
  reachBonusActive.value = game.m_fReachBonus

  const st = game.m_pPlayer.currentActionState
  currentActionState.value = st
  hasActivePrompt.value = Boolean(general?.hasActivePrompt)
  validActions.chow = game.m_pPlayer.ActionIsValid(st, playeraction.PA_CHOW)
  validActions.pung = game.m_pPlayer.ActionIsValid(st, playeraction.PA_PUNG)
  validActions.kong = game.m_pPlayer.ActionIsValid(st, playeraction.PA_KONG)
  validActions.reach = game.m_pPlayer.ActionIsValid(st, playeraction.PA_REACH)
  validActions.mahjong = game.m_pPlayer.ActionIsValid(st, playeraction.PA_MAHJONG)
}

const unlockAudio = () => {
  pvp.unlockVoiceAudio()
  if (general && general.currentAudio && general.currentAudio.paused && musicOn.value) {
    general.currentAudio.play().catch(() => {})
  }
}

const toggleAutoPlay = () => {
  unlockAudio()
  if (!game) return
  const next = game.toggleAutoPlay()
  isAutoPlay.value = next
  showToast(next ? '🤖 已开启电脑 AI 自动托管代打！' : '🖐️ 已恢复手动出牌')
}

const sendRealVoiceClip = async () => {
  unlockAudio()
  ensureRoomJoined()
  if (isRecordingVoice.value) return
  isRecordingVoice.value = true
  showToast('🎤 正在录制 3 秒真人语音，请直接对麦克风说话...')
  const ok = await pvp.recordAndSendVoiceClip(3000)
  isRecordingVoice.value = false
  if (ok) {
    showToast('✅ 真人语音已发送给全房牌友！')
  } else {
    showToast('⚠️ 未检测到麦克风权限，已为您发送快捷语音提示')
    pvp.sendVoiceEmote(quickVoiceLines[0], 0)
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
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return
  unlockAudio()
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
    return
  }
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
  customNameInput.value = myName.value
  showInviteModal.value = true
  navigator.clipboard?.writeText(inviteUrl.value).catch(() => {})
  showToast('🤝 已创建专属房间并复制邀请链接！')
}

const toggleFullscreen = async () => {
  unlockAudio()
  const next = !isFullscreen.value
  isFullscreen.value = next
  try {
    if (next && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    } else if (!next && document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen()
    }
  } catch {}
  showToast(next ? '⛶ 已进入全屏专注模式（点击右上角可随时退出）' : '已退出全屏模式')
}

const saveCustomNickname = () => {
  const trimmed = customNameInput.value.trim()
  if (!trimmed) {
    showToast('⚠️ 昵称不能为空')
    return
  }
  pvp.setMyName(trimmed)
  myName.value = pvp.myName
  customNameInput.value = pvp.myName
  showToast(`✅ 您的昵称已保存为：【${myName.value}】`)
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

const copyPublicDomainLink = () => {
  navigator.clipboard?.writeText(publicDomainUrl.value)
  showToast('🌍 公网域名对战链接 (https://mj.eduready.ai) 已复制！')
}

const openSecondTabForTest = () => {
  const sep = inviteUrl.value.includes('?') ? '&' : '?'
  window.open(`${inviteUrl.value}${sep}guest=1`, '_blank')
}

const editMyName = () => {
  const next = window.prompt('请输入您的固定昵称（自动保存，刷新不变）：', myName.value)
  if (next && next.trim()) {
    pvp.setMyName(next.trim())
    myName.value = pvp.myName
    showToast(`✏️ 昵称已更新为：${myName.value}`)
  }
}

const restartMatch = () => {
  if (!game) return
  if (game.isPvpMode) {
    if (window.confirm('确定要结束当前联机对局并返回单机重开吗？')) {
      pvp.leaveRoom()
      roomId.value = ''
      window.history.replaceState({}, '', '/')
      game.restartSinglePlayerMatch()
      showToast('🔄 已返回单机重开新局')
    }
  } else {
    game.restartSinglePlayerMatch()
    showToast('🔄 已清空本局快照，请重新选择对手开局！')
  }
}

const selectMyPvpGirl = (idx: number) => {
  mySelectedGirl.value = idx
  syncMyMeta()
}

const setGameMode = (mode: '2P' | '4P') => {
  pvpGameMode.value = mode
  if (mode === '4P') allowDonden.value = false
  syncMyMeta()
}

const setAllowDonden = (val: boolean) => {
  allowDonden.value = val
  syncMyMeta()
}

const joinCustomRoom = () => {
  const code = joinRoomInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '')
  if (!code) {
    showToast('⚠️ 请输入有效的房间号')
    return
  }
  roomId.value = code
  window.history.replaceState({}, '', `/?room=${code}`)
  pvp.joinRoom(code)
  showToast(`🌐 已跨公网加入房间 #${code}，正在同步座位...`)
}

const syncMyMeta = () => {
  pvp.updateMyMeta(mySelectedGirl.value, betAmount.value, pvpGameMode.value, allowDonden.value)
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

const sendQuickVoice = (text: string, idx?: number) => {
  unlockAudio()
  ensureRoomJoined()
  pvp.sendVoiceEmote(text, idx)
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
  if (game.isPvpMode) {
    // In PVP mode: switching girl changes your own representative avatar & broadcasts it!
    mySelectedGirl.value = idx
    syncMyMeta()
    general.PlaySound(SoundId.SND_DING)
    showToast(`👩 已更新您的联机代表角色为：${girlShortNames[idx]}`)
    return
  }
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
  customNameInput.value = pvp.myName
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFullscreen.value) {
      // Keep CSS fullscreen unless user explicitly exits or presses Esc
    }
  })

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
      disconnectCountdown.value = 60
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

  pvp.onPublicStatusChange = (connected, text) => {
    publicConnected.value = connected
    publicStatusText.value = text
  }

  pvp.onRoomRuleChange = (gMode, dondenAllowed, bet) => {
    pvpGameMode.value = gMode
    allowDonden.value = dondenAllowed
    betAmount.value = bet
  }

  pvp.onStartPvpMatch = (payload) => {
    showInviteModal.value = false
    showPvpHandoverBanner.value = false
    pvpGameMode.value = payload.gameMode || '2P'
    allowDonden.value = Boolean(payload.allowDonden)
    betAmount.value = payload.betAmount || 20
    if (game) {
      game.startPvpMatchNow(payload)
      const modeName = payload.gameMode === '4P' ? '🀄 四人麻将环桌局' : '⚔️ 1v1 真人死斗局'
      showToast(`🔥 ${modeName}开始！(押注 ${payload.betAmount} 筹码/番)`)
    }
  }

  pvp.onRoomSync = ({ match, moves }) => {
    showInviteModal.value = false
    showPvpHandoverBanner.value = false
    pvpGameMode.value = match.gameMode || '2P'
    allowDonden.value = Boolean(match.allowDonden)
    betAmount.value = match.betAmount || 20
    if (game && !game.isPvpMode) {
      game.startPvpMatchNow(match, moves)
      showToast(`🔄 已自动重连并恢复到房间 #${roomId.value} 当前牌局！`)
    }
  }

  pvp.onOpponentDonden = () => {
    if (game && game.isPvpMode && game.allowDonden && game.pvpGameMode === '2P') {
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

  pvp.onTurnCountdown = (secLeft, isWaitOpp) => {
    turnCountdown.value = secLeft
    isWaitingOpponentTurn.value = isWaitOpp
    if (game) {
      game.turnCountdown = secLeft
      game.isWaitingOpponentTurn = isWaitOpp
    }
  }

  if (gameCanvas.value) {
    general = new CGeneral(gameCanvas.value)
    await general.initAssets()
    game = new CGame(general)
    game.pvpManager = pvp
    game.onUIUpdate = syncUIState
    game.onAutoPlayTriggered = (reason) => {
      isAutoPlay.value = game?.isAutoPlay ?? false
      showToast(reason)
    }

    setInterval(() => {
      if (general) {
        hasActivePrompt.value = Boolean(general.hasActivePrompt)
      }
    }, 250)

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

/* 4P Standings & Public Lobby Styles */
.seat-standings-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.seat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 5px 8px;
}
.seat-row.active {
  border-color: #eab308;
  box-shadow: 0 0 10px rgba(234, 179, 8, 0.35);
}
.seat-row.me {
  background: rgba(16, 185, 129, 0.12);
}
.wind-badge {
  width: 22px;
  height: 22px;
  background: #1e293b;
  border: 1px solid #f59e0b;
  color: #fde047;
  font-weight: 900;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.seat-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.seat-name-line {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  font-weight: 800;
}
.s-tag {
  font-size: 10px;
  color: #4ade80;
}
.s-tag.bot {
  color: #38bdf8;
}
.seat-score-line {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #cbd5e1;
}
.s-chips {
  color: #fbbf24;
  font-weight: 700;
}
.fair-lock-notice {
  margin-top: 8px;
  padding: 6px 8px;
  background: rgba(6, 78, 59, 0.45);
  border: 1px solid #10b981;
  border-radius: 6px;
  font-size: 11px;
  color: #a7f3d0;
  line-height: 1.4;
}
.header-badges {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pub-pill {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #475569;
}
.pub-pill.ok {
  background: #064e3b;
  color: #6ee7b7;
  border-color: #10b981;
}
.join-code-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
}
.room-code-input {
  width: 140px;
  background: #020617;
  border: 1px solid #38bdf8;
  border-radius: 5px;
  padding: 4px 8px;
  color: #fde047;
  font-weight: 800;
  font-size: 12px;
}
.mini-join-btn {
  background: #0284c7;
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.mode-switch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.rule-card-btn {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 7px 9px;
  text-align: left;
  color: #e2e8f0;
  cursor: pointer;
}
.rule-card-btn.selected {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}
.rc-title {
  font-size: 12px;
  font-weight: 900;
  color: #fde047;
}
.rc-desc {
  font-size: 10.5px;
  color: #94a3b8;
  margin-top: 2px;
}
.rule-toggle-row {
  display: flex;
  gap: 6px;
}
.fair-btn {
  flex: 1;
  background: #020617;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 5px 6px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.fair-btn.selected {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}
.fair-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.wind-pill {
  background: #1e293b;
  border: 1px solid #f59e0b;
  color: #fde047;
  font-size: 11px;
  font-weight: 900;
  padding: 1px 5px;
  border-radius: 4px;
}
.bot-slot {
  color: #94a3b8;
  font-weight: 600;
}

/* Nickname Editor Section in Modal */
.nick-edit-section {
  background: rgba(14, 116, 144, 0.16);
  border: 1px solid #0ea5e9;
}
.nick-edit-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.nick-input {
  width: 180px;
  background: #020617;
  border: 1px solid #38bdf8;
  border-radius: 5px;
  padding: 5px 10px;
  color: #fde047;
  font-weight: 800;
  font-size: 13px;
}
.save-nick-btn {
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: none;
  padding: 5px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.fullscreen-entry-btn {
  background: linear-gradient(90deg, #0284c7 0%, #2563eb 100%);
  border-color: #38bdf8 !important;
  color: #fff !important;
  font-weight: 900;
}
.autoplay-top-btn.active {
  background: linear-gradient(90deg, #059669 0%, #10b981 100%) !important;
  border-color: #6ee7b7 !important;
  color: #fff !important;
  font-weight: 900;
}
.autoplay-panel-btn {
  grid-column: span 2;
  background: #1e293b;
  border: 1px solid #10b981;
  color: #6ee7b7;
}
.autoplay-panel-btn.active {
  background: linear-gradient(90deg, #059669 0%, #10b981 100%);
  color: #fff;
}
.walkie-btn {
  width: 100%;
  margin-bottom: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #38bdf8;
  background: linear-gradient(90deg, #0284c7 0%, #0369a1 100%);
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
  cursor: pointer;
}
.walkie-btn.recording {
  background: linear-gradient(90deg, #dc2626 0%, #b91c1c 100%);
  border-color: #fca5a5;
  animation: pulseGlow 0.9s infinite alternate;
}
.turn-timer-pill {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid #38bdf8;
  color: #e0f2fe;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  z-index: 34;
}
.turn-timer-pill.urgent {
  background: rgba(185, 28, 28, 0.92);
  border-color: #fca5a5;
  color: #fff;
}
.autoplay-active-banner {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(5, 150, 105, 0.92);
  border: 1.5px solid #6ee7b7;
  color: #fff;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  z-index: 36;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
}

/* Floating Fullscreen & Mobile Mini HUD */
.floating-fs-hud {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 35;
}
.fs-pill-btn {
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(148, 163, 184, 0.5);
  color: #f8fafc;
  font-size: 11.5px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
.fs-pill-btn.exit {
  background: rgba(220, 38, 38, 0.88);
  border-color: #f87171;
  color: #fff;
}
.fs-pill-btn.enter-mobile {
  background: rgba(2, 132, 199, 0.88);
  border-color: #38bdf8;
  color: #fff;
}
.fs-pill-btn.invite {
  background: rgba(234, 88, 12, 0.88);
  border-color: #fb923c;
  color: #fff;
}
.fs-pill-btn.active {
  border-color: #10b981;
  color: #6ee7b7;
}
.bubble-confirm {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: 2px solid #a7f3d0;
  color: #fff;
}
.bubble-pass {
  background: rgba(30, 41, 59, 0.92);
  border: 1.5px solid #94a3b8;
  color: #e2e8f0;
}

/* Fullscreen Focus Mode: Hide all outer chrome & maximize 4:3 Canvas */
.weimzh-arcade-shell.fullscreen-mode .arcade-marquee,
.weimzh-arcade-shell.fullscreen-mode .side-panel,
.weimzh-arcade-shell.fullscreen-mode .arcade-control-deck {
  display: none !important;
}
.weimzh-arcade-shell.fullscreen-mode .cabinet-body {
  width: 100vw;
  height: 100vh;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}
.weimzh-arcade-shell.fullscreen-mode .crt-monitor-frame {
  width: 100vw;
  height: 100vh;
  padding: 0;
  border: none;
  border-radius: 0;
  background: #000;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.weimzh-arcade-shell.fullscreen-mode .crt-glass {
  width: min(100vw, calc(100vh * 4 / 3));
  height: min(100vh, calc(100vw * 3 / 4));
  border-radius: 0;
  border: none;
}

/* Mobile & Tablet Responsive Optimization (< 960px) */
@media (max-width: 960px) {
  .side-panel {
    display: none !important;
  }
  .arcade-marquee {
    height: auto;
    min-height: 44px;
    flex-wrap: wrap;
    padding: 4px 8px;
    gap: 4px;
  }
  .neon-logo .logo-en,
  .stage-pill {
    display: none;
  }
  .cabinet-body {
    flex: 1;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .crt-monitor-frame {
    width: 100%;
    height: 100%;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .crt-glass {
    width: min(99vw, calc((100vh - 96px) * 4 / 3));
    height: min(calc(100vh - 96px), calc(99vw * 3 / 4));
  }
  .arcade-control-deck {
    height: 42px;
    padding: 2px 4px;
  }
  .key-sub {
    display: none;
  }
}
</style>
