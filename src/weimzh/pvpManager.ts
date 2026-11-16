// PVP Room Synchronization (Public Internet WSS + LAN SSE + BroadcastChannel)
// & WebRTC P2P Voice Chat Manager (Supports 2P Arcade Duel & 4P Four-Player Mahjong)

export interface PvpPeerInfo {
  peerId: string
  name: string
  girl: number
  bet: number
}

export interface SeatPlayerInfo {
  seatIndex: number // 0=东(East), 1=南(South), 2=西(West), 3=北(North)
  peerId: string
  name: string
  girl: number
  isBot: boolean
}

export interface StartMatchPayload {
  roomSeed: number
  gameMode: '2P' | '4P'
  allowDonden: boolean
  betAmount: number
  hostPeerId: string
  seats: SeatPlayerInfo[]
  // Legacy 2P fields for backward compatibility
  hostGirl: number
  guestGirl: number
  hostName: string
  guestName: string
}

export interface PvpMovePacket {
  seatIndex?: number
  phase: 'DRAW' | 'DISCARD' | 'DONDEN' | 'CLAIM'
  act: number
  index?: number
  chowLocation?: number
}

// Lightweight zero-dependency MQTT v3.1.1 over WebSocket client for Public Internet rooms
class PublicWssSignaling {
  private ws: WebSocket | null = null
  private pingTimer: any = null
  private reconnectTimer: any = null
  private topic: string = ''
  private clientId: string = ''
  private brokerIndex: number = 0
  private isDisposed: boolean = false

  private readonly brokers = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
  ]

  public onMessage?: (data: any) => void
  public onStatusChange?: (connected: boolean, statusText: string) => void

  constructor(clientId: string) {
    this.clientId = clientId
  }

  connect(roomId: string): void {
    this.disconnect()
    this.isDisposed = false
    this.topic = `weimzh/dianzijipan/room/${roomId}`
    this.tryConnectBroker()
  }

  private tryConnectBroker(): void {
    if (this.isDisposed || !this.topic) return
    const url = this.brokers[this.brokerIndex % this.brokers.length]
    this.onStatusChange?.(false, '🔄 正在连接公网联机节点...')

    try {
      const ws = new WebSocket(url, 'mqtt')
      ws.binaryType = 'arraybuffer'
      this.ws = ws

      ws.onopen = () => {
        if (this.isDisposed) return
        // Send MQTT CONNECT packet
        ws.send(this.encodeConnect(this.clientId))
      }

      ws.onmessage = (ev) => {
        if (this.isDisposed || !(ev.data instanceof ArrayBuffer)) return
        const bytes = new Uint8Array(ev.data)
        if (bytes.length < 2) return
        const packetType = bytes[0] >> 4

        if (packetType === 2) {
          // CONNACK -> Subscribe to room topic
          ws.send(this.encodeSubscribe(this.topic))
          this.onStatusChange?.(true, '🌐 公网跨网直连已就绪')
          if (this.pingTimer) clearInterval(this.pingTimer)
          this.pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(new Uint8Array([0xc0, 0x00])) // PINGREQ
            }
          }, 20000)
        } else if (packetType === 3) {
          // PUBLISH -> Extract topic & payload
          const parsed = this.decodePublish(bytes)
          if (parsed) {
            try {
              const obj = JSON.parse(parsed.payload)
              this.onMessage?.(obj)
            } catch {}
          }
        }
      }

      ws.onerror = () => {}

      ws.onclose = () => {
        if (this.pingTimer) {
          clearInterval(this.pingTimer)
          this.pingTimer = null
        }
        if (!this.isDisposed) {
          this.brokerIndex++
          this.onStatusChange?.(false, '🔄 公网节点重连中...')
          this.reconnectTimer = setTimeout(() => this.tryConnectBroker(), 2500)
        }
      }
    } catch {
      this.onStatusChange?.(false, '⚠️ 局域网/本地联机模式')
    }
  }

  publish(obj: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.topic) return
    try {
      const str = JSON.stringify(obj)
      this.ws.send(this.encodePublish(this.topic, str))
    } catch {}
  }

  disconnect(): void {
    this.isDisposed = true
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
  }

  private encodeLength(len: number): number[] {
    const out: number[] = []
    do {
      let digit = len % 128
      len = Math.floor(len / 128)
      if (len > 0) digit |= 0x80
      out.push(digit)
    } while (len > 0)
    return out
  }

  private encodeUTF8(str: string): Uint8Array {
    const utf8 = new TextEncoder().encode(str)
    const res = new Uint8Array(2 + utf8.length)
    res[0] = (utf8.length >> 8) & 0xff
    res[1] = utf8.length & 0xff
    res.set(utf8, 2)
    return res
  }

  private encodeConnect(clientId: string): Uint8Array {
    const protocol = this.encodeUTF8('MQTT')
    const varHeader = new Uint8Array([
      ...protocol,
      0x04, // Protocol Level 4 (MQTT 3.1.1)
      0x02, // Clean Session
      0x00,
      0x3c, // Keep Alive 60s
    ])
    const payload = this.encodeUTF8(clientId)
    const remLen = this.encodeLength(varHeader.length + payload.length)
    const pkt = new Uint8Array(1 + remLen.length + varHeader.length + payload.length)
    pkt[0] = 0x10
    pkt.set(remLen, 1)
    pkt.set(varHeader, 1 + remLen.length)
    pkt.set(payload, 1 + remLen.length + varHeader.length)
    return pkt
  }

  private encodeSubscribe(topic: string): Uint8Array {
    const topicBytes = this.encodeUTF8(topic)
    const bodyLen = 2 + topicBytes.length + 1
    const remLen = this.encodeLength(bodyLen)
    const pkt = new Uint8Array(1 + remLen.length + bodyLen)
    let offset = 0
    pkt[offset++] = 0x82
    pkt.set(remLen, offset)
    offset += remLen.length
    pkt[offset++] = 0x00
    pkt[offset++] = 0x01 // Packet ID = 1
    pkt.set(topicBytes, offset)
    offset += topicBytes.length
    pkt[offset] = 0x00 // QoS 0
    return pkt
  }

  private encodePublish(topic: string, message: string): Uint8Array {
    const topicBytes = this.encodeUTF8(topic)
    const msgBytes = new TextEncoder().encode(message)
    const bodyLen = topicBytes.length + msgBytes.length
    const remLen = this.encodeLength(bodyLen)
    const pkt = new Uint8Array(1 + remLen.length + bodyLen)
    let offset = 0
    pkt[offset++] = 0x30 // PUBLISH QoS 0
    pkt.set(remLen, offset)
    offset += remLen.length
    pkt.set(topicBytes, offset)
    offset += topicBytes.length
    pkt.set(msgBytes, offset)
    return pkt
  }

  private decodePublish(bytes: Uint8Array): { topic: string; payload: string } | null {
    let idx = 1
    let multiplier = 1
    let remLen = 0
    while (idx < bytes.length) {
      const b = bytes[idx++]
      remLen += (b & 127) * multiplier
      if ((b & 128) === 0) break
      multiplier *= 128
    }
    if (idx + 2 > bytes.length) return null
    const topicLen = (bytes[idx] << 8) | bytes[idx + 1]
    idx += 2
    if (idx + topicLen > bytes.length) return null
    const topic = new TextDecoder().decode(bytes.slice(idx, idx + topicLen))
    idx += topicLen
    const payload = new TextDecoder().decode(bytes.slice(idx))
    return { topic, payload }
  }
}

export class PvpManager {
  public roomId: string = ''
  public peerId: string = 'p_' + Math.random().toString(36).slice(2, 9)
  public myName: string = '街机雀神_' + Math.floor(100 + Math.random() * 900)
  public myGirl: number = 2
  public betAmount: number = 20
  public gameMode: '2P' | '4P' = '4P'
  public allowDonden: boolean = false // Default: Fair competitive mode (No DONDEN)

  public peers: PvpPeerInfo[] = []
  public lanIps: string[] = []
  public isPvpConnected: boolean = false
  public isHost: boolean = true
  public publicConnected: boolean = false
  public publicStatusText: string = '🌐 公网待机'

  // WebRTC Voice Chat state
  public micEnabled: boolean = true
  public speakerEnabled: boolean = true
  public localSpeaking: boolean = false
  public remoteSpeaking: boolean = false
  public voiceStatus: string = '待机中'

  private es: EventSource | null = null
  private bc: BroadcastChannel | null = null
  private publicSignaling: PublicWssSignaling
  private seenMsgIds = new Set<string>()
  private presenceTimer: any = null

  private pcs = new Map<string, RTCPeerConnection>()
  private remoteAudios = new Map<string, HTMLAudioElement>()
  private localStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private rmsInterval: any = null

  private moveQueue: PvpMovePacket[] = []
  private moveResolvers: ((move: PvpMovePacket) => void)[] = []

  public onRosterUpdate?: (peers: PvpPeerInfo[], joinedPeerId?: string) => void
  public onPeerDisconnected?: (leftPeerId: string) => void
  public onStartPvpMatch?: (payload: StartMatchPayload) => void
  public onRoomRuleChange?: (gameMode: '2P' | '4P', allowDonden: boolean, betAmount: number) => void
  public onSpeakingChange?: (local: boolean, remote: boolean) => void
  public onChatEmote?: (senderName: string, text: string) => void
  public onOpponentDonden?: (seatIndex?: number) => void
  public onPublicStatusChange?: (connected: boolean, text: string) => void

  constructor() {
    this.publicSignaling = new PublicWssSignaling(this.peerId + '_' + Math.floor(Math.random() * 999))
    this.publicSignaling.onMessage = (data) => {
      this.handleIncomingMessage(data)
    }
    this.publicSignaling.onStatusChange = (connected, statusText) => {
      this.publicConnected = connected
      this.publicStatusText = statusText
      this.onPublicStatusChange?.(connected, statusText)
      if (connected && this.roomId) {
        this.announcePresence()
      }
    }
  }

  async fetchLanInfo(): Promise<void> {
    try {
      const res = await fetch('/api/room/info')
      if (res.ok) {
        const data = await res.json()
        this.lanIps = data.lanIps || []
      }
    } catch {}
  }

  joinRoom(roomId: string): void {
    if (this.roomId === roomId && (this.es || this.bc)) return
    this.leaveRoom()
    this.roomId = roomId
    this.peers = [
      {
        peerId: this.peerId,
        name: this.myName,
        girl: this.myGirl,
        bet: this.betAmount,
      },
    ]
    this.fetchLanInfo()

    // 1. BroadcastChannel for zero-latency multi-tab sync
    try {
      this.bc = new BroadcastChannel('weimzh_pvp_' + roomId)
      this.bc.onmessage = (ev) => {
        this.handleIncomingMessage(ev.data)
      }
    } catch {}

    // 2. SSE connection to Vite built-in room server for LAN sync
    try {
      const url = `/api/room/events?room=${encodeURIComponent(roomId)}&peerId=${encodeURIComponent(
        this.peerId
      )}&name=${encodeURIComponent(this.myName)}&girl=${this.myGirl}&bet=${this.betAmount}`
      this.es = new EventSource(url)
      this.es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          this.handleIncomingMessage(data)
        } catch {}
      }
    } catch {}

    // 3. Public Internet MQTT over WSS Relay for cross-network / mobile 5G / GitHub Pages
    this.publicSignaling.connect(roomId)

    setTimeout(() => {
      this.announcePresence()
    }, 180)

    if (this.presenceTimer) clearInterval(this.presenceTimer)
    this.presenceTimer = setInterval(() => {
      this.announcePresence(true)
    }, 6000)

    this.initVoiceChat()
  }

  private announcePresence(isHeartbeat: boolean = false): void {
    this.sendMessage({
      type: isHeartbeat ? 'BC_HEARTBEAT' : 'BC_HELLO',
      peer: {
        peerId: this.peerId,
        name: this.myName,
        girl: this.myGirl,
        bet: this.betAmount,
      },
      gameMode: this.gameMode,
      allowDonden: this.allowDonden,
    })
  }

  leaveRoom(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer)
      this.presenceTimer = null
    }
    if (this.roomId) {
      this.sendMessage({
        type: 'PEER_LEFT',
        leftPeerId: this.peerId,
      })
    }
    if (this.es) {
      this.es.close()
      this.es = null
    }
    if (this.bc) {
      this.bc.close()
      this.bc = null
    }
    this.publicSignaling.disconnect()
    this.cleanupWebRTC()
    this.peers = []
    this.isPvpConnected = false
  }

  async sendMessage(payload: Record<string, any>): Promise<void> {
    if (!this.roomId) return
    const msgId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const fullMsg = {
      ...payload,
      msgId,
      roomId: this.roomId,
      senderId: this.peerId,
    }
    this.seenMsgIds.add(msgId)

    // Channel 1: Local BroadcastChannel
    try {
      this.bc?.postMessage(fullMsg)
    } catch {}

    // Channel 2: Public Internet WSS Broker
    try {
      this.publicSignaling.publish(fullMsg)
    } catch {}

    // Channel 3: LAN Vite Server
    try {
      await fetch('/api/room/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullMsg),
      })
    } catch {}
  }

  private mergePeer(p: PvpPeerInfo): boolean {
    if (!p || !p.peerId) return false
    const existing = this.peers.find((x) => x.peerId === p.peerId)
    if (existing) {
      existing.name = p.name
      existing.girl = p.girl
      existing.bet = p.bet
      return false
    } else {
      if (this.peers.length < 4) {
        this.peers.push(p)
        return true
      }
      return false
    }
  }

  private handleIncomingMessage(data: any): void {
    if (!data) return
    if (data.msgId) {
      if (this.seenMsgIds.has(data.msgId)) return
      this.seenMsgIds.add(data.msgId)
    }
    if (data.senderId === this.peerId && data.type !== 'ROOM_ROSTER') return

    switch (data.type) {
      case 'ROOM_ROSTER': {
        const list = (data.peers || []) as PvpPeerInfo[]
        for (const p of list) {
          this.mergePeer(p)
        }
        this.updateRoleFromPeers()
        if (this.onRosterUpdate) {
          this.onRosterUpdate(this.peers, data.joinedPeerId)
        }
        break
      }

      case 'BC_HELLO':
      case 'BC_HEARTBEAT': {
        const p = data.peer as PvpPeerInfo
        const isNew = this.mergePeer(p)
        if (!this.peers.some((x) => x.peerId === this.peerId)) {
          this.peers.unshift({
            peerId: this.peerId,
            name: this.myName,
            girl: this.myGirl,
            bet: this.betAmount,
          })
        }
        this.updateRoleFromPeers()
        if (isNew || data.type === 'BC_HELLO') {
          if (this.onRosterUpdate) {
            this.onRosterUpdate(this.peers, isNew ? p?.peerId : undefined)
          }
          if (data.type === 'BC_HELLO') {
            this.sendMessage({
              type: 'BC_HELLO_ACK',
              peer: {
                peerId: this.peerId,
                name: this.myName,
                girl: this.myGirl,
                bet: this.betAmount,
              },
              gameMode: this.gameMode,
              allowDonden: this.allowDonden,
            })
            if (p && p.peerId !== this.peerId && this.peerId < p.peerId) {
              this.startWebRTCOffer(p.peerId)
            }
          }
        }
        break
      }

      case 'BC_HELLO_ACK': {
        const p = data.peer as PvpPeerInfo
        const isNew = this.mergePeer(p)
        this.updateRoleFromPeers()
        if (!this.isHost && data.gameMode) {
          this.gameMode = data.gameMode
          this.allowDonden = Boolean(data.allowDonden)
          this.onRoomRuleChange?.(this.gameMode, this.allowDonden, this.betAmount)
        }
        if (this.onRosterUpdate) {
          this.onRosterUpdate(this.peers, isNew ? p?.peerId : undefined)
        }
        if (p && p.peerId !== this.peerId && this.peerId < p.peerId) {
          this.startWebRTCOffer(p.peerId)
        }
        break
      }

      case 'UPDATE_META': {
        const sender = this.peers.find((p) => p.peerId === data.senderId)
        if (sender) {
          if (data.girl !== undefined) sender.girl = data.girl
          if (data.bet !== undefined) sender.bet = data.bet
          if (data.name !== undefined) sender.name = data.name
        }
        if (data.gameMode !== undefined) {
          this.gameMode = data.gameMode
        }
        if (data.allowDonden !== undefined) {
          this.allowDonden = Boolean(data.allowDonden)
        }
        if (data.bet !== undefined) {
          this.betAmount = data.bet
        }
        this.onRoomRuleChange?.(this.gameMode, this.allowDonden, this.betAmount)
        this.onRosterUpdate?.(this.peers)
        break
      }

      case 'PEER_LEFT': {
        this.peers = this.peers.filter((p) => p.peerId !== data.leftPeerId)
        this.isPvpConnected = this.peers.length >= 2
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(data.leftPeerId)
        }
        break
      }

      case 'START_PVP_MATCH': {
        this.moveQueue = []
        if (data.payload) {
          this.gameMode = data.payload.gameMode || '2P'
          this.allowDonden = Boolean(data.payload.allowDonden)
          this.betAmount = data.payload.betAmount || 20
        }
        if (this.onStartPvpMatch) {
          this.onStartPvpMatch(data.payload)
        }
        break
      }

      case 'PVP_MOVE': {
        const move = data.move as PvpMovePacket
        if (move.phase === 'DONDEN') {
          if (this.onOpponentDonden) {
            this.onOpponentDonden(move.seatIndex)
          }
          return
        }
        if (this.moveResolvers.length > 0) {
          const r = this.moveResolvers.shift()!
          r(move)
        } else {
          this.moveQueue.push(move)
        }
        break
      }

      case 'CHAT_EMOTE': {
        if (this.onChatEmote) {
          this.onChatEmote(data.senderName || '雀友', data.text)
        }
        this.speakText(data.text)
        break
      }

      case 'WEBRTC_OFFER': {
        if (!data.targetPeerId || data.targetPeerId === this.peerId) {
          this.handleWebRTCOffer(data.senderId, data.sdp)
        }
        break
      }
      case 'WEBRTC_ANSWER': {
        if (!data.targetPeerId || data.targetPeerId === this.peerId) {
          this.handleWebRTCAnswer(data.senderId, data.sdp)
        }
        break
      }
      case 'WEBRTC_ICE': {
        if (!data.targetPeerId || data.targetPeerId === this.peerId) {
          this.handleWebRTCIce(data.senderId, data.candidate)
        }
        break
      }
    }
  }

  private updateRoleFromPeers(): void {
    this.PeersSort()
    this.isPvpConnected = this.peers.length >= 2
    if (this.peers.length > 0) {
      this.isHost = this.peers[0].peerId === this.peerId
    }
  }

  private PeersSort(): void {
    // Keep stable insertion order, ensuring no duplicates
    const seen = new Set<string>()
    this.peers = this.peers.filter((p) => {
      if (seen.has(p.peerId)) return false
      seen.add(p.peerId)
      return true
    })
  }

  getOpponentPeer(): PvpPeerInfo | null {
    return this.peers.find((p) => p.peerId !== this.peerId) || null
  }

  updateMyMeta(girl: number, bet: number, gameMode?: '2P' | '4P', allowDonden?: boolean): void {
    this.myGirl = girl
    this.betAmount = bet
    if (gameMode !== undefined) this.gameMode = gameMode
    if (allowDonden !== undefined) this.allowDonden = allowDonden

    const me = this.peers.find((p) => p.peerId === this.peerId)
    if (me) {
      me.girl = girl
      me.bet = bet
    }
    this.sendMessage({
      type: 'UPDATE_META',
      girl,
      bet,
      name: this.myName,
      gameMode: this.gameMode,
      allowDonden: this.allowDonden,
    })
  }

  requestStartPvpMatch(): void {
    const botNames = ['电脑·美纪', '电脑·留美', '电脑·结衣', '电脑·雅子']
    const totalSeats = this.gameMode === '4P' ? 4 : 2
    const seats: SeatPlayerInfo[] = []

    for (let i = 0; i < totalSeats; i++) {
      const human = this.peers[i]
      if (human) {
        seats.push({
          seatIndex: i,
          peerId: human.peerId,
          name: human.name,
          girl: human.girl,
          isBot: false,
        })
      } else {
        const botGirl = (this.myGirl + i) % 4
        seats.push({
          seatIndex: i,
          peerId: `BOT_${i}`,
          name: botNames[botGirl],
          girl: botGirl,
          isBot: true,
        })
      }
    }

    const opp = seats[1] || {
      peerId: 'BOT_1',
      name: '电脑·留美',
      girl: (this.myGirl + 1) % 4,
      isBot: true,
    }

    const seed = Math.floor(Math.random() * 2000000000) + 1000
    const payload: StartMatchPayload = {
      roomSeed: seed,
      gameMode: this.gameMode,
      allowDonden: this.allowDonden,
      betAmount: this.betAmount,
      hostPeerId: this.peerId,
      seats,
      hostGirl: seats[0].girl,
      guestGirl: opp.girl,
      hostName: seats[0].name,
      guestName: opp.name,
    }

    this.moveQueue = []
    this.sendMessage({
      type: 'START_PVP_MATCH',
      payload,
    })
    if (this.onStartPvpMatch) {
      this.onStartPvpMatch(payload)
    }
  }

  sendPvpMove(move: PvpMovePacket): void {
    this.sendMessage({
      type: 'PVP_MOVE',
      move,
    })
  }

  waitForOpponentMove(): Promise<PvpMovePacket> {
    if (this.moveQueue.length > 0) {
      return Promise.resolve(this.moveQueue.shift()!)
    }
    return new Promise((resolve) => {
      this.moveResolvers.push(resolve)
    })
  }

  clearMoveQueue(): void {
    this.moveQueue = []
    this.moveResolvers = []
  }

  sendVoiceEmote(text: string): void {
    this.sendMessage({
      type: 'CHAT_EMOTE',
      senderName: this.myName,
      text,
    })
    if (this.onChatEmote) {
      this.onChatEmote(this.myName, text)
    }
    this.speakText(text)
  }

  private speakText(text: string): void {
    if (!this.speakerEnabled) return
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'
        u.rate = 1.15
        u.onstart = () => {
          this.remoteSpeaking = true
          this.onSpeakingChange?.(this.localSpeaking, true)
        }
        u.onend = () => {
          this.remoteSpeaking = false
          this.onSpeakingChange?.(this.localSpeaking, false)
        }
        window.speechSynthesis.speak(u)
      }
    } catch {}
  }

  // =========================================================
  // Multi-Peer WebRTC P2P Real-time Voice Chat + Audio Ducking
  // =========================================================
  async initVoiceChat(): Promise<void> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.voiceStatus = '语音就绪 (快捷台词模式)'
        return
      }
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = this.micEnabled
      })
      this.voiceStatus = this.micEnabled ? '🎙️ 实时语音已开麦' : '🔇 麦克风已静音'
      this.setupAudioAnalyser()
    } catch {
      this.voiceStatus = '🔊 仅收听模式 (未检测到麦克风)'
    }
  }

  toggleMic(): boolean {
    this.micEnabled = !this.micEnabled
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = this.micEnabled
      })
    }
    this.voiceStatus = this.micEnabled ? '🎙️ 实时语音已开麦' : '🔇 麦克风已静音'
    return this.micEnabled
  }

  toggleSpeaker(): boolean {
    this.speakerEnabled = !this.speakerEnabled
    for (const audio of this.remoteAudios.values()) {
      audio.muted = !this.speakerEnabled
    }
    return this.speakerEnabled
  }

  private createPeerConnection(remotePeerId: string): RTCPeerConnection {
    const oldPc = this.pcs.get(remotePeerId)
    if (oldPc) oldPc.close()

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    })
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!)
      })
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendMessage({
          type: 'WEBRTC_ICE',
          targetPeerId: remotePeerId,
          candidate: ev.candidate,
        })
      }
    }
    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        let audio = this.remoteAudios.get(remotePeerId)
        if (!audio) {
          audio = new Audio()
          audio.autoplay = true
          this.remoteAudios.set(remotePeerId, audio)
        }
        audio.srcObject = ev.streams[0]
        audio.muted = !this.speakerEnabled
        audio.play().catch(() => {})
        this.voiceStatus = '🟢 P2P 语音通话中'
      }
    }
    this.pcs.set(remotePeerId, pc)
    return pc
  }

  private async startWebRTCOffer(remotePeerId: string): Promise<void> {
    try {
      const pc = this.createPeerConnection(remotePeerId)
      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      this.sendMessage({
        type: 'WEBRTC_OFFER',
        targetPeerId: remotePeerId,
        sdp: pc.localDescription,
      })
    } catch {}
  }

  private async handleWebRTCOffer(remotePeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.createPeerConnection(remotePeerId)
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.sendMessage({
        type: 'WEBRTC_ANSWER',
        targetPeerId: remotePeerId,
        sdp: pc.localDescription,
      })
    } catch {}
  }

  private async handleWebRTCAnswer(remotePeerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.pcs.get(remotePeerId)
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      }
    } catch {}
  }

  private async handleWebRTCIce(remotePeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const pc = this.pcs.get(remotePeerId)
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch {}
  }

  private setupAudioAnalyser(): void {
    if (!this.localStream) return
    try {
      this.audioCtx = new AudioContext()
      const src = this.audioCtx.createMediaStreamSource(this.localStream)
      const analyser = this.audioCtx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      if (this.rmsInterval) clearInterval(this.rmsInterval)
      this.rmsInterval = setInterval(() => {
        if (!this.micEnabled) {
          if (this.localSpeaking) {
            this.localSpeaking = false
            this.onSpeakingChange?.(false, this.remoteSpeaking)
          }
          return
        }
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length
        const speaking = avg > 18
        if (speaking !== this.localSpeaking) {
          this.localSpeaking = speaking
          this.onSpeakingChange?.(this.localSpeaking, this.remoteSpeaking)
        }
      }, 120)
    } catch {}
  }

  private cleanupWebRTC(): void {
    if (this.rmsInterval) {
      clearInterval(this.rmsInterval)
      this.rmsInterval = null
    }
    for (const pc of this.pcs.values()) {
      pc.close()
    }
    this.pcs.clear()
    this.remoteAudios.clear()
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
  }
}
