// PVP Room Synchronization & WebRTC P2P Voice Chat Manager (PRD 4.4 & 4.6)

export interface PvpPeerInfo {
  peerId: string
  name: string
  girl: number
  bet: number
}

export interface PvpMovePacket {
  phase: 'DRAW' | 'DISCARD' | 'DONDEN'
  act: number
  index?: number
  chowLocation?: number
}

export class PvpManager {
  public roomId: string = ''
  public peerId: string = 'p_' + Math.random().toString(36).slice(2, 9)
  public myName: string = '街机雀神_' + Math.floor(100 + Math.random() * 900)
  public myGirl: number = 2
  public betAmount: number = 20

  public peers: PvpPeerInfo[] = []
  public lanIps: string[] = []
  public isPvpConnected: boolean = false
  public isHost: boolean = true

  // WebRTC Voice Chat state
  public micEnabled: boolean = true // PRD 4.6: 进房默认开麦
  public speakerEnabled: boolean = true
  public localSpeaking: boolean = false
  public remoteSpeaking: boolean = false
  public voiceStatus: string = '待机中'

  private es: EventSource | null = null
  private bc: BroadcastChannel | null = null
  private seenMsgIds = new Set<string>()

  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteAudio: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private rmsInterval: any = null

  private moveQueue: PvpMovePacket[] = []
  private moveResolvers: ((move: PvpMovePacket) => void)[] = []

  public onRosterUpdate?: (peers: PvpPeerInfo[], joinedPeerId?: string) => void
  public onPeerDisconnected?: (leftPeerId: string) => void
  public onStartPvpMatch?: (payload: {
    roomSeed: number
    betAmount: number
    hostPeerId: string
    hostGirl: number
    guestGirl: number
    hostName: string
    guestName: string
  }) => void
  public onSpeakingChange?: (local: boolean, remote: boolean) => void
  public onChatEmote?: (senderName: string, text: string) => void
  public onOpponentDonden?: () => void

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
    this.fetchLanInfo()

    // 1. BroadcastChannel for zero-latency multi-tab sync
    try {
      this.bc = new BroadcastChannel('weimzh_pvp_' + roomId)
      this.bc.onmessage = (ev) => {
        this.handleIncomingMessage(ev.data)
      }
    } catch {}

    // 2. SSE connection to Vite built-in room server for cross-browser / LAN sync
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

    // Announce presence over BroadcastChannel as well
    setTimeout(() => {
      this.sendMessage({
        type: 'BC_HELLO',
        peer: {
          peerId: this.peerId,
          name: this.myName,
          girl: this.myGirl,
          bet: this.betAmount,
        },
      })
    }, 150)

    // PRD 4.6: Initialize microphone by default on room join
    this.initVoiceChat()
  }

  leaveRoom(): void {
    if (this.es) {
      this.es.close()
      this.es = null
    }
    if (this.bc) {
      this.bc.close()
      this.bc = null
    }
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

    try {
      this.bc?.postMessage(fullMsg)
    } catch {}

    try {
      await fetch('/api/room/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullMsg),
      })
    } catch {}
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
        this.peers = data.peers || []
        this.updateRoleFromPeers()
        if (this.onRosterUpdate) {
          this.onRosterUpdate(this.peers, data.joinedPeerId)
        }
        if (this.peers.length >= 2 && this.isHost) {
          this.startWebRTCOffer()
        }
        break
      }

      case 'BC_HELLO': {
        const p = data.peer as PvpPeerInfo
        if (p && !this.peers.some((x) => x.peerId === p.peerId)) {
          this.peers.push(p)
        }
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
          this.onRosterUpdate(this.peers, p?.peerId)
        }
        this.sendMessage({
          type: 'BC_HELLO_ACK',
          peer: {
            peerId: this.peerId,
            name: this.myName,
            girl: this.myGirl,
            bet: this.betAmount,
          },
        })
        break
      }

      case 'BC_HELLO_ACK': {
        const p = data.peer as PvpPeerInfo
        if (p && !this.peers.some((x) => x.peerId === p.peerId)) {
          this.peers.push(p)
          this.updateRoleFromPeers()
          if (this.onRosterUpdate) {
            this.onRosterUpdate(this.peers, p.peerId)
          }
        }
        break
      }

      case 'PEER_LEFT': {
        this.peers = data.peers || this.peers.filter((p) => p.peerId !== data.leftPeerId)
        this.isPvpConnected = this.peers.length >= 2
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(data.leftPeerId)
        }
        break
      }

      case 'START_PVP_MATCH': {
        this.moveQueue = []
        if (this.onStartPvpMatch) {
          this.onStartPvpMatch(data.payload)
        }
        break
      }

      case 'PVP_MOVE': {
        const move = data.move as PvpMovePacket
        if (move.phase === 'DONDEN') {
          if (this.onOpponentDonden) {
            this.onOpponentDonden()
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
          this.onChatEmote(data.senderName || '对手', data.text)
        }
        this.speakText(data.text)
        break
      }

      case 'WEBRTC_OFFER': {
        this.handleWebRTCOffer(data.sdp)
        break
      }
      case 'WEBRTC_ANSWER': {
        this.handleWebRTCAnswer(data.sdp)
        break
      }
      case 'WEBRTC_ICE': {
        this.handleWebRTCIce(data.candidate)
        break
      }
    }
  }

  private updateRoleFromPeers(): void {
    this.isPvpConnected = this.peers.length >= 2
    if (this.peers.length > 0) {
      this.isHost = this.peers[0].peerId === this.peerId
    }
  }

  getOpponentPeer(): PvpPeerInfo | null {
    return this.peers.find((p) => p.peerId !== this.peerId) || null
  }

  updateMyMeta(girl: number, bet: number): void {
    this.myGirl = girl
    this.betAmount = bet
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
    })
  }

  requestStartPvpMatch(): void {
    const opp = this.getOpponentPeer()
    const seed = Math.floor(Math.random() * 2000000000) + 1000
    const payload = {
      roomSeed: seed,
      betAmount: this.betAmount,
      hostPeerId: this.peerId,
      hostGirl: this.myGirl,
      guestGirl: opp ? opp.girl : (this.myGirl + 1) % 4,
      hostName: this.myName,
      guestName: opp ? opp.name : '神秘雀友',
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
  // WebRTC P2P Real-time Voice Chat + Audio Ducking (PRD 4.6)
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
    if (this.remoteAudio) {
      this.remoteAudio.muted = !this.speakerEnabled
    }
    return this.speakerEnabled
  }

  private createPeerConnection(): RTCPeerConnection {
    if (this.pc) this.pc.close()
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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
          candidate: ev.candidate,
        })
      }
    }
    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio()
          this.remoteAudio.autoplay = true
        }
        this.remoteAudio.srcObject = ev.streams[0]
        this.remoteAudio.muted = !this.speakerEnabled
        this.remoteAudio.play().catch(() => {})
        this.voiceStatus = '🟢 P2P 语音通话中'
      }
    }
    this.pc = pc
    return pc
  }

  private async startWebRTCOffer(): Promise<void> {
    try {
      const pc = this.createPeerConnection()
      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      this.sendMessage({
        type: 'WEBRTC_OFFER',
        sdp: pc.localDescription,
      })
    } catch {}
  }

  private async handleWebRTCOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.createPeerConnection()
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.sendMessage({
        type: 'WEBRTC_ANSWER',
        sdp: pc.localDescription,
      })
    } catch {}
  }

  private async handleWebRTCAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      if (this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp))
      }
    } catch {}
  }

  private async handleWebRTCIce(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      if (this.pc && candidate) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
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
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
  }
}
