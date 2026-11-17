// PVP Room Synchronization (Public Internet WSS + LAN SSE + BroadcastChannel)
// & WebRTC P2P Voice Chat Manager (Supports 2P Arcade Duel & 4P Four-Player Mahjong)

export const CLIENT_PROTOCOL_VERSION = '4.1.0'

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
  round?: number
  seatIndex?: number
  phase: 'DRAW' | 'DISCARD' | 'DONDEN' | 'CLAIM' | 'TIMEOUT'
  act: number
  index?: number
  tileCode?: string
  chowLocation?: number
  prevDraw?: {
    act: number
    tileCode?: string
    chowLocation?: number
  }
  winResult?: any
  winHand?: any
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
  public peerId: string = ''
  public myName: string = ''
  public myGirl: number = 2
  public betAmount: number = 20
  public gameMode: '2P' | '4P' = '2P'
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
  private lastServerSeq: number = 0
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
  public onRoomSync?: (payload: { match: StartMatchPayload; moves: PvpMovePacket[] }) => void
  public onRoomRuleChange?: (gameMode: '2P' | '4P', allowDonden: boolean, betAmount: number) => void
  public onSpeakingChange?: (local: boolean, remote: boolean) => void
  public onChatEmote?: (senderName: string, text: string) => void
  public onOpponentDonden?: (seatIndex?: number) => void
  public onPublicStatusChange?: (connected: boolean, text: string) => void
  public onVersionMismatch?: (serverVer: string) => void

  constructor() {
    this.initPersistentIdentity()
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

  private initPersistentIdentity(): void {
    try {
      const isGuestTest = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('guest') === '1'
      const store = isGuestTest ? window.sessionStorage : window.localStorage

      let savedId = store.getItem('weimzh_peer_id')
      if (!savedId) {
        savedId = 'p_' + Math.random().toString(36).slice(2, 9)
        store.setItem('weimzh_peer_id', savedId)
      }
      this.peerId = savedId

      let savedName = store.getItem('weimzh_player_name')
      if (!savedName) {
        const suffix = isGuestTest ? '测试友_' + Math.floor(100 + Math.random() * 900) : Math.floor(100 + Math.random() * 900)
        savedName = isGuestTest ? `街机${suffix}` : `街机雀神_${suffix}`
        store.setItem('weimzh_player_name', savedName)
      }
      this.myName = savedName

      const savedGirl = store.getItem('weimzh_my_girl')
      if (savedGirl !== null) {
        const g = parseInt(savedGirl, 10)
        if (g >= 0 && g <= 3) this.myGirl = g
      }
    } catch {
      this.peerId = 'p_' + Math.random().toString(36).slice(2, 9)
      this.myName = '街机雀神_' + Math.floor(100 + Math.random() * 900)
    }
  }

  setMyName(newName: string): void {
    const trimmed = newName.trim().slice(0, 14)
    if (!trimmed) return
    this.myName = trimmed
    try {
      const isGuestTest = new URLSearchParams(window.location.search).get('guest') === '1'
      const store = isGuestTest ? window.sessionStorage : window.localStorage
      store.setItem('weimzh_player_name', trimmed)
    } catch {}
    const me = this.peers.find((p) => p.peerId === this.peerId)
    if (me) me.name = trimmed
    this.updateMyMeta(this.myGirl, this.betAmount, this.gameMode, this.allowDonden)
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
    this.lastServerSeq = 0
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

    // 2. SSE connection to Vite/Production built-in room server (with auto-reconnect on Cloudflare reset)
    this.openSseStream(roomId)

    // 3. Public Internet MQTT over WSS Relay for cross-network / mobile 5G / GitHub Pages
    this.publicSignaling.connect(roomId)

    setTimeout(() => {
      this.announcePresence()
    }, 180)

    if (this.presenceTimer) clearInterval(this.presenceTimer)
    this.presenceTimer = setInterval(() => {
      if (this.roomId && (!this.es || this.es.readyState === EventSource.CLOSED)) {
        this.openSseStream(this.roomId)
      }
      this.announcePresence(true)
    }, 2800)

    this.initVoiceChat()
  }

  private openSseStream(roomId: string): void {
    try {
      if (this.es) {
        this.es.close()
        this.es = null
      }
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
      this.es.onerror = () => {
        if (this.es && this.es.readyState === EventSource.CLOSED && this.roomId) {
          setTimeout(() => {
            if (this.roomId && (!this.es || this.es.readyState === EventSource.CLOSED)) {
              this.openSseStream(this.roomId)
            }
          }, 1500)
        }
      }
    } catch {}
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
      clientVersion: CLIENT_PROTOCOL_VERSION,
      sinceSeq: this.lastServerSeq,
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

    // Channel 3: Server HTTP POST + Piggybacked Missed-Events Sync (100% immune to Cloudflare SSE drops!)
    try {
      const resp = await fetch('/api/room/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullMsg),
      })
      if (resp.ok) {
        const json = await resp.json().catch(() => null)
        if (json) {
          if (json.serverVersion && json.serverVersion !== CLIENT_PROTOCOL_VERSION) {
            this.onVersionMismatch?.(json.serverVersion)
          }
          if (typeof json.latestSeq === 'number' && json.latestSeq > this.lastServerSeq) {
            this.lastServerSeq = json.latestSeq
          }
          if (Array.isArray(json.events)) {
            for (const ev of json.events) {
              if (typeof ev.seq === 'number' && ev.seq > this.lastServerSeq) {
                this.lastServerSeq = ev.seq
              }
              this.handleIncomingMessage(ev)
            }
          }
        }
      }
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
        // Trigger WebRTC offer only to peers that don't already have an active/connecting RTCPeerConnection
        for (const p of this.peers) {
          if (p.peerId !== this.peerId && (this.isHost || this.peerId < p.peerId)) {
            const existingPc = this.pcs.get(p.peerId)
            const st = existingPc?.connectionState
            if (!existingPc || st === 'failed' || st === 'closed' || st === 'disconnected') {
              this.startWebRTCOffer(p.peerId)
            }
          }
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

      case 'ROOM_SYNC': {
        if (data.match) {
          this.gameMode = data.match.gameMode || '2P'
          this.allowDonden = Boolean(data.match.allowDonden)
          this.betAmount = data.match.betAmount || 20
          this.onRoomSync?.({
            match: data.match,
            moves: Array.isArray(data.moves) ? data.moves : [],
          })
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
        this.playVoiceAlertTone()
        this.speakText(data.text, data.tauntIdx)
        break
      }

      case 'VOICE_AUDIO_CHUNK': {
        if (this.speakerEnabled && data.audioDataUrl) {
          this.playRelayedAudioChunk(data.audioDataUrl)
        }
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

  updateMyMeta(
    girl: number,
    bet: number,
    gameMode?: '2P' | '4P',
    allowDonden?: boolean,
    isPrivate?: boolean
  ): void {
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
      ...(isPrivate !== undefined ? { isPrivate } : {}),
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

  public onTurnCountdown?: (secLeft: number, isWaitingOpponent: boolean) => void
  private mediaRecorder: MediaRecorder | null = null
  private voiceRelayInterval: any = null
  private isWebRtcTrackPlaying: boolean = false
  private ttsUnlocked: boolean = false

  unlockVoiceAudio(): void {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (Ctx) this.audioCtx = new Ctx()
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {})
      }
      if (!this.ttsUnlocked && 'speechSynthesis' in window) {
        this.ttsUnlocked = true
        const silent = new SpeechSynthesisUtterance('')
        silent.volume = 0
        window.speechSynthesis.speak(silent)
      }
      for (const audio of this.remoteAudios.values()) {
        if (audio.paused) audio.play().catch(() => {})
      }
    } catch {}
  }

  waitForOpponentMove(
    timeoutMs: number = 45000,
    expectedRound?: number,
    expectedPhase?: 'DRAW' | 'DISCARD'
  ): Promise<PvpMovePacket> {
    for (let i = 0; i < this.moveQueue.length; i++) {
      const next = this.moveQueue[i]
      if (expectedRound !== undefined && next.round !== undefined) {
        if (next.round < expectedRound) {
          // Discard stale packet from an earlier round
          this.moveQueue.splice(i, 1)
          i--
          continue
        }
        if (next.round > expectedRound) {
          // Preserve packet belonging to the next round!
          continue
        }
      }
      if (expectedPhase && next.phase !== 'TIMEOUT' && next.phase !== expectedPhase) {
        // If we are waiting for DISCARD, discard any leftover duplicate DRAW packet (unless Ron act === 3)
        if (expectedPhase === 'DISCARD' && next.phase === 'DRAW' && next.act !== 3) {
          this.moveQueue.splice(i, 1)
          i--
          continue
        }
        // If we are waiting for DRAW and a DISCARD packet arrived ahead of DRAW (with or without prevDraw),
        // ALWAYS synthesize DRAW once and keep DISCARD in queue for AS_DISCARD! NEVER pass DISCARD into AS_DRAW!
        if (expectedPhase === 'DRAW' && next.phase === 'DISCARD') {
          if ((next as any)._drawSynthesized) {
            continue
          }
          const synthDraw: PvpMovePacket = {
            round: next.round,
            phase: 'DRAW',
            act: next.prevDraw?.act ?? 1,
            tileCode: next.prevDraw?.tileCode,
            chowLocation: next.prevDraw?.chowLocation,
          }
          ;(next as any)._drawSynthesized = true
          delete next.prevDraw
          this.onTurnCountdown?.(0, false)
          return Promise.resolve(synthDraw)
        }
        continue
      }
      this.moveQueue.splice(i, 1)
      this.onTurnCountdown?.(0, false)
      return Promise.resolve(next)
    }
    return new Promise((resolve) => {
      let secLeft = Math.ceil(timeoutMs / 1000)
      this.onTurnCountdown?.(secLeft, true)

      const tickTimer = setInterval(() => {
        secLeft = Math.max(0, secLeft - 1)
        this.onTurnCountdown?.(secLeft, true)
      }, 1000)

      let wrappedResolve: (move: PvpMovePacket) => void
      const timeoutId = setTimeout(() => {
        clearInterval(tickTimer)
        this.onTurnCountdown?.(0, false)
        const idx = this.moveResolvers.indexOf(wrappedResolve)
        if (idx >= 0) this.moveResolvers.splice(idx, 1)
        resolve({ phase: 'TIMEOUT', act: -1 })
      }, timeoutMs)

      wrappedResolve = (move: PvpMovePacket) => {
        if (move.phase === 'TIMEOUT') {
          clearTimeout(timeoutId)
          clearInterval(tickTimer)
          this.onTurnCountdown?.(0, false)
          resolve(move)
          return
        }
        if (expectedRound !== undefined && move.round !== undefined) {
          if (move.round < expectedRound) {
            // Ignore stale packet from an earlier round and keep waiting
            this.moveResolvers.unshift(wrappedResolve)
            return
          }
          if (move.round > expectedRound) {
            // Save future round packet in moveQueue and keep waiting for current round
            this.moveQueue.push(move)
            this.moveResolvers.unshift(wrappedResolve)
            return
          }
        }
        if (expectedPhase && move.phase !== expectedPhase) {
          // If waiting for DISCARD and a late duplicate DRAW arrives, ignore the duplicate DRAW
          if (expectedPhase === 'DISCARD' && move.phase === 'DRAW' && move.act !== 3) {
            this.moveResolvers.unshift(wrappedResolve)
            return
          }
          // If waiting for DRAW and DISCARD arrives first (with or without prevDraw), synthesize DRAW and queue DISCARD!
          if (expectedPhase === 'DRAW' && move.phase === 'DISCARD') {
            const synthDraw: PvpMovePacket = {
              round: move.round,
              phase: 'DRAW',
              act: move.prevDraw?.act ?? 1,
              tileCode: move.prevDraw?.tileCode,
              chowLocation: move.prevDraw?.chowLocation,
            }
            ;(move as any)._drawSynthesized = true
            delete move.prevDraw
            this.moveQueue.push(move)
            clearTimeout(timeoutId)
            clearInterval(tickTimer)
            this.onTurnCountdown?.(0, false)
            resolve(synthDraw)
            return
          }
          this.moveQueue.push(move)
          this.moveResolvers.unshift(wrappedResolve)
          return
        }
        clearTimeout(timeoutId)
        clearInterval(tickTimer)
        this.onTurnCountdown?.(0, false)
        resolve(move)
      }
      this.moveResolvers.push(wrappedResolve)
    })
  }

  abortWaitingMove(): void {
    this.onTurnCountdown?.(0, false)
    while (this.moveResolvers.length > 0) {
      const r = this.moveResolvers.shift()!
      r({ phase: 'TIMEOUT', act: -1 })
    }
  }

  clearMoveQueue(): void {
    this.moveQueue = []
    this.moveResolvers = []
    this.onTurnCountdown?.(0, false)
  }

  sendVoiceEmote(text: string, tauntIdx?: number): void {
    this.unlockVoiceAudio()
    this.sendMessage({
      type: 'CHAT_EMOTE',
      senderName: this.myName,
      text,
      tauntIdx,
    })
    if (this.onChatEmote) {
      this.onChatEmote(this.myName, text)
    }
    this.playVoiceAlertTone()
    this.speakText(text, tauntIdx)
  }

  private playVoiceAlertTone(): void {
    if (!this.speakerEnabled) return
    try {
      // 1. Play crisp arcade voice attention sound
      const sfx = new Audio('/weimzh/sound/ding.wav')
      sfx.volume = 0.85
      sfx.play().catch(() => {})

      // 2. Synthesize a pleasant 2-note WebAudio walkie-talkie chime (never blocked once AudioContext is resumed)
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!this.audioCtx && Ctx) this.audioCtx = new Ctx()
      if (this.audioCtx) {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {})
        const now = this.audioCtx.currentTime
        const osc = this.audioCtx.createOscillator()
        const gain = this.audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(587.33, now) // D5
        osc.frequency.setValueAtTime(880, now + 0.09) // A5
        gain.gain.setValueAtTime(0.18, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
        osc.connect(gain)
        gain.connect(this.audioCtx.destination)
        osc.start(now)
        osc.stop(now + 0.25)
      }
    } catch {}
  }

  private speakText(text: string, tauntIdx?: number): void {
    if (!this.speakerEnabled) return
    this.remoteSpeaking = true
    this.onSpeakingChange?.(this.localSpeaking, true)
    const resetSpeak = setTimeout(() => {
      this.remoteSpeaking = false
      this.onSpeakingChange?.(this.localSpeaking, false)
    }, 2800)

    // Prefer real pre-generated Taiwanese female MP3 voice file for Tencent quick voice lines!
    if (tauntIdx !== undefined && tauntIdx >= 0 && tauntIdx <= 7) {
      try {
        const audio = new Audio(`/weimzh/voice/taunts/taunt_${tauntIdx}.mp3`)
        audio.volume = 1.0
        audio.onended = () => {
          clearTimeout(resetSpeak)
          this.remoteSpeaking = false
          this.onSpeakingChange?.(this.localSpeaking, false)
        }
        audio.play().catch(() => {})
        return
      } catch {}
    }

    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        window.speechSynthesis.resume()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'
        u.rate = 1.1
        u.volume = 1.0
        const voices = window.speechSynthesis.getVoices()
        const zhVoice = voices.find((v) => v.lang.includes('zh') || v.lang.includes('CN'))
        if (zhVoice) u.voice = zhVoice
        u.onend = () => {
          clearTimeout(resetSpeak)
          this.remoteSpeaking = false
          this.onSpeakingChange?.(this.localSpeaking, false)
        }
        window.speechSynthesis.speak(u)
      }
    } catch {}
  }

  private playRelayedAudioChunk(dataUrl: string): void {
    if (!this.speakerEnabled) return
    try {
      const a = new Audio(dataUrl)
      a.volume = 1.0
      this.remoteSpeaking = true
      this.onSpeakingChange?.(this.localSpeaking, true)
      a.onended = () => {
        this.remoteSpeaking = false
        this.onSpeakingChange?.(this.localSpeaking, false)
      }
      a.onerror = () => {
        this.remoteSpeaking = false
        this.onSpeakingChange?.(this.localSpeaking, false)
      }
      a.play().catch(() => {
        this.remoteSpeaking = false
        this.onSpeakingChange?.(this.localSpeaking, false)
      })
    } catch {}
  }

  async recordAndSendVoiceClip(durationMs: number = 3200): Promise<boolean> {
    this.unlockVoiceAudio()
    if (!this.localStream) {
      await this.initVoiceChat()
    }
    if (!this.localStream || typeof MediaRecorder === 'undefined') return false
    return new Promise((resolve) => {
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
        const rec = mimeType ? new MediaRecorder(this.localStream!, { mimeType }) : new MediaRecorder(this.localStream!)
        const chunks: BlobPart[] = []
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data)
        }
        rec.onstop = () => {
          this.localSpeaking = false
          this.onSpeakingChange?.(false, this.remoteSpeaking)
          if (chunks.length === 0) {
            resolve(false)
            return
          }
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
          const reader = new FileReader()
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              this.sendMessage({
                type: 'VOICE_AUDIO_CHUNK',
                senderName: this.myName,
                audioDataUrl: reader.result,
              })
              this.sendMessage({
                type: 'CHAT_EMOTE',
                senderName: this.myName,
                text: '🎤 [发送了一条真人语音]',
              })
              resolve(true)
            } else {
              resolve(false)
            }
          }
          reader.readAsDataURL(blob)
        }
        this.localSpeaking = true
        this.onSpeakingChange?.(true, this.remoteSpeaking)
        rec.start()
        setTimeout(() => {
          if (rec.state === 'recording') {
            try {
              rec.stop()
            } catch {
              resolve(false)
            }
          }
        }, durationMs)
      } catch {
        resolve(false)
      }
    })
  }

  // =========================================================
  // Multi-Peer WebRTC P2P Real-time Voice Chat + Server Relay Fallback
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
      this.setupVoiceChunkRelay()

      // Crucial fix: once localStream is acquired, renegotiate / offer to all connected peers in room!
      for (const p of this.peers) {
        if (p.peerId !== this.peerId) {
          this.startWebRTCOffer(p.peerId)
        }
      }
    } catch {
      this.voiceStatus = '🔊 仅收听模式 (未授权麦克风)'
    }
  }

  private setupVoiceChunkRelay(): void {
    if (!this.localStream || typeof MediaRecorder === 'undefined') return
    try {
      if (this.voiceRelayInterval) clearInterval(this.voiceRelayInterval)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''

      // Record short 2.2s voice clips when user is actively speaking into microphone
      this.voiceRelayInterval = setInterval(() => {
        if (!this.micEnabled || !this.localStream || !this.roomId || this.peers.length < 2) return
        if (!this.localSpeaking) return
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') return

        try {
          const rec = mimeType ? new MediaRecorder(this.localStream, { mimeType }) : new MediaRecorder(this.localStream)
          const chunks: BlobPart[] = []
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data)
          }
          rec.onstop = () => {
            if (chunks.length === 0) return
            const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
            if (blob.size < 400 || blob.size > 350000) return
            const reader = new FileReader()
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                this.sendMessage({
                  type: 'VOICE_AUDIO_CHUNK',
                  audioDataUrl: reader.result,
                })
              }
            }
            reader.readAsDataURL(blob)
          }
          this.mediaRecorder = rec
          rec.start()
          setTimeout(() => {
            if (rec.state === 'recording') {
              try {
                rec.stop()
              } catch {}
            }
          }, 2200)
        } catch {}
      }, 600)
    } catch {}
  }

  toggleMic(): boolean {
    this.unlockVoiceAudio()
    this.micEnabled = !this.micEnabled
    if (!this.localStream && this.micEnabled) {
      this.initVoiceChat()
    } else if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = this.micEnabled
      })
    }
    this.voiceStatus = this.micEnabled ? '🎙️ 实时语音已开麦' : '🔇 麦克风已静音'
    return this.micEnabled
  }

  toggleSpeaker(): boolean {
    this.unlockVoiceAudio()
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
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
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
          audio = document.createElement('audio')
          audio.autoplay = true
          ;(audio as any).playsInline = true
          audio.style.display = 'none'
          document.body.appendChild(audio)
          this.remoteAudios.set(remotePeerId, audio)
        }
        audio.srcObject = ev.streams[0]
        audio.muted = !this.speakerEnabled
        audio
          .play()
          .then(() => {
            this.isWebRtcTrackPlaying = true
          })
          .catch(() => {})
        this.voiceStatus = '🟢 P2P 实时语音通话中'
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
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!this.audioCtx && Ctx) this.audioCtx = new Ctx()
      if (!this.audioCtx) return
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
        const speaking = avg > 15
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
    if (this.voiceRelayInterval) {
      clearInterval(this.voiceRelayInterval)
      this.voiceRelayInterval = null
    }
    for (const pc of this.pcs.values()) {
      pc.close()
    }
    this.pcs.clear()
    for (const audio of this.remoteAudios.values()) {
      try {
        audio.pause()
        audio.remove()
      } catch {}
    }
    this.remoteAudios.clear()
    this.isWebRtcTrackPlaying = false
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
  }
}
