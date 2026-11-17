<template>
  <div
    class="weimzh-arcade-shell"
    :class="{
      'crt-active': crtEnabled,
      'fullscreen-mode': isFullscreen || isRotatedLandscape,
      'rotated-landscape': isRotatedLandscape,
    }"
    @click="unlockAudio"
    @contextmenu.prevent
  >
    <!-- Top Commercial Arcade Header -->
    <header class="arcade-marquee">
      <div class="marquee-left">
        <div class="neon-logo">
          <span class="logo-jp">麻雀電子基盤</span>
          <span class="logo-en">COMMERCIAL ONLINE EDITION</span>
        </div>

        <div class="online-pill" @click.stop="openLobbyTab('lobby')" title="点击查看在线公开房间大厅">
          <span class="online-dot"></span>
          <span>在线 {{ onlinePlayersCount }} 人</span>
        </div>

        <div class="mode-badge" :class="{ pvp: isPvpMode || isRoomConnected }">
          <span>{{
            isPvpMode
              ? pvpGameMode === '4P'
                ? `🀄 四人联机 (#${roomId})`
                : `⚔️ 1v1 联机 (#${roomId})`
              : isRoomConnected
              ? `🟡 房间就绪 (#${roomId})`
              : '🕹️ 街机闯关 (PVE)'
          }}</span>
        </div>
      </div>

      <div class="marquee-center">
        <div class="led-scoreboard">
          <div class="led-item" :class="{ 'speaking-glow': remoteSpeaking }">
            <span class="led-lbl">{{ isPvpMode ? `🔊 ${opponentName}` : `对手 ${girlShortNames[Math.max(0, curGirl)] || 'AI'}` }}</span>
            <span class="led-val bot">{{ botScore }}</span>
          </div>
          <div class="led-divider">VS</div>
          <div
            class="led-item"
            :class="{ 'speaking-glow': localSpeaking }"
            @click.stop="editMyName"
            title="点击修改我的昵称"
            style="cursor: pointer;"
          >
            <span class="led-lbl">{{ rankBadgeText }} · {{ myName }} ✏️</span>
            <span class="led-val ply">{{ playerScore }}</span>
          </div>
          <div class="led-divider">|</div>
          <div class="led-item wallet-item" @click.stop="openRankModal" title="点击查看生涯战绩、每日签到与全服排行榜">
            <span class="led-lbl">🪙 金豆资产</span>
            <span class="led-val donden">{{ formatChips(career.chips) }}</span>
            <button
              v-if="canClaimDaily || career.chips < 1000"
              class="welfare-dot-btn"
              @click.stop="claimWelfareQuick"
            >
              {{ career.chips < 1000 ? '领补助' : '签到' }}
            </button>
          </div>
        </div>
      </div>

      <div class="marquee-right">
        <div class="voice-capsule" :class="{ 'is-speaking': localSpeaking || remoteSpeaking }">
          <button
            class="voice-circle-btn"
            :class="{ on: micOn, off: !micOn, pulse: localSpeaking }"
            @click.stop="toggleMic"
            title="开关实时麦克风语音"
          >
            {{ micOn ? '🎙️开麦' : '🔇闭麦' }}
          </button>
          <button
            class="voice-circle-btn speaker"
            :class="{ on: speakerOn, off: !speakerOn, pulse: remoteSpeaking }"
            @click.stop="toggleSpeaker"
            title="开关听筒"
          >
            {{ speakerOn ? '🔊' : '🔈' }}
          </button>
        </div>

        <button class="sys-btn invite-capsule" @click.stop="openInviteModal">
          🤝 联机大厅 {{ roomPeersCount > 1 ? `(${roomPeersCount}/${pvpGameMode === '4P' ? 4 : 2})` : publicRooms.length > 0 ? `(${publicRooms.length}桌)` : '' }}
        </button>

        <button
          class="sys-btn autoplay-top-btn"
          :class="{ active: isAutoPlay }"
          @click.stop="toggleAutoPlay"
          title="电脑 AI 自动托管代打"
        >
          {{ isAutoPlay ? '🤖 托管中' : '🤖 托管' }}
        </button>

        <button class="sys-btn fullscreen-entry-btn" @click.stop="toggleFullscreen" title="进入沉浸全屏专注模式">
          {{ isFullscreen ? '✕ 退出' : '⛶ 全屏' }}
        </button>

        <button class="sys-btn gold-outline" @click.stop="openRankModal" title="生涯段位、每日金豆福利与全服雀神榜">
          🏆 战绩榜
        </button>

        <button class="sys-btn" @click.stop="showRulesModal = true" title="电子基盘胡牌规则与全番种图鉴">
          📖 规则
        </button>

        <button class="sys-btn" @click.stop="showSettingsModal = true" title="音效、台湾女声、防误触设置与街机实验室">
          ⚙️ 设置
        </button>
      </div>
    </header>

    <!-- Global Big-Win Broadcast & Gameplay Tip Bar -->
    <div v-if="!isFullscreen && !isRotatedLandscape" class="global-marquee-bar">
      <span class="marquee-icon">📢</span>
      <span class="marquee-content">{{ currentNoticeText }}</span>
      <div class="marquee-quick-links">
        <span class="mode-chip" @click.stop="toggleConfirmDiscardMode" title="点击切换单击直接出牌或二次确认防误触">
          {{ confirmDiscardMode ? '🛡️ 防误触: 二次点击出牌' : '⚡ 极速: 单击直接出牌' }}
        </span>
      </div>
    </div>

    <!-- Seamless PVE -> PVP Transition Banner when Friend Joins Room -->
    <transition name="fade">
      <div v-if="showPvpHandoverBanner && !isPvpMode" class="pvp-handover-banner">
        <div class="banner-left">
          <span class="pulse-badge">🎉 雀友已进房 ({{ roomPeersCount }}人)</span>
          <span class="banner-txt">
            牌友 <strong>【{{ opponentName }}】</strong> 已进入房间 (#{{ roomId }})，语音已连通！
          </span>
        </div>
        <div class="banner-actions">
          <button class="handover-btn primary" @click.stop="startPvpImmediately">
            ⚡ 立即开局 ({{ pvpGameMode === '4P' ? '🀄 四人麻将' : '⚔️ 1v1 对战' }})
          </button>
          <button class="handover-btn secondary" @click.stop="queuePvpAfterRound">
            🀄 打完本手自动切换
          </button>
        </div>
      </div>
    </transition>

    <!-- 60-Second Disconnect Reconnect Banner & 1-Click AI Takeover -->
    <transition name="fade">
      <div v-if="disconnectCountdown > 0" class="disconnect-banner">
        <span>⚠️ 对手【{{ opponentName }}】网络波动重连中 ({{ disconnectCountdown }}s)...</span>
        <button class="takeover-btn" @click.stop="handleAiTakeover">
          🤖 立即由电脑 AI 托管接管
        </button>
      </div>
    </transition>

    <!-- Main Center Workspace -->
    <main class="cabinet-body">
      <!-- Left Panel: Live Room + Tencent Quick Voice + Standings -->
      <aside class="side-panel left-panel">
        <div class="panel-card pvp-card">
          <div class="card-title">🌐 房间状态 & 快捷语音</div>
          <div class="room-status-box">
            <div class="r-row">
              <span class="r-lbl">当前房间:</span>
              <span class="r-val code">{{ roomId ? `#${roomId}` : '单机闯关 (点击联机创房)' }}</span>
            </div>
            <div class="r-row">
              <span class="r-lbl">联机网络:</span>
              <span class="r-val" :class="{ online: publicConnected }">{{ publicStatusText }}</span>
            </div>
            <div class="r-row">
              <span class="r-lbl">当前场次:</span>
              <span class="r-val">{{ isPvpMode ? `${betAmount} 金豆/番` : '单机闯关 (50豆/番)' }}</span>
            </div>
          </div>

          <button
            class="walkie-btn"
            :class="{ recording: isRecordingVoice }"
            @click.stop="sendRealVoiceClip"
          >
            {{ isRecordingVoice ? '🔴 正在录制真人语音 (3秒)...' : '🎤 按下发送 3 秒真人语音对讲' }}
          </button>

          <div class="quick-voice-title">💬 腾讯经典快捷语音 (台湾甜美女声):</div>
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

        <div v-if="isPvpMode" class="panel-card pvp-standings-card">
          <div class="card-title">🏆 实时风位积分榜 ({{ pvpGameMode === '4P' ? '四人环桌' : '二人死斗' }})</div>
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
                  <span class="s-chips">底注 {{ betAmount }}豆/番</span>
                </div>
              </div>
            </div>
          </div>
          <button class="dip-btn gold" style="margin-top: 8px;" @click.stop="handleAiTakeover">
            🤖 对手挂机？立即由 AI 接管对手
          </button>
        </div>

        <div v-else class="panel-card career-mini-card" @click.stop="openRankModal" style="cursor: pointer;">
          <div class="card-title">🏅 我的雀神生涯档案</div>
          <div class="career-mini-rows">
            <div class="r-row"><span>当前段位:</span><strong class="gold-txt">{{ rankBadgeText }}</strong></div>
            <div class="r-row"><span>欢乐金豆:</span><strong class="gold-txt">🪙 {{ formatChips(career.chips) }}</strong></div>
            <div class="r-row"><span>生涯胜率:</span><strong>{{ winRateText }} ({{ career.wins }}胜/{{ career.games }}局)</strong></div>
            <div class="r-row"><span>最大番数:</span><strong>{{ career.maxFan > 0 ? `${career.maxFan} 番` : '暂无记录' }}</strong></div>
          </div>
          <button
            class="dip-btn gold"
            style="margin-top: 8px; text-align: center;"
            @click.stop="claimWelfareQuick"
          >
            🎁 {{ canClaimDaily ? '领取今日签到 +3,000 金豆' : career.chips < 1000 ? '领取破产补助 +2,000 金豆' : '查看全服雀神排行榜' }}
          </button>
        </div>
      </aside>

      <!-- Center 4:3 CRT Bezel & 640x480 Native Canvas -->
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

          <!-- Portrait Mobile Landscape Suggestion Pill -->
          <div
            v-if="isPortraitNarrow && !isRotatedLandscape"
            class="landscape-suggest-pill"
            @click.stop="toggleRotatedLandscape"
          >
            📲 手机竖屏牌面较小？<strong>点此切换【横屏满屏】放大 2 倍！</strong>
          </div>

          <!-- Top-Left Live Turn Countdown & Auto-Play Status Badge -->
          <div v-if="turnCountdown > 0 && !isAutoPlay" class="turn-timer-pill" :class="{ urgent: turnCountdown <= 5 }">
            ⏱️ {{
              isWaitingOpponentTurn
                ? `等待对手: ${turnCountdown}s`
                : currentActionState === 0 &&
                  (validActions.mahjong || validActions.kong || validActions.pung || validActions.chow)
                ? `鸣牌响应: ${turnCountdown}s (点右下角鸣牌，或点手牌直接摸牌)`
                : `出牌思考: ${turnCountdown}s`
            }}
          </div>
          <div v-if="isAutoPlay" class="autoplay-active-banner" @click.stop="toggleAutoPlay">
            🤖 <strong>AI 自动托管代打中</strong> · 点击恢复手动
          </div>

          <!-- Floating Mini HUD Pill (Always accessible in Fullscreen, Landscape & Mobile) -->
          <div class="floating-fs-hud">
            <button
              class="fs-pill-btn"
              :class="{ active: isAutoPlay }"
              @click.stop="toggleAutoPlay"
              title="开启/关闭电脑自动托管"
            >
              {{ isAutoPlay ? '🤖 取消托管' : '🤖 托管' }}
            </button>
            <button
              class="fs-pill-btn chat-pill"
              @click.stop="showQuickChatMenu = !showQuickChatMenu"
              title="打开快捷语音喊话与真人对讲菜单"
            >
              💬 喊话
            </button>
            <button
              v-if="isPortraitNarrow || isRotatedLandscape"
              class="fs-pill-btn landscape-btn"
              :class="{ exit: isRotatedLandscape }"
              @click.stop="toggleRotatedLandscape"
            >
              {{ isRotatedLandscape ? '✕ 退出横屏' : '🔄 横屏满屏' }}
            </button>
            <button
              v-if="!isRotatedLandscape"
              class="fs-pill-btn"
              :class="{ exit: isFullscreen, 'enter-mobile': !isFullscreen }"
              @click.stop="toggleFullscreen"
            >
              {{ isFullscreen ? '✕ 退出全屏' : '⛶ 全屏' }}
            </button>
            <template v-if="isFullscreen || isRotatedLandscape">
              <button class="fs-pill-btn invite" @click.stop="openInviteModal">
                🤝 联机{{ roomId ? `(#${roomId})` : '' }}
              </button>
              <button class="fs-pill-btn" :class="{ active: micOn }" @click.stop="toggleMic">
                {{ micOn ? '🎙️' : '🔇' }}
              </button>
              <button class="fs-pill-btn" @click.stop="showSettingsModal = true" title="设置">
                ⚙️
              </button>
            </template>
          </div>

          <!-- Floating Quick Chat & Walkie-Talkie Popover (Works in Fullscreen & Mobile!) -->
          <transition name="fade">
            <div v-if="showQuickChatMenu" class="floating-chat-popover" @click.stop>
              <div class="pop-header">
                <span>💬 快捷语音 & 实时传声</span>
                <button class="pop-close" @click="showQuickChatMenu = false">✕</button>
              </div>
              <button
                class="walkie-btn"
                :class="{ recording: isRecordingVoice }"
                @click.stop="sendRealVoiceClip"
              >
                {{ isRecordingVoice ? '🔴 正在录音 (3秒)...' : '🎤 发送 3 秒真人麦克风语音' }}
              </button>
              <div class="pop-emote-list">
                <button
                  v-for="(txt, idx) in quickVoiceLines"
                  :key="idx"
                  class="pop-emote-btn"
                  @click.stop="sendQuickVoice(txt, idx); showQuickChatMenu = false"
                >
                  🔊 {{ txt }}
                </button>
              </div>
            </div>
          </transition>

          <!-- Dynamic Action Bubbles on Bottom-Right of Screen -->
          <div class="dynamic-action-bubbles">
            <button
              v-if="hasActivePrompt"
              class="bubble-btn bubble-confirm"
              @click.stop="sendKey('Enter')"
            >
              ✅ 确认继续 [Enter]
            </button>
            <button
              v-if="validActions.mahjong"
              class="bubble-btn bubble-ron"
              @click.stop="triggerPlayerAction(3)"
            >
              ⚡ 胡 (MAHJONG)
            </button>
            <button
              v-if="validActions.reach"
              class="bubble-btn bubble-reach"
              @click.stop="triggerPlayerAction(7)"
            >
              🔥 听 (立直)
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

          <!-- Commercial Tenpai Helper Overlay: Shows waiting tiles on selection OR when already in Tenpai -->
          <div v-if="activeTenpaiHints.length > 0" class="tenpai-helper-bar">
            <span class="tp-tag">💡 听牌提示</span>
            <span class="tp-desc">打出 <strong>[{{ selectedTileLetter || hoveredTileLetter }}]</strong> 可听：</span>
            <span
              v-for="w in activeTenpaiHints"
              :key="w.code"
              class="tp-tile-chip"
              :class="{ exhausted: w.remain === 0 }"
            >
              {{ w.name }} <em>剩{{ w.remain }}张</em>
            </span>
          </div>
          <div v-else-if="myWaitingTiles.length > 0" class="tenpai-helper-bar already-tenpai">
            <span class="tp-tag hot">🔥 已入听</span>
            <span class="tp-desc">当前胡牌：</span>
            <span
              v-for="w in myWaitingTiles"
              :key="w.code"
              class="tp-tile-chip"
              :class="{ exhausted: w.remain === 0 }"
            >
              {{ w.name }} <em>剩{{ w.remain }}张</em>
            </span>
          </div>
          <div v-else-if="selectedTileLetter || hoveredTileLetter" class="swipe-hint-pill">
            🀄 选牌 <strong>[{{ selectedTileLetter || hoveredTileLetter }}]</strong> ·
            {{ confirmDiscardMode ? '再次点击或上滑打出' : '单击或上滑直接打出' }}
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
            {{ isPvpMode ? '👩 我的出战角色 (实时同步)' : '👩 四大街机女主闯关选择' }}
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
                  ? '🔒 公平规则禁换牌'
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
              {{ isAutoPlay ? '🤖 托管代打中 [点击取消]' : '🤖 开启电脑 AI 自动托管' }}
            </button>
          </div>
        </div>
      </aside>
    </main>

    <!-- Bottom Physical Mahjong Keyboard Deck (A - N) with Tenpai Badges -->
    <footer class="arcade-control-deck">
      <div class="deck-inner">
        <button
          v-for="letter in tileLetters"
          :key="letter"
          class="mahjong-key-btn"
          :class="{
            'draw-key': letter === 'N',
            'hovered-key': selectedTileLetter === letter || hoveredTileLetter === letter,
            'tenpai-key': Boolean(discardTenpaiMap[letter]),
          }"
          @click.stop="onDeckKeyClick(letter)"
        >
          <span v-if="discardTenpaiMap[letter]" class="key-tenpai-dot">听</span>
          <span class="key-cap">{{ letter }}</span>
          <span class="key-sub">{{ letter === 'N' ? '摸/切' : '手牌' }}</span>
        </button>
      </div>
    </footer>

    <!-- ===================================================================== -->
    <!-- MODAL 1: Commercial Online Lobby & Private Room Modal                 -->
    <!-- ===================================================================== -->
    <transition name="fade">
      <div v-if="showInviteModal" class="modal-backdrop" @click.self="showInviteModal = false">
        <div class="invite-modal">
          <div class="modal-header">
            <h3>🌐 电子基盘 · 联机对战大厅 {{ roomId ? `(#${roomId})` : '' }}</h3>
            <div class="header-badges">
              <span class="pub-pill" :class="{ ok: publicConnected }">{{ publicStatusText }}</span>
              <button class="close-btn" @click="showInviteModal = false">✕</button>
            </div>
          </div>

          <div class="lobby-tabs">
            <button
              class="lobby-tab-btn"
              :class="{ active: lobbyTab === 'create' }"
              @click="lobbyTab = 'create'"
            >
              🏠 好友约局 / 房间设置 {{ roomId ? `(#${roomId})` : '' }}
            </button>
            <button
              class="lobby-tab-btn"
              :class="{ active: lobbyTab === 'lobby' }"
              @click="openLobbyTab('lobby')"
            >
              🌐 在线公开房间列表 ({{ publicRooms.length }})
            </button>
          </div>

          <!-- TAB A: Public Room Browser & Quick Match -->
          <div v-if="lobbyTab === 'lobby'" class="modal-body">
            <div class="quick-match-bar">
              <div>
                <div class="qm-title">🎲 公网秒匹大厅 · 当前 {{ onlinePlayersCount }} 人在线</div>
                <div class="qm-sub">无需加好友，直接加入公开等待桌，或一键创建公开招募房</div>
              </div>
              <div class="qm-actions">
                <button class="copy-primary-btn" @click="quickMatchPublicRoom">⚡ 快速匹配上桌</button>
                <button class="mini-copy-btn" @click="refreshPublicLobby">🔄 刷新列表</button>
              </div>
            </div>

            <div v-if="publicRooms.length === 0" class="empty-lobby-box">
              🀄 当前暂无公开等待中的房间，点击上方 <strong>「⚡ 快速匹配上桌」</strong> 创建首桌公开房，或切换到「好友约局」分享专属链接给牌友！
            </div>
            <div v-else class="public-room-list">
              <div v-for="rm in publicRooms" :key="rm.roomId" class="pub-room-card">
                <div class="prc-left">
                  <img :src="`/weimzh/images/mjgirl${(rm.hostGirl % 4) + 1}b.jpg`" class="prc-avatar" />
                  <div>
                    <div class="prc-host">
                      房主：<strong>{{ rm.hostName }}</strong>
                      <span class="prc-code">#{{ rm.roomId }}</span>
                    </div>
                    <div class="prc-tags">
                      <span class="prc-badge">{{ rm.gameMode === '4P' ? '🀄 四人麻将' : '⚔️ 二人死斗' }}</span>
                      <span class="prc-badge gold">🪙 底注 {{ rm.betAmount }}豆/番</span>
                      <span class="prc-badge">{{ rm.allowDonden ? '🎪 娱乐换牌' : '🏆 公平竞技' }}</span>
                    </div>
                  </div>
                </div>
                <div class="prc-right">
                  <span class="prc-count">{{ rm.peerCount }}/{{ rm.maxPeers }} 人</span>
                  <button
                    class="mini-join-btn"
                    :disabled="rm.roomId === roomId"
                    @click="joinRoomByCode(rm.roomId)"
                  >
                    {{ rm.roomId === roomId ? '已在房内' : rm.inGame ? '观战/候补' : '⚡ 立即加入' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="join-code-row" style="margin-top: 4px;">
              <span class="join-lbl">🔑 输入房间号进私密房：</span>
              <input
                type="text"
                v-model="joinRoomInput"
                placeholder="输入6位房间号 (如 123456)"
                maxlength="12"
                class="room-code-input"
                @keyup.enter="joinCustomRoom"
              />
              <button class="mini-join-btn" @click="joinCustomRoom">立即加入</button>
            </div>
          </div>

          <!-- TAB B: Friend Invite & Room Configuration -->
          <div v-else class="modal-body">
            <div class="invite-section nick-edit-section" style="padding: 8px 12px; border-radius: 6px;">
              <div class="nick-edit-row">
                <span class="sec-label" style="margin-bottom: 0;">👤 我的固定昵称：</span>
                <input
                  type="text"
                  v-model="customNameInput"
                  placeholder="输入您的个性化昵称"
                  maxlength="14"
                  class="nick-input"
                  @keyup.enter="saveCustomNickname"
                />
                <button class="save-nick-btn" @click="saveCustomNickname">💾 保存昵称</button>
                <label class="private-chk">
                  <input type="checkbox" v-model="isPrivateRoom" @change="syncMyMeta" />
                  <span>🔒 设为私密好友房</span>
                </label>
              </div>
            </div>

            <div class="invite-section">
              <label class="sec-label">1. 一键复制专属房间链接发给微信/QQ牌友（点开直接同桌语音对战）：</label>
              <div class="link-copy-row">
                <input type="text" readonly :value="inviteUrl" class="link-input" />
                <button class="copy-primary-btn" @click="copyInviteLink">📋 复制邀请链接</button>
                <button class="open-tab-btn" @click="openSecondTabForTest" title="同机多开窗口测试联机">
                  🖥️ 双开测试
                </button>
              </div>
              <div class="join-code-row">
                <span class="join-lbl">🔑 加入好友房间号：</span>
                <input
                  type="text"
                  v-model="joinRoomInput"
                  placeholder="输入房间号 (如 123456)"
                  maxlength="12"
                  class="room-code-input"
                  @keyup.enter="joinCustomRoom"
                />
                <button class="mini-join-btn" @click="joinCustomRoom">🌐 跨网加入该房</button>
              </div>
            </div>

            <div class="invite-grid-2col">
              <div class="invite-section">
                <label class="sec-label">2. 对局模式与竞技规则：</label>
                <div class="mode-switch-grid">
                  <button
                    class="rule-card-btn"
                    :class="{ selected: pvpGameMode === '2P' }"
                    @click="setGameMode('2P')"
                  >
                    <div class="rc-title">⚔️ 二人街机死斗 (默认)</div>
                    <div class="rc-desc">经典 1v1 节奏快、大牌频出</div>
                  </button>
                  <button
                    class="rule-card-btn"
                    :class="{ selected: pvpGameMode === '4P' }"
                    @click="setGameMode('4P')"
                  >
                    <div class="rc-title">🀄 四人环桌麻将 (4P)</div>
                    <div class="rc-desc">1~4 真人均可开，空位 AI 补齐</div>
                  </button>
                </div>

                <div class="rule-toggle-row" style="margin-top: 8px;">
                  <button
                    class="fair-btn"
                    :class="{ selected: !allowDonden }"
                    @click="setAllowDonden(false)"
                  >
                    🏆 公平竞技 (禁换牌)
                  </button>
                  <button
                    class="fair-btn"
                    :class="{ selected: allowDonden }"
                    :disabled="pvpGameMode === '4P'"
                    @click="setAllowDonden(true)"
                  >
                    🎪 娱乐场 (1v1限1次换牌)
                  </button>
                </div>

                <label class="sec-label" style="margin-top: 10px;">3. 我的出战代表角色：</label>
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
                <label class="sec-label">4. 选择场次底注（按胡牌番数倍增结算金豆）：</label>
                <div class="tier-btn-row">
                  <button
                    v-for="t in betTiers"
                    :key="t.bet"
                    class="tier-btn"
                    :class="{ selected: betAmount === t.bet }"
                    @click="betAmount = t.bet; syncMyMeta()"
                  >
                    <div class="t-name">{{ t.label }}</div>
                    <div class="t-val">{{ t.bet }} 豆/番</div>
                  </button>
                </div>

                <label class="sec-label" style="margin-top: 12px;">
                  5. 房间座位席 ({{ roomPeers.length }}/{{ pvpGameMode === '4P' ? 4 : 2 }} 真人在线)：
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
                        {{ roomPeers[seatIdx].peerId === myPeerId ? '(我)' : '(真人)' }}
                      </span>
                      <span class="r-char">{{ girlShortNames[roomPeers[seatIdx].girl] || '结衣' }}</span>
                    </template>
                    <template v-else>
                      <span class="r-dot">🤖</span>
                      <span class="r-name bot-slot">等待牌友进房 ({{ pvpGameMode === '4P' ? 'AI自动补位' : '复制上方链接邀请' }})</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="modal-btn cancel" @click="showInviteModal = false">
              返回牌桌 (牌友进房自动弹窗提醒)
            </button>
            <button
              class="modal-btn start-pvp"
              :disabled="pvpGameMode === '2P' && roomPeers.length < 2"
              @click="startPvpImmediately"
            >
              ⚡ {{
                pvpGameMode === '4P'
                  ? `立即开局四人麻将 (${roomPeers.length}真人 + ${Math.max(0, 4 - roomPeers.length)}AI)`
                  : roomPeers.length >= 2
                  ? '牌友已就绪！立即开始 1v1 真人对决'
                  : '等待第 2 位牌友进房...'
              }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ===================================================================== -->
    <!-- MODAL 2: Career Profile, Welfare & Global Leaderboard                 -->
    <!-- ===================================================================== -->
    <transition name="fade">
      <div v-if="showRankModal" class="modal-backdrop" @click.self="showRankModal = false">
        <div class="invite-modal rank-modal">
          <div class="modal-header">
            <h3>🏆 雀神生涯战绩 · 福利中心 & 全服富豪榜</h3>
            <button class="close-btn" @click="showRankModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="career-hero-card">
              <img :src="`/weimzh/images/mjgirl${(mySelectedGirl % 4) + 1}b.jpg`" class="career-avatar" />
              <div class="career-info">
                <div class="c-top-line">
                  <span class="c-rank-pill">{{ rankBadgeText }}</span>
                  <strong class="c-name">{{ myName }}</strong>
                </div>
                <div class="c-stats-grid">
                  <div class="c-stat"><span>欢乐金豆</span><strong class="gold-txt">🪙 {{ formatChips(career.chips) }}</strong></div>
                  <div class="c-stat"><span>总胜率</span><strong>{{ winRateText }}</strong></div>
                  <div class="c-stat"><span>总场次</span><strong>{{ career.wins }}胜 / {{ career.games }}局</strong></div>
                  <div class="c-stat"><span>最高番数</span><strong>{{ career.maxFan }} 番</strong></div>
                </div>
              </div>
              <div class="career-welfare-btns">
                <button class="copy-primary-btn" :disabled="!canClaimDaily" @click="claimDailyBonus">
                  {{ canClaimDaily ? '🎁 每日签到 (+3,000豆)' : '✅ 今日已签到' }}
                </button>
                <button
                  class="mini-join-btn"
                  :disabled="career.chips >= 1000 || reliefLeftToday <= 0"
                  @click="claimBankruptcyRelief"
                >
                  💸 破产补助 +2,000豆 (今日剩{{ reliefLeftToday }}次)
                </button>
              </div>
            </div>

            <div class="sec-label" style="margin-bottom: 4px;">🌍 全服雀神金豆排行榜 (实时同步)：</div>
            <div class="leaderboard-table">
              <div v-for="(item, i) in leaderboardList" :key="item.peerId" class="lb-row" :class="{ me: item.peerId === myPeerId }">
                <span class="lb-idx" :class="`top-${i + 1}`">{{ i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1 }}</span>
                <span class="lb-rank">{{ item.rankTitle }}</span>
                <span class="lb-name">{{ item.name }} {{ item.peerId === myPeerId ? '(我)' : '' }}</span>
                <span class="lb-win">{{ item.wins }}胜/{{ item.games }}局</span>
                <span class="lb-chips">🪙 {{ formatChips(item.chips) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ===================================================================== -->
    <!-- MODAL 3: Illustrated Rules & Yaku Reference Guide                     -->
    <!-- ===================================================================== -->
    <transition name="fade">
      <div v-if="showRulesModal" class="modal-backdrop" @click.self="showRulesModal = false">
        <div class="invite-modal rules-modal">
          <div class="modal-header">
            <h3>📖 《电子基盘》胡牌规则与全番种速查图鉴</h3>
            <button class="close-btn" @click="showRulesModal = false">✕</button>
          </div>
          <div class="modal-body scrollable-body">
            <div class="rule-alert">
              💡 <strong>新手必看 3 条核心铁律</strong>：<br />
              1. <strong>一番起胡（无役不能胡）</strong>：必须至少包含下方任意一种「番种（役）」才能胡牌；光有宝牌（Dora）不算起胡役！不确定怎么凑番时，<strong>门前清（不吃不碰）直接点「🔥 听(立直)」即可保底获得 1 番并可胡任何人的牌！</strong><br />
              2. <strong>振听禁荣和</strong>：若您听的某张牌自己曾经打过（在自己牌河里），则不能点炮荣和别人的牌，但依然可以<strong>自摸胡牌</strong>！<br />
              3. <strong>智能听牌助手</strong>：轮到您出牌时，手牌上方带有 <strong style="color:#4ade80;">● 绿点</strong> 的牌代表打出后即可入听，单击该牌即可查看具体胡哪几张、还剩几张！
            </div>

            <div class="yaku-grid">
              <div class="yaku-card">
                <div class="yk-head"><span>立直 / 一发 / 门前清自摸</span><em>各 1 番</em></div>
                <div class="yk-desc">不吃不碰听牌后点「🔥听」宣告立直即有1番；立直后一巡内胡牌加「一发」1番；门清自摸加1番。</div>
              </div>
              <div class="yaku-card">
                <div class="yk-head"><span>断幺九 (最易速胡)</span><em>1 番</em></div>
                <div class="yk-desc">手牌全部由 2~8 的万、筒、条组成（不含 1、9 及东南西北中发白），可吃可碰！</div>
              </div>
              <div class="yaku-card">
                <div class="yk-head"><span>役牌 (中/发/白/东/南)</span><em>每刻 1 番</em></div>
                <div class="yk-desc">碰出或手握 3 张红中、发财、白板，或与本局风位相同的风牌，直接满足起胡条件！</div>
              </div>
              <div class="yaku-card">
                <div class="yk-head"><span>对对和 / 三暗刻 / 七对子</span><em>各 2 番</em></div>
                <div class="yk-desc">4组刻子+1对将（对对和）；手牌3组未碰的暗刻（三暗刻）；7个不同的对子（七对子，门清限定）。</div>
              </div>
              <div class="yaku-card">
                <div class="yk-head"><span>一气通贯 / 三色同顺</span><em>门清2番 / 副露1番</em></div>
                <div class="yk-desc">同一花色集齐 123 + 456 + 789（一条龙）；或万筒条三色都有相同数字的顺子。</div>
              </div>
              <div class="yaku-card">
                <div class="yk-head"><span>混一色 / 清一色 (高番主力)</span><em>3番 / 6番</em></div>
                <div class="yk-desc">同一花色数牌 + 字牌为混一色（门清3番/副露2番）；纯同一花色数牌为清一色（门清6番跳满/副露5番满贯）！</div>
              </div>
              <div class="yaku-card yakuman">
                <div class="yk-head"><span>👑 传说役满 (大三元/四暗刻/国士无双/九莲宝灯/天和)</span><em>13 番役满</em></div>
                <div class="yk-desc">集齐中发白三刻（大三元）、门清四组暗刻单骑（四暗刻）、十三幺（国士无双）、清一色1112345678999（九莲宝灯），胡出全服广播喜报！</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ===================================================================== -->
    <!-- MODAL 4: Settings & Single-Player Arcade Laboratory                   -->
    <!-- ===================================================================== -->
    <transition name="fade">
      <div v-if="showSettingsModal" class="modal-backdrop" @click.self="showSettingsModal = false">
        <div class="invite-modal settings-modal">
          <div class="modal-header">
            <h3>⚙️ 游戏设置与街机实验室</h3>
            <button class="close-btn" @click="showSettingsModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="settings-grid">
              <button class="set-toggle-btn" :class="{ on: musicOn }" @click="toggleMusic">
                <span>🎵 街机背景音乐</span>
                <strong>{{ musicOn ? '已开启' : '已关闭' }}</strong>
              </button>
              <button class="set-toggle-btn" :class="{ on: soundOn }" @click="toggleSound">
                <span>🔊 搓牌与动作音效</span>
                <strong>{{ soundOn ? '已开启' : '已关闭' }}</strong>
              </button>
              <button class="set-toggle-btn" :class="{ on: twVoiceOn }" @click="toggleTwVoice">
                <span>👩 台湾甜美女声报牌/唱番</span>
                <strong>{{ twVoiceOn ? '已开启' : '已关闭' }}</strong>
              </button>
              <button class="set-toggle-btn" :class="{ on: confirmDiscardMode }" @click="toggleConfirmDiscardMode">
                <span>🛡️ 防误触二次点击出牌</span>
                <strong>{{ confirmDiscardMode ? '已开启 (推荐)' : '单击直接出牌' }}</strong>
              </button>
              <button class="set-toggle-btn" :class="{ on: crtEnabled }" @click="crtEnabled = !crtEnabled">
                <span>📺 CRT 街机扫描线滤镜</span>
                <strong>{{ crtEnabled ? '怀旧街机' : '高清纯净' }}</strong>
              </button>
              <button class="set-toggle-btn warn" @click="showSettingsModal = false; restartMatch()">
                <span>🔄 重新开始新牌局</span>
                <strong>立即重开</strong>
              </button>
            </div>

            <!-- Collapsible Single-Player Arcade DIP Switches -->
            <div v-if="!isPvpMode" class="arcade-lab-box">
              <div class="sec-label" style="margin-bottom: 6px;">🕹️ 单机街机秘技实验室 (仅单机闯关可用，联机自动锁定)：</div>
              <div class="lab-grid">
                <button class="dip-btn" :class="{ active: bonusQueued }" @click.stop="triggerNextBonus">
                  ⏰ 下局必出：配牌出血时钟游戏
                </button>
                <button class="dip-btn" :class="{ active: sangenQueued }" @click.stop="triggerNextSanGen">
                  🀄 下局必出：三元特快换字牌
                </button>
                <button class="dip-btn" :class="{ active: firstChanceQueued }" @click.stop="triggerNextFirstChance">
                  🎁 下局必出：开局换牌机会
                </button>
                <button class="dip-btn" :class="{ active: reachBonusActive }" @click.stop="triggerReachBonus">
                  🔥 激活本局：立直必胡
                </button>
                <button class="dip-btn gold" @click.stop="showSettingsModal = false; triggerInstantWin()">
                  ⚡ 演示：闪电自摸清一色胡牌
                </button>
                <button class="dip-btn" @click.stop="addPlayerCredit">
                  🪙 街机投币：本局点数 +10000
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { CGeneral, SoundId, TILE_WIDTH } from './weimzh/general'
import { CGame, playeraction, type WaitingTileHint } from './weimzh/player'
import { CTile } from './weimzh/tile'
import { handtile_flags } from './weimzh/hand'
import { PvpManager, type PvpPeerInfo } from './weimzh/pvpManager'

interface PublicRoomSummary {
  roomId: string
  hostName: string
  hostGirl: number
  peerCount: number
  maxPeers: number
  gameMode: '2P' | '4P'
  betAmount: number
  allowDonden: boolean
  inGame: boolean
}

interface LeaderboardEntry {
  peerId: string
  name: string
  chips: number
  wins: number
  games: number
  maxFan: number
  rankTitle: string
}

const gameCanvas = ref<HTMLCanvasElement | null>(null)
const crtEnabled = ref(false) // Default crisp HD commercial look; user can toggle CRT anytime in Settings
const musicOn = ref(true)
const soundOn = ref(true)
const twVoiceOn = ref(true)
const confirmDiscardMode = ref(true) // Commercial anti-misclick: 1st tap selects & shows Tenpai, 2nd tap discards
const toastText = ref('')
const chatBubbleText = ref('')

const curGirl = ref(-1)
const playerScore = ref(10000)
const botScore = ref(16000)
const dondenLeft = ref(8)

// Commercial Modals & Viewport Modes
const isFullscreen = ref(false)
const isRotatedLandscape = ref(false)
const isPortraitNarrow = ref(false)
const showInviteModal = ref(false)
const lobbyTab = ref<'create' | 'lobby'>('create')
const showRankModal = ref(false)
const showRulesModal = ref(false)
const showSettingsModal = ref(false)
const showQuickChatMenu = ref(false)

// Career & Economy Persistent State
const CAREER_STORAGE_KEY = 'weimzh_career_v1'
const career = reactive({
  chips: 10000,
  wins: 0,
  games: 0,
  maxFan: 0,
  streak: 0,
  lastDailyDate: '',
  reliefDate: '',
  reliefCount: 0,
})

const onlinePlayersCount = ref(1)
const publicRooms = ref<PublicRoomSummary[]>([])
const leaderboardList = ref<LeaderboardEntry[]>([])
const serverNotices = ref<string[]>([
  '🎉 欢迎来到《电子基盘·商业旗舰版》！支持台湾甜美女声唱番、智能听牌提示与公网秒匹对战！',
  '💡 提示：手牌上方带有绿色圆点的牌代表打出后即可听牌，单击即可查看胡哪几张及剩余张数！',
])
const noticeIdx = ref(0)

// PVP & Voice Reactive State
const isAutoPlay = ref(false)
const turnCountdown = ref(0)
const isWaitingOpponentTurn = ref(false)
const isRecordingVoice = ref(false)
const hasActivePrompt = ref(false)
const currentActionState = ref(0)
const roomId = ref('')
const isPrivateRoom = ref(false)
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
const betAmount = ref(50)
const betTiers = [
  { label: '🌱 新手场', bet: 20 },
  { label: '🔥 进阶场', bet: 100 },
  { label: '👑 雀神场', bet: 500 },
]

const micOn = ref(true)
const speakerOn = ref(true)
const localSpeaking = ref(false)
const remoteSpeaking = ref(false)
const voiceStatusText = ref('🎙️ 默认开麦')

const disconnectCountdown = ref(0)
let disconnectTimer: any = null

// Touch / Two-Step Selection & Tenpai Helper State
const hoveredTileLetter = ref('')
const selectedTileLetter = ref('')
const myWaitingTiles = ref<WaitingTileHint[]>([])
const discardTenpaiMap = ref<Record<string, WaitingTileHint[]>>({})
let pointerDownPos: { x: number; y: number; tileLetter: string; time: number } | null = null

const bonusQueued = ref(false)
const sangenQueued = ref(false)
const firstChanceQueued = ref(false)
const reachBonusActive = ref(false)

const girlNames = [
  '美纪 (Miki · 新手16000点)',
  '留美 (Rumi · 进阶24000点)',
  '结衣 (Yui · 高手48000点)',
  '雅子 (Masako · 魔王100000点)',
]
const girlShortNames = ['美纪', '留美', '结衣', '雅子']

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

const todayStr = () => new Date().toISOString().slice(0, 10)
const canClaimDaily = computed(() => career.lastDailyDate !== todayStr())
const reliefLeftToday = computed(() => (career.reliefDate === todayStr() ? Math.max(0, 3 - career.reliefCount) : 3))

const rankBadgeText = computed(() => {
  if (career.chips >= 80000 || career.wins >= 40) return '👑 电子雀神'
  if (career.chips >= 40000 || career.wins >= 20) return '💎 钻石雀圣'
  if (career.chips >= 20000 || career.wins >= 10) return '🥇 黄金雀豪'
  if (career.chips >= 12000 || career.wins >= 4) return '🥈 白银雀杰'
  return '🥉 青铜雀士'
})

const winRateText = computed(() => {
  if (career.games <= 0) return '0%'
  return `${Math.round((career.wins / career.games) * 100)}%`
})

const activeTenpaiHints = computed<WaitingTileHint[]>(() => {
  const key = selectedTileLetter.value || hoveredTileLetter.value
  if (!key) return []
  return discardTenpaiMap.value[key] || []
})

const currentNoticeText = computed(() => {
  if (serverNotices.value.length === 0) return ''
  return serverNotices.value[noticeIdx.value % serverNotices.value.length]
})

const roomPeersCount = computed(() => roomPeers.value.length)
const inviteUrl = computed(() => {
  const origin =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? window.location.origin
      : `https://mj.eduready.ai`
  return `${origin}/?room=${roomId.value || '884821'}`
})

let general: CGeneral | null = null
let game: CGame | null = null
const pvp = new PvpManager()

const formatChips = (val: number): string => {
  if (val >= 100000) return `${(val / 10000).toFixed(1)}万`
  return val.toLocaleString()
}

const loadCareer = () => {
  try {
    const raw = window.localStorage.getItem(CAREER_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.chips === 'number') career.chips = parsed.chips
      if (typeof parsed.wins === 'number') career.wins = parsed.wins
      if (typeof parsed.games === 'number') career.games = parsed.games
      if (typeof parsed.maxFan === 'number') career.maxFan = parsed.maxFan
      if (typeof parsed.streak === 'number') career.streak = parsed.streak
      if (typeof parsed.lastDailyDate === 'string') career.lastDailyDate = parsed.lastDailyDate
      if (typeof parsed.reliefDate === 'string') career.reliefDate = parsed.reliefDate
      if (typeof parsed.reliefCount === 'number') career.reliefCount = parsed.reliefCount
    }
    const savedConfirm = window.localStorage.getItem('weimzh_confirm_discard')
    if (savedConfirm !== null) {
      confirmDiscardMode.value = savedConfirm === '1'
    }
  } catch {}
}

const saveCareer = () => {
  try {
    window.localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(career))
  } catch {}
}

const reportLeaderboard = async (bigWinNotice?: string) => {
  try {
    const resp = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        peerId: pvp.peerId,
        name: myName.value,
        chips: career.chips,
        wins: career.wins,
        games: career.games,
        maxFan: career.maxFan,
        rankTitle: rankBadgeText.value,
        bigWinNotice,
      }),
    })
    if (resp.ok) {
      const data = await resp.json()
      if (Array.isArray(data.list)) leaderboardList.value = data.list
    }
  } catch {}
}

const refreshPublicLobby = async () => {
  try {
    const resp = await fetch('/api/room/list')
    if (resp.ok) {
      const data = await resp.json()
      if (typeof data.onlinePlayers === 'number') onlinePlayersCount.value = data.onlinePlayers
      if (Array.isArray(data.rooms)) publicRooms.value = data.rooms
      if (Array.isArray(data.notices) && data.notices.length > 0) {
        serverNotices.value = [
          ...data.notices,
          '💡 提示：手牌上方带有绿色圆点的牌代表打出后即可听牌，单击即可查看胡哪几张及剩余张数！',
        ]
      }
    }
  } catch {}
}

const openRankModal = async () => {
  unlockAudio()
  showRankModal.value = true
  try {
    const resp = await fetch('/api/leaderboard')
    if (resp.ok) {
      const data = await resp.json()
      if (Array.isArray(data.list)) leaderboardList.value = data.list
    }
  } catch {}
  reportLeaderboard()
}

const claimDailyBonus = () => {
  if (!canClaimDaily.value) return
  career.lastDailyDate = todayStr()
  career.chips += 3000
  saveCareer()
  general?.PlaySound(SoundId.SND_SOUND1)
  showToast('🎁 每日签到成功！恭喜获得 +3,000 欢乐金豆！')
  reportLeaderboard()
}

const claimBankruptcyRelief = () => {
  if (career.chips >= 1000 || reliefLeftToday.value <= 0) return
  if (career.reliefDate !== todayStr()) {
    career.reliefDate = todayStr()
    career.reliefCount = 0
  }
  career.reliefCount++
  career.chips += 2000
  saveCareer()
  general?.PlaySound(SoundId.SND_SOUND1)
  showToast(`💸 已领取雀神破产补助 +2,000 金豆！(今日剩余 ${reliefLeftToday.value} 次)`)
  reportLeaderboard()
}

const claimWelfareQuick = () => {
  unlockAudio()
  if (canClaimDaily.value) {
    claimDailyBonus()
  } else if (career.chips < 1000 && reliefLeftToday.value > 0) {
    claimBankruptcyRelief()
  } else {
    openRankModal()
  }
}

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
  mySeatIndex.value = game.mySeatIndex
  activeTurnSeat.value = game.activeTurnSeat
  isAutoPlay.value = game.isAutoPlay
  turnCountdown.value = game.turnCountdown
  isWaitingOpponentTurn.value = game.isWaitingOpponentTurn
  selectedTileLetter.value = game.m_pPlayer.selectedTileLetter

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
      { seatIndex: 0, name: myName.value, girl: mySelectedGirl.value, isBot: false, score: game.m_pPlayer.m_iScore, chips: career.chips },
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

  // Update commercial Tenpai helper states
  if (st === 1) {
    discardTenpaiMap.value = game.m_pPlayer.getDiscardTenpaiMap()
    myWaitingTiles.value = []
  } else {
    discardTenpaiMap.value = {}
    myWaitingTiles.value = game.m_pPlayer.getWaitingTilesInfo()
  }
}

const unlockAudio = () => {
  pvp.unlockVoiceAudio()
  if (general && general.currentAudio && general.currentAudio.paused && musicOn.value) {
    general.currentAudio.play().catch(() => {})
  }
}

const toggleConfirmDiscardMode = () => {
  confirmDiscardMode.value = !confirmDiscardMode.value
  try {
    window.localStorage.setItem('weimzh_confirm_discard', confirmDiscardMode.value ? '1' : '0')
  } catch {}
  if (game && !confirmDiscardMode.value) {
    game.m_pPlayer.selectedTileLetter = ''
    selectedTileLetter.value = ''
    if (game.m_iCurGirl >= 0 || game.isPvpMode) game.m_pPlayer.DrawHand()
  }
  showToast(
    confirmDiscardMode.value
      ? '🛡️ 已开启防误触模式：单击选中看听牌，再次点击或上滑打出'
      : '⚡ 已切换极速模式：单击手牌立即打出'
  )
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

const selectOrDiscardLetter = (letter: string) => {
  unlockAudio()
  if (!general || !game) return
  // During AS_DRAW (0) or prompts, push immediately so player can skip call & draw
  if (currentActionState.value === 0 || hasActivePrompt.value || !confirmDiscardMode.value) {
    game.m_pPlayer.selectedTileLetter = ''
    selectedTileLetter.value = ''
    general.pushKey(letter.toLowerCase())
    return
  }
  // Two-step commercial discard in AS_DISCARD (1):
  if (selectedTileLetter.value === letter) {
    game.m_pPlayer.selectedTileLetter = ''
    selectedTileLetter.value = ''
    general.pushKey(letter.toLowerCase())
  } else {
    game.m_pPlayer.selectedTileLetter = letter
    selectedTileLetter.value = letter
    general.PlaySound(SoundId.SND_DISCARD1)
    game.m_pPlayer.DrawHand()
  }
}

const onDeckKeyClick = (letter: string) => {
  selectOrDiscardLetter(letter)
}

const triggerPlayerAction = (act: playeraction) => {
  unlockAudio()
  if (!game || !general) return
  const st = game.m_pPlayer.currentActionState
  if (game.m_pPlayer.ActionIsValid(st, act)) {
    general.pushKey(`ACT:${act}`)
  } else {
    showToast('当前手牌不满足该动作条件')
  }
}

// =========================================================
// Coordinate Mapper (Supports both Normal & 90° Rotated Landscape!)
// =========================================================
const clientToCanvasXY = (clientX: number, clientY: number): { x: number; y: number } => {
  if (!gameCanvas.value) return { x: 0, y: 0 }
  const rect = gameCanvas.value.getBoundingClientRect()
  if (isRotatedLandscape.value) {
    // When rotated +90deg clockwise:
    // Visual top-right is canvas (0,0); visual X maps to canvas (480 - y), visual Y maps to canvas x
    const relX = (clientY - rect.top) / rect.height
    const relY = 1 - (clientX - rect.left) / rect.width
    return {
      x: Math.max(0, Math.min(640, relX * 640)),
      y: Math.max(0, Math.min(480, relY * 480)),
    }
  }
  const scaleX = 640 / rect.width
  const scaleY = 480 / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

const getTileLetterAtCanvasXY = (x: number, y: number): string => {
  if (y < 365) return ''
  const idx = Math.floor((x - 20) / TILE_WIDTH)
  if (idx >= 0 && idx <= 12) return String.fromCharCode(65 + idx)
  if (idx >= 13) return 'N'
  return ''
}

const onCanvasPointerDown = (e: PointerEvent) => {
  unlockAudio()
  showQuickChatMenu.value = false
  if (!general || !gameCanvas.value) return
  const { x, y } = clientToCanvasXY(e.clientX, e.clientY)

  if (e.button === 2) {
    general.handleCanvasMouseDown(x, y, 2)
    return
  }

  const letter = getTileLetterAtCanvasXY(x, y)
  if (letter && general.m_iCurMusic !== 4 && !general.hasActivePrompt) {
    hoveredTileLetter.value = letter
    pointerDownPos = { x, y, tileLetter: letter, time: Date.now() }
    if (navigator.vibrate) navigator.vibrate(8)
    return
  }

  general.handleCanvasMouseDown(x, y, e.button)
}

const onCanvasPointerMove = (e: PointerEvent) => {
  if (!gameCanvas.value) return
  const { x, y } = clientToCanvasXY(e.clientX, e.clientY)
  const letter = getTileLetterAtCanvasXY(x, y)
  if (letter) {
    hoveredTileLetter.value = letter
  } else if (!pointerDownPos) {
    hoveredTileLetter.value = ''
  }
}

const onCanvasPointerUp = (e: PointerEvent) => {
  if (!general || !gameCanvas.value || !pointerDownPos) return
  const { y } = clientToCanvasXY(e.clientX, e.clientY)
  const deltaY = y - pointerDownPos.y
  const letter = pointerDownPos.tileLetter
  pointerDownPos = null

  // Swipe up > 25px ALWAYS discards immediately!
  if (deltaY < -25) {
    if (game) game.m_pPlayer.selectedTileLetter = ''
    selectedTileLetter.value = ''
    general.pushKey(letter.toLowerCase())
    return
  }

  selectOrDiscardLetter(letter)
}

const onKeyDown = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return
  unlockAudio()
  if (e.key === 'Escape') {
    if (isRotatedLandscape.value) isRotatedLandscape.value = false
    else if (isFullscreen.value) isFullscreen.value = false
    showInviteModal.value = false
    showRankModal.value = false
    showRulesModal.value = false
    showSettingsModal.value = false
    showQuickChatMenu.value = false
    return
  }
  if (!general || showInviteModal.value || showRankModal.value || showRulesModal.value || showSettingsModal.value) return
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault()
  }
  general.pushKey(e.key)
}

// =========================================================
// Lobby, Quick Match, Fullscreen & Landscape Handlers
// =========================================================
const ensureRoomJoined = () => {
  if (!roomId.value) {
    const newId = Math.floor(100000 + Math.random() * 900000).toString()
    roomId.value = newId
    window.history.replaceState({}, '', `/?room=${newId}`)
  }
  pvp.joinRoom(roomId.value)
  syncMyMeta()
}

const openInviteModal = () => {
  unlockAudio()
  ensureRoomJoined()
  customNameInput.value = myName.value
  lobbyTab.value = 'create'
  showInviteModal.value = true
  refreshPublicLobby()
}

const openLobbyTab = (tab: 'create' | 'lobby') => {
  unlockAudio()
  lobbyTab.value = tab
  showInviteModal.value = true
  refreshPublicLobby()
}

const quickMatchPublicRoom = async () => {
  await refreshPublicLobby()
  const available = publicRooms.value.find((r) => !r.inGame && r.peerCount < r.maxPeers && r.roomId !== roomId.value)
  if (available) {
    joinRoomByCode(available.roomId)
  } else {
    isPrivateRoom.value = false
    ensureRoomJoined()
    lobbyTab.value = 'create'
    showToast(`🎲 已为您创建公开房间 #${roomId.value}，等待其他在线雀友秒匹入座！`)
  }
}

const joinRoomByCode = (code: string) => {
  roomId.value = code
  window.history.replaceState({}, '', `/?room=${code}`)
  pvp.joinRoom(code)
  lobbyTab.value = 'create'
  showToast(`⚡ 已加入房间 #${code}！`)
}

const toggleRotatedLandscape = () => {
  unlockAudio()
  isRotatedLandscape.value = !isRotatedLandscape.value
  showToast(isRotatedLandscape.value ? '🔄 已切换横屏满屏放大模式！' : '已恢复竖屏显示')
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
  showToast(next ? '⛶ 已进入沉浸全屏专注模式' : '已退出全屏模式')
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
  showToast(`✅ 昵称已更新为：【${myName.value}】`)
  reportLeaderboard()
}

const copyInviteLink = () => {
  navigator.clipboard?.writeText(inviteUrl.value)
  showToast('📋 房间邀请链接已复制，快发给牌友点击上桌吧！')
}

const openSecondTabForTest = () => {
  const sep = inviteUrl.value.includes('?') ? '&' : '?'
  window.open(`${inviteUrl.value}${sep}guest=1`, '_blank')
}

const editMyName = () => {
  const next = window.prompt('请输入您的个性化雀神昵称：', myName.value)
  if (next && next.trim()) {
    pvp.setMyName(next.trim())
    myName.value = pvp.myName
    showToast(`✏️ 昵称已保存为：${myName.value}`)
    reportLeaderboard()
  }
}

const restartMatch = () => {
  if (!game) return
  if (game.isPvpMode) {
    if (window.confirm('确定要退出当前联机对局并返回单机闯关吗？')) {
      pvp.leaveRoom()
      roomId.value = ''
      window.history.replaceState({}, '', '/')
      game.restartSinglePlayerMatch()
      showToast('🔄 已返回单机模式')
    }
  } else {
    game.restartSinglePlayerMatch()
    showToast('🔄 已重置单机牌局，请重新选择对手！')
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
  joinRoomByCode(code)
}

const syncMyMeta = () => {
  pvp.updateMyMeta(
    mySelectedGirl.value,
    betAmount.value,
    pvpGameMode.value,
    allowDonden.value,
    isPrivateRoom.value
  )
}

const startPvpImmediately = () => {
  showInviteModal.value = false
  showPvpHandoverBanner.value = false
  pvp.requestStartPvpMatch()
}

const queuePvpAfterRound = () => {
  showPvpHandoverBanner.value = false
  queuePvpNextRound.value = true
  showToast('🀄 本手单机结束后将自动切入真人对战！')
}

const handleAiTakeover = () => {
  if (disconnectTimer) {
    clearInterval(disconnectTimer)
    disconnectTimer = null
  }
  disconnectCountdown.value = 0
  game?.switchToAiTakeover()
  showToast('🤖 已由电脑 AI 托管接管继续对局！')
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

const toggleTwVoice = () => {
  if (!general) return
  twVoiceOn.value = !twVoiceOn.value
  general.isVoiceMuted = !twVoiceOn.value
  showToast(twVoiceOn.value ? '👩 已开启台湾甜美女声报牌与唱番' : '🔇 已关闭台湾女声报牌')
}

const toggleMic = () => {
  ensureRoomJoined()
  micOn.value = pvp.toggleMic()
  voiceStatusText.value = pvp.voiceStatus
  showToast(micOn.value ? '🎙️ 实时语音麦克风已开启' : '🔇 麦克风已静音')
}

const toggleSpeaker = () => {
  speakerOn.value = pvp.toggleSpeaker()
  showToast(speakerOn.value ? '🔊 听筒已开启' : '🔈 听筒已静音')
}

const triggerNextBonus = () => {
  if (!game) return
  game.forceNextBonusGame = !game.forceNextBonusGame
  syncUIState()
  showToast(game.forceNextBonusGame ? '⏰ 已预约：下一局必进「配牌出血」奖励游戏！' : '已取消预约')
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
  showToast(game.forceNextFirstChance ? '🎁 已预约：下一局开局换牌！' : '已取消预约')
}

const triggerReachBonus = () => {
  if (!game) return
  game.m_fReachBonus = true
  syncUIState()
  showToast('🔥 已激活「本局立直必胡」！')
}

const addPlayerCredit = () => {
  if (!game || !general) return
  game.m_pPlayer.m_iScore += 10000
  general.PlaySound(SoundId.SND_SOUND1)
  if (game.m_iCurGirl >= 0) game.DrawScore()
  syncUIState()
  showToast('🪙 街机投币成功！本局分数 +10000 点')
}

const switchGirl = (idx: number) => {
  unlockAudio()
  if (!game || !general) return
  if (game.isPvpMode) {
    mySelectedGirl.value = idx
    syncMyMeta()
    general.PlaySound(SoundId.SND_DING)
    showToast(`👩 已更换出战角色为：${girlShortNames[idx]}`)
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
    showToast(`👩 已切换闯关对手为：${girlNames[idx]}`)
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

const checkViewportOrientation = () => {
  isPortraitNarrow.value = window.innerWidth < 720 && window.innerHeight > window.innerWidth
}

let lobbyPollTimer: any = null
let noticeRotateTimer: any = null

onMounted(async () => {
  loadCareer()
  checkViewportOrientation()
  window.addEventListener('resize', checkViewportOrientation)
  window.addEventListener('keydown', onKeyDown)

  myPeerId.value = pvp.peerId
  myName.value = pvp.myName
  customNameInput.value = pvp.myName

  refreshPublicLobby()
  lobbyPollTimer = setInterval(refreshPublicLobby, 12000)
  noticeRotateTimer = setInterval(() => {
    noticeIdx.value++
  }, 6500)

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
        showToast(`🎉 牌友【${opp.name}】已进入房间！`)
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
      showToast('👋 牌友已离开房间')
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
    betAmount.value = payload.betAmount || 50
    if (game) {
      game.startPvpMatchNow(payload)
      const modeName = payload.gameMode === '4P' ? '🀄 四人麻将环桌局' : '⚔️ 1v1 真人死斗局'
      showToast(`🔥 ${modeName}开始！(底注 ${payload.betAmount} 金豆/番)`)
    }
  }

  pvp.onRoomSync = ({ match, moves }) => {
    showInviteModal.value = false
    showPvpHandoverBanner.value = false
    pvpGameMode.value = match.gameMode || '2P'
    allowDonden.value = Boolean(match.allowDonden)
    betAmount.value = match.betAmount || 50
    if (game && !game.isPvpMode) {
      game.startPvpMatchNow(match, moves)
      showToast(`🔄 已自动重连恢复至房间 #${roomId.value} 当前牌局！`)
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
    game.onRoundSettled = ({ won, isDraw, fan, chipDelta, yakuTitle }) => {
      if (isDraw) return
      career.games++
      if (won) {
        career.wins++
        career.streak++
        if (fan > career.maxFan) career.maxFan = fan
      } else {
        career.streak = 0
      }
      career.chips = Math.max(0, career.chips + chipDelta)
      saveCareer()

      let bigNotice: string | undefined
      if (won && fan >= 5) {
        bigNotice = `🎉 贺电！玩家【${myName.value}】胡出 ${fan}番【${yakuTitle}】，狂揽 +${Math.abs(chipDelta)} 金豆！`
      }
      reportLeaderboard(bigNotice)

      if (career.chips < 1000 && reliefLeftToday.value > 0) {
        setTimeout(() => {
          claimBankruptcyRelief()
        }, 1200)
      }
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
      showToast(`🔗 已进入房间 #${urlRoom}，实时语音已就绪！`)
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
  window.removeEventListener('resize', checkViewportOrientation)
  window.removeEventListener('keydown', onKeyDown)
  if (lobbyPollTimer) clearInterval(lobbyPollTimer)
  if (noticeRotateTimer) clearInterval(noticeRotateTimer)
  pvp.leaveRoom()
})
</script>

<style scoped>
.weimzh-arcade-shell {
  width: 100vw;
  height: 100vh;
  background: radial-gradient(circle at center, #131c2e 0%, #060911 100%);
  color: #f8fafc;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* Top Commercial Header */
.arcade-marquee {
  height: 52px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-bottom: 1.5px solid rgba(234, 179, 8, 0.75);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  z-index: 20;
}

.marquee-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.neon-logo {
  display: flex;
  flex-direction: column;
}
.logo-jp {
  font-size: 15px;
  font-weight: 900;
  color: #fde047;
  letter-spacing: 1.5px;
  text-shadow: 0 0 10px rgba(250, 204, 21, 0.55);
}
.logo-en {
  font-size: 8.5px;
  color: #38bdf8;
  letter-spacing: 0.8px;
  font-weight: 700;
}

.online-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(6, 78, 59, 0.55);
  border: 1px solid #10b981;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  color: #6ee7b7;
  cursor: pointer;
}
.online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 6px #4ade80;
}

.mode-badge {
  display: flex;
  align-items: center;
  background: #1e293b;
  border: 1px solid #475569;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 800;
  color: #cbd5e1;
}
.mode-badge.pvp {
  background: #064e3b;
  border-color: #10b981;
  color: #a7f3d0;
}

.led-scoreboard {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #030712;
  border: 1.5px solid #15803d;
  padding: 3px 12px;
  border-radius: 8px;
  box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.2);
}
.led-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 4px;
  border-radius: 4px;
}
.led-item.speaking-glow {
  box-shadow: 0 0 12px #4ade80;
  background: rgba(22, 163, 74, 0.25);
}
.wallet-item {
  cursor: pointer;
}
.led-lbl {
  font-size: 11px;
  font-weight: 800;
  color: #86efac;
}
.led-val {
  font-family: "Courier New", monospace;
  font-size: 16px;
  font-weight: 900;
}
.led-val.bot { color: #f87171; }
.led-val.ply { color: #fde047; }
.led-val.donden { color: #fbbf24; }
.led-divider {
  font-size: 11px;
  color: #475569;
  font-weight: 900;
}
.welfare-dot-btn {
  background: linear-gradient(90deg, #ef4444 0%, #ea580c 100%);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 900;
  cursor: pointer;
  animation: pulseBtn 0.9s infinite alternate;
}

.marquee-right {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* Global Marquee Ticker */
.global-marquee-bar {
  height: 26px;
  background: rgba(15, 23, 42, 0.92);
  border-bottom: 1px solid #1e293b;
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 8px;
  font-size: 11.5px;
  color: #fde68a;
}
.marquee-icon {
  font-size: 12px;
}
.marquee-content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mode-chip {
  background: #1e293b;
  border: 1px solid #475569;
  color: #bae6fd;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
}

/* Voice Capsule */
.voice-capsule {
  display: flex;
  align-items: center;
  gap: 3px;
  background: #0f172a;
  border: 1px solid #334155;
  padding: 2px 5px;
  border-radius: 999px;
}
.voice-circle-btn {
  border: none;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}
.voice-circle-btn.on { background: #065f46; color: #ecfdf5; }
.voice-circle-btn.off { background: #7f1d1d; color: #fecaca; }

.sys-btn {
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
}
.sys-btn:hover { background: #334155; }
.sys-btn.gold-outline {
  border-color: #eab308;
  color: #fde047;
}
.sys-btn.invite-capsule {
  background: linear-gradient(90deg, #059669 0%, #10b981 100%);
  border-color: #34d399;
  color: #ffffff;
  padding: 5px 11px;
  border-radius: 999px;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
}

/* Handover & Disconnect Banners */
.pvp-handover-banner {
  background: linear-gradient(90deg, #064e3b 0%, #0f172a 100%);
  border-bottom: 2px solid #10b981;
  padding: 6px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 25;
}
.banner-left { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
.pulse-badge { background: #10b981; color: #022c22; font-weight: 900; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; }
.banner-actions { display: flex; gap: 8px; }
.handover-btn { padding: 4px 12px; border-radius: 5px; font-size: 12px; font-weight: 900; cursor: pointer; border: 1px solid transparent; }
.handover-btn.primary { background: #f59e0b; color: #000; border-color: #fde047; }
.handover-btn.secondary { background: #1e293b; color: #e2e8f0; border-color: #475569; }

.disconnect-banner {
  background: #7f1d1d;
  border-bottom: 2px solid #ef4444;
  padding: 6px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 800;
  z-index: 25;
}
.takeover-btn { background: #fde047; color: #000; border: none; padding: 4px 12px; border-radius: 4px; font-weight: 900; cursor: pointer; }

/* Center Cabinet Body */
.cabinet-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 6px 14px;
  min-height: 0;
}

.side-panel {
  width: 248px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-card {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
}
.pvp-card { border-color: rgba(16, 185, 129, 0.6); }
.career-mini-card { border-color: rgba(234, 179, 8, 0.55); }
.career-mini-rows { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
.gold-txt { color: #fde047; }

.card-title {
  font-size: 12.5px;
  font-weight: 900;
  color: #fbbf24;
  margin-bottom: 7px;
  border-bottom: 1px solid #334155;
  padding-bottom: 4px;
}

.room-status-box { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; margin-bottom: 8px; }
.r-row { display: flex; justify-content: space-between; align-items: center; }
.r-lbl { color: #94a3b8; }
.r-val { font-weight: 800; color: #e2e8f0; }
.r-val.code { color: #38bdf8; font-size: 12px; }
.r-val.online { color: #4ade80; }

.quick-voice-title { font-size: 11px; color: #94a3b8; margin-bottom: 5px; }
.emote-grid { display: flex; flex-direction: column; gap: 3.5px; max-height: 205px; overflow-y: auto; }
.emote-btn {
  text-align: left;
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 4px 8px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
}
.emote-btn:hover { background: #065f46; border-color: #10b981; color: #fff; }

.dip-btn {
  width: 100%;
  text-align: left;
  background: #1e293b;
  border: 1px solid #475569;
  color: #e2e8f0;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 800;
  cursor: pointer;
}
.dip-btn.active { background: #065f46; border-color: #34d399; color: #fef08a; }
.dip-btn.gold { background: linear-gradient(90deg, #b45309 0%, #d97706 100%); border-color: #fde047; color: #fff; }

/* CRT Monitor Frame */
.crt-monitor-frame {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  padding: 8px;
  border-radius: 14px;
  border: 3px solid #334155;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.85);
}

.crt-glass {
  position: relative;
  height: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
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

/* Portrait Mobile Landscape Suggestion */
.landscape-suggest-pill {
  position: absolute;
  bottom: 98px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(90deg, #0284c7 0%, #2563eb 100%);
  border: 1.5px solid #bae6fd;
  color: #fff;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 11.5px;
  white-space: nowrap;
  z-index: 32;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.75);
  cursor: pointer;
}

/* Commercial Tenpai Helper Bar */
.tenpai-helper-bar {
  position: absolute;
  bottom: 102px;
  left: 14px;
  max-width: 68%;
  background: rgba(9, 18, 32, 0.93);
  backdrop-filter: blur(6px);
  border: 1.5px solid #4ade80;
  border-radius: 10px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  z-index: 26;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
}
.tenpai-helper-bar.already-tenpai {
  border-color: #f59e0b;
}
.tp-tag {
  background: #16a34a;
  color: #fff;
  font-weight: 900;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}
.tp-tag.hot {
  background: #ea580c;
}
.tp-desc {
  color: #e2e8f0;
}
.tp-tile-chip {
  background: #fefce8;
  color: #0f172a;
  border: 1px solid #eab308;
  padding: 1px 7px;
  border-radius: 5px;
  font-weight: 900;
  font-size: 12px;
}
.tp-tile-chip em {
  font-style: normal;
  font-size: 10.5px;
  color: #15803d;
  margin-left: 3px;
}
.tp-tile-chip.exhausted {
  opacity: 0.55;
}
.tp-tile-chip.exhausted em {
  color: #dc2626;
}

/* Dynamic Action Bubbles */
.dynamic-action-bubbles {
  position: absolute;
  right: 14px;
  bottom: 106px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  z-index: 28;
}
.bubble-btn {
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 900;
  color: #fff;
  cursor: pointer;
  border: 2px solid #fde047;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.85);
}
.bubble-ron { background: radial-gradient(circle, #ef4444 0%, #991b1b 100%); box-shadow: 0 0 20px #ef4444; }
.bubble-reach { background: radial-gradient(circle, #f97316 0%, #9a3412 100%); }
.bubble-meld { background: rgba(30, 41, 59, 0.94); border-color: #cbd5e1; }
.bubble-confirm { background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-color: #a7f3d0; }
.bubble-pass { background: rgba(30, 41, 59, 0.92); border: 1.5px solid #94a3b8; color: #e2e8f0; }

.swipe-hint-pill {
  position: absolute;
  bottom: 106px;
  left: 16px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid #facc15;
  color: #fef08a;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11.5px;
  pointer-events: none;
  z-index: 20;
}

/* Floating Quick Chat Popover */
.floating-chat-popover {
  position: absolute;
  top: 40px;
  right: 10px;
  width: 260px;
  background: rgba(15, 23, 42, 0.96);
  backdrop-filter: blur(8px);
  border: 1.5px solid #10b981;
  border-radius: 10px;
  padding: 10px;
  z-index: 42;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
}
.pop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 900;
  color: #6ee7b7;
  margin-bottom: 8px;
}
.pop-close { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; }
.pop-emote-list { display: flex; flex-direction: column; gap: 4px; max-height: 210px; overflow-y: auto; }
.pop-emote-btn {
  text-align: left;
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 11.5px;
  cursor: pointer;
}
.pop-emote-btn:hover { background: #065f46; }

.voice-chat-bubble {
  position: absolute;
  top: 48px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(6, 95, 70, 0.95);
  border: 2px solid #34d399;
  color: #ecfdf5;
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 800;
  z-index: 38;
  white-space: nowrap;
}

.cabinet-toast {
  position: absolute;
  top: 42px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(9, 14, 26, 0.94);
  border: 1.5px solid #facc15;
  color: #fef08a;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  z-index: 39;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
}

/* Right Panel */
.girl-grid { display: flex; flex-direction: column; gap: 5px; }
.girl-select-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1e293b;
  border: 1px solid #475569;
  color: #f1f5f9;
  padding: 5px 9px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 700;
}
.girl-select-btn.current { background: #1e3a8a; border-color: #38bdf8; }
.g-letter { background: #eab308; color: #000; font-weight: 900; padding: 1px 6px; border-radius: 3px; }

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.act-btn {
  padding: 7px 8px;
  border-radius: 6px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}
.act-btn.donden, .act-btn.confirm, .autoplay-panel-btn { grid-column: span 2; }
.act-btn.valid { color: #fff; border-color: #fde047; animation: pulseBtn 0.9s infinite alternate; }
.act-btn.chow.valid { background: #0284c7; }
.act-btn.pung.valid { background: #16a34a; }
.act-btn.kong.valid { background: #7c3aed; }
.act-btn.reach.valid { background: #ea580c; }
.act-btn.ron.valid { background: #dc2626; }
.act-btn.donden { background: #422006; border-color: #ca8a04; color: #fde047; }
.act-btn.confirm { background: #1e3a8a; border-color: #3b82f6; color: #fff; }

@keyframes pulseBtn {
  0% { transform: scale(1); }
  100% { transform: scale(1.03); }
}

/* Bottom Physical Deck */
.arcade-control-deck {
  height: 54px;
  background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
  border-top: 1.5px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  z-index: 20;
}
.deck-inner { display: flex; gap: 7px; }
.mahjong-key-btn {
  position: relative;
  width: 52px;
  height: 40px;
  background: linear-gradient(180deg, #fef08a 0%, #eab308 100%);
  border: 2px solid #713f12;
  border-bottom-width: 4px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.mahjong-key-btn.hovered-key {
  transform: translateY(-4px);
  box-shadow: 0 0 14px #fde047;
}
.mahjong-key-btn.tenpai-key {
  border-color: #16a34a;
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.65);
}
.key-tenpai-dot {
  position: absolute;
  top: -7px;
  right: -5px;
  background: #16a34a;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  padding: 0 4px;
  border-radius: 999px;
  border: 1px solid #bbf7d0;
}
.mahjong-key-btn.draw-key {
  margin-left: 12px;
  background: linear-gradient(180deg, #fca5a5 0%, #ef4444 100%);
  border-color: #7f1d1d;
}
.key-cap { font-size: 14px; font-weight: 900; color: #0f172a; line-height: 1; }
.mahjong-key-btn.draw-key .key-cap { color: #fff; }
.key-sub { font-size: 9px; font-weight: 800; color: #422006; margin-top: 2px; }
.mahjong-key-btn.draw-key .key-sub { color: #fef2f2; }

/* Modals Shared */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.84);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.invite-modal {
  width: 720px;
  max-width: 95vw;
  max-height: 92vh;
  background: #0f172a;
  border: 1.5px solid #10b981;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  background: linear-gradient(90deg, #064e3b 0%, #0f172a 100%);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #1e293b;
}
.modal-header h3 { margin: 0; font-size: 15.5px; color: #ecfdf5; }
.close-btn { background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; }
.modal-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

/* Lobby Tabs & Public Rooms */
.lobby-tabs {
  display: flex;
  background: #020617;
  border-bottom: 1px solid #1e293b;
}
.lobby-tab-btn {
  flex: 1;
  padding: 10px;
  background: transparent;
  border: none;
  border-bottom: 2.5px solid transparent;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}
.lobby-tab-btn.active {
  color: #fde047;
  border-bottom-color: #10b981;
  background: rgba(16, 185, 129, 0.08);
}
.quick-match-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  background: rgba(6, 78, 59, 0.35);
  border: 1px solid #10b981;
  padding: 10px 14px;
  border-radius: 8px;
}
.qm-title { font-size: 13.5px; font-weight: 900; color: #a7f3d0; }
.qm-sub { font-size: 11.5px; color: #94a3b8; margin-top: 2px; }
.qm-actions { display: flex; gap: 8px; }
.empty-lobby-box {
  padding: 26px 18px;
  text-align: center;
  background: #020617;
  border: 1px dashed #334155;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.6;
}
.public-room-list { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; }
.pub-room-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 12px;
}
.prc-left { display: flex; align-items: center; gap: 10px; }
.prc-avatar { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; border: 1px solid #eab308; }
.prc-host { font-size: 13px; color: #f8fafc; }
.prc-code { color: #38bdf8; font-family: monospace; margin-left: 6px; font-weight: 800; }
.prc-tags { display: flex; gap: 6px; margin-top: 4px; }
.prc-badge { font-size: 10.5px; background: #1e293b; color: #cbd5e1; padding: 1px 6px; border-radius: 4px; }
.prc-badge.gold { color: #fde047; border: 1px solid rgba(234, 179, 8, 0.4); }
.prc-right { display: flex; align-items: center; gap: 10px; }
.prc-count { font-size: 12.5px; font-weight: 900; color: #4ade80; }

/* Tier Buttons */
.tier-btn-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tier-btn {
  background: #020617;
  border: 1.5px solid #334155;
  border-radius: 8px;
  padding: 8px 6px;
  color: #cbd5e1;
  cursor: pointer;
}
.tier-btn.selected {
  border-color: #eab308;
  background: rgba(234, 179, 8, 0.15);
}
.t-name { font-size: 12px; font-weight: 900; color: #fde047; }
.t-val { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.private-chk { display: flex; align-items: center; gap: 4px; font-size: 11.5px; color: #cbd5e1; margin-left: auto; cursor: pointer; }

/* Career & Leaderboard Modal */
.career-hero-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  background: linear-gradient(135deg, #1e293b 0%, #020617 100%);
  border: 1px solid #eab308;
  border-radius: 10px;
  padding: 12px 14px;
}
.career-avatar { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; border: 2px solid #fde047; }
.career-info { flex: 1; min-width: 220px; }
.c-top-line { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.c-rank-pill { background: #eab308; color: #000; font-size: 11.5px; font-weight: 900; padding: 2px 8px; border-radius: 999px; }
.c-name { font-size: 15px; color: #fff; }
.c-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.c-stat { display: flex; flex-direction: column; font-size: 11px; color: #94a3b8; }
.c-stat strong { font-size: 13.5px; color: #f8fafc; margin-top: 2px; }
.career-welfare-btns { display: flex; flex-direction: column; gap: 6px; }

.leaderboard-table { display: flex; flex-direction: column; gap: 5px; max-height: 270px; overflow-y: auto; }
.lb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #020617;
  border: 1px solid #1e293b;
  padding: 7px 12px;
  border-radius: 7px;
  font-size: 12.5px;
}
.lb-row.me { border-color: #10b981; background: rgba(16, 185, 129, 0.12); }
.lb-idx { width: 26px; font-weight: 900; text-align: center; }
.lb-rank { font-size: 11px; color: #fde047; width: 92px; }
.lb-name { flex: 1; font-weight: 800; color: #f8fafc; }
.lb-win { color: #94a3b8; font-size: 11.5px; }
.lb-chips { font-weight: 900; color: #fbbf24; min-width: 90px; text-align: right; }

/* Rules & Yaku Guide Modal */
.rule-alert {
  background: rgba(14, 116, 144, 0.2);
  border: 1px solid #38bdf8;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.65;
  color: #e0f2fe;
}
.yaku-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.yaku-card {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 9px 11px;
}
.yaku-card.yakuman { grid-column: span 2; border-color: #eab308; background: rgba(234, 179, 8, 0.08); }
.yk-head { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 900; color: #fde047; margin-bottom: 4px; }
.yk-head em { font-style: normal; color: #4ade80; font-size: 11.5px; }
.yk-desc { font-size: 11.5px; color: #cbd5e1; line-height: 1.45; }

/* Settings Modal */
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.set-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px 12px;
  color: #cbd5e1;
  font-size: 12.5px;
  cursor: pointer;
}
.set-toggle-btn.on { border-color: #10b981; background: rgba(16, 185, 129, 0.12); color: #ecfdf5; }
.set-toggle-btn.on strong { color: #4ade80; }
.set-toggle-btn.warn { border-color: #f59e0b; }
.set-toggle-btn.warn strong { color: #fde047; }
.arcade-lab-box {
  background: rgba(15, 23, 42, 0.8);
  border: 1px dashed #475569;
  border-radius: 8px;
  padding: 10px 12px;
}
.lab-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

/* Existing Form & Roster Helpers */
.sec-label { display: block; font-size: 12px; font-weight: 800; color: #fde047; margin-bottom: 6px; }
.link-copy-row { display: flex; gap: 8px; }
.link-input { flex: 1; background: #020617; border: 1px solid #334155; color: #38bdf8; padding: 7px 10px; border-radius: 6px; font-family: monospace; font-size: 12.5px; }
.copy-primary-btn { background: #10b981; color: #022c22; border: none; padding: 7px 13px; border-radius: 6px; font-weight: 900; font-size: 12px; cursor: pointer; }
.copy-primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.open-tab-btn { background: #2563eb; color: #fff; border: none; padding: 7px 12px; border-radius: 6px; font-weight: 800; font-size: 12px; cursor: pointer; }
.mini-copy-btn { background: #1e293b; border: 1px solid #475569; color: #e2e8f0; padding: 5px 10px; border-radius: 6px; font-size: 11.5px; cursor: pointer; }
.invite-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.modal-girl-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.m-girl-btn { background: #1e293b; border: 1.5px solid #334155; border-radius: 6px; padding: 5px; display: flex; flex-direction: column; align-items: center; gap: 3px; color: #e2e8f0; font-size: 11px; font-weight: 800; cursor: pointer; }
.m-girl-btn.selected { border-color: #fde047; background: #1e3a8a; }
.m-girl-thumb { width: 100%; height: 50px; object-fit: cover; border-radius: 4px; }
.roster-list { background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.roster-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.r-name { font-weight: 800; color: #f8fafc; flex: 1; }
.r-char { color: #fde047; font-size: 11px; }
.modal-footer { padding: 10px 18px; background: #020617; border-top: 1px solid #1e293b; display: flex; justify-content: flex-end; gap: 10px; }
.modal-btn { padding: 8px 16px; border-radius: 6px; font-size: 12.5px; font-weight: 900; cursor: pointer; border: none; }
.modal-btn.cancel { background: #334155; color: #e2e8f0; }
.modal-btn.start-pvp { background: linear-gradient(90deg, #f59e0b 0%, #ea580c 100%); color: #fff; }
.modal-btn.start-pvp:disabled { opacity: 0.45; cursor: not-allowed; }

.seat-standings-list { display: flex; flex-direction: column; gap: 5px; }
.seat-row { display: flex; align-items: center; gap: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 5px 8px; }
.seat-row.active { border-color: #eab308; }
.seat-row.me { background: rgba(16, 185, 129, 0.12); }
.wind-badge { width: 22px; height: 22px; background: #1e293b; border: 1px solid #f59e0b; color: #fde047; font-weight: 900; font-size: 12px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
.seat-meta { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.seat-name-line { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 800; }
.s-tag { font-size: 10px; color: #4ade80; }
.s-tag.bot { color: #38bdf8; }
.seat-score-line { display: flex; justify-content: space-between; font-size: 11px; color: #cbd5e1; }
.s-chips { color: #fbbf24; font-weight: 700; }
.header-badges { display: flex; align-items: center; gap: 10px; }
.pub-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #1e293b; color: #94a3b8; border: 1px solid #475569; }
.pub-pill.ok { background: #064e3b; color: #6ee7b7; border-color: #10b981; }
.join-code-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 6px; font-size: 12px; }
.room-code-input { width: 150px; background: #020617; border: 1px solid #38bdf8; border-radius: 5px; padding: 5px 8px; color: #fde047; font-weight: 800; font-size: 12px; }
.mini-join-btn { background: #0284c7; color: #fff; border: none; padding: 5px 11px; border-radius: 5px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
.mini-join-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mode-switch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rule-card-btn { background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 7px 9px; text-align: left; color: #e2e8f0; cursor: pointer; }
.rule-card-btn.selected { border-color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.rc-title { font-size: 12px; font-weight: 900; color: #fde047; }
.rc-desc { font-size: 10.5px; color: #94a3b8; margin-top: 2px; }
.rule-toggle-row { display: flex; gap: 6px; }
.fair-btn { flex: 1; background: #020617; border: 1px solid #334155; color: #cbd5e1; padding: 5px 6px; border-radius: 5px; font-size: 11px; font-weight: 800; cursor: pointer; }
.fair-btn.selected { border-color: #10b981; background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
.wind-pill { background: #1e293b; border: 1px solid #f59e0b; color: #fde047; font-size: 11px; font-weight: 900; padding: 1px 5px; border-radius: 4px; }
.bot-slot { color: #94a3b8; font-weight: 600; font-size: 11px; }
.nick-edit-section { background: rgba(14, 116, 144, 0.16); border: 1px solid #0ea5e9; }
.nick-edit-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.nick-input { width: 150px; background: #020617; border: 1px solid #38bdf8; border-radius: 5px; padding: 4px 8px; color: #fde047; font-weight: 800; font-size: 12.5px; }
.save-nick-btn { background: linear-gradient(90deg, #10b981 0%, #059669 100%); color: #fff; border: none; padding: 5px 10px; border-radius: 5px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
.fullscreen-entry-btn { background: linear-gradient(90deg, #0284c7 0%, #2563eb 100%); border-color: #38bdf8 !important; color: #fff !important; }
.autoplay-top-btn.active { background: linear-gradient(90deg, #059669 0%, #10b981 100%) !important; color: #fff !important; }
.autoplay-panel-btn { background: #1e293b; border: 1px solid #10b981; color: #6ee7b7; }
.autoplay-panel-btn.active { background: linear-gradient(90deg, #059669 0%, #10b981 100%); color: #fff; }
.walkie-btn { width: 100%; margin-bottom: 6px; padding: 6px 8px; border-radius: 6px; border: 1px solid #38bdf8; background: linear-gradient(90deg, #0284c7 0%, #0369a1 100%); color: #fff; font-size: 11.5px; font-weight: 800; cursor: pointer; }
.walkie-btn.recording { background: linear-gradient(90deg, #dc2626 0%, #b91c1c 100%); border-color: #fca5a5; }

.turn-timer-pill { position: absolute; top: 8px; left: 8px; background: rgba(15, 23, 42, 0.88); border: 1px solid #38bdf8; color: #e0f2fe; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; z-index: 34; }
.turn-timer-pill.urgent { background: rgba(185, 28, 28, 0.92); border-color: #fca5a5; color: #fff; }
.autoplay-active-banner { position: absolute; top: 8px; left: 8px; background: rgba(5, 150, 105, 0.92); border: 1.5px solid #6ee7b7; color: #fff; padding: 4px 12px; border-radius: 999px; font-size: 11.5px; cursor: pointer; z-index: 36; }

/* Floating HUD */
.floating-fs-hud { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 5px; z-index: 35; }
.fs-pill-btn { background: rgba(15, 23, 42, 0.84); backdrop-filter: blur(6px); border: 1px solid rgba(148, 163, 184, 0.5); color: #f8fafc; font-size: 11px; font-weight: 800; padding: 4px 9px; border-radius: 999px; cursor: pointer; }
.fs-pill-btn.chat-pill { border-color: #34d399; color: #a7f3d0; }
.fs-pill-btn.landscape-btn { background: rgba(124, 58, 237, 0.88); border-color: #c4b5fd; color: #fff; }
.fs-pill-btn.exit { background: rgba(220, 38, 38, 0.88); border-color: #f87171; color: #fff; }
.fs-pill-btn.enter-mobile { background: rgba(2, 132, 199, 0.88); border-color: #38bdf8; color: #fff; }
.fs-pill-btn.invite { background: rgba(234, 88, 12, 0.88); border-color: #fb923c; color: #fff; }
.fs-pill-btn.active { border-color: #10b981; color: #6ee7b7; }

/* Fullscreen Focus Mode */
.weimzh-arcade-shell.fullscreen-mode .arcade-marquee,
.weimzh-arcade-shell.fullscreen-mode .global-marquee-bar,
.weimzh-arcade-shell.fullscreen-mode .side-panel,
.weimzh-arcade-shell.fullscreen-mode .arcade-control-deck {
  display: none !important;
}
.weimzh-arcade-shell.fullscreen-mode .cabinet-body {
  width: 100vw;
  height: 100vh;
  padding: 0;
  margin: 0;
  background: #000;
}
.weimzh-arcade-shell.fullscreen-mode .crt-monitor-frame {
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: #000;
  box-shadow: none;
}
.weimzh-arcade-shell.fullscreen-mode:not(.rotated-landscape) .crt-glass {
  width: min(100vw, calc(100vh * 4 / 3));
  height: min(100vh, calc(100vw * 3 / 4));
  border-radius: 0;
}

/* 90° Portrait-to-Landscape Fullscreen Mode for Smartphones */
.weimzh-arcade-shell.rotated-landscape {
  position: fixed;
  top: 0;
  left: 100vw;
  width: 100vh;
  height: 100vw;
  transform-origin: top left;
  transform: rotate(90deg);
  z-index: 90;
  background: #000;
}
.weimzh-arcade-shell.rotated-landscape .cabinet-body,
.weimzh-arcade-shell.rotated-landscape .crt-monitor-frame {
  width: 100vh;
  height: 100vw;
}
.weimzh-arcade-shell.rotated-landscape .crt-glass {
  width: min(100vh, calc(100vw * 4 / 3));
  height: min(100vw, calc(100vh * 3 / 4));
  border-radius: 0;
}

/* Mobile & Tablet Responsive (< 980px) */
@media (max-width: 980px) {
  .side-panel,
  .global-marquee-bar,
  .neon-logo .logo-en {
    display: none !important;
  }
  .arcade-marquee {
    height: auto;
    min-height: 44px;
    flex-wrap: wrap;
    padding: 4px 8px;
    gap: 4px;
  }
  .invite-grid-2col,
  .yaku-grid,
  .settings-grid,
  .lab-grid {
    grid-template-columns: 1fr;
  }
  .yaku-card.yakuman { grid-column: span 1; }
  .c-stats-grid { grid-template-columns: repeat(2, 1fr); }
  .cabinet-body { padding: 2px; }
  .crt-monitor-frame { width: 100%; height: 100%; padding: 2px; border-width: 1px; }
  .crt-glass {
    width: min(99vw, calc((100vh - 96px) * 4 / 3));
    height: min(calc(100vh - 96px), calc(99vw * 3 / 4));
  }
  .arcade-control-deck { height: 42px; padding: 2px 4px; }
  .mahjong-key-btn { width: auto; flex: 1; height: 34px; }
  .key-sub { display: none; }
}
</style>
