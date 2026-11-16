// SoundManager: High-fidelity Arcade Audio Engine for Mahjong Denshi Kiban
export class SoundManager {
  private static instance: SoundManager
  private audioCtx: AudioContext | null = null
  private buffers: Map<string, AudioBuffer> = new Map()
  private bgmGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private bgmSource: AudioBufferSourceNode | null = null
  public isMuted: boolean = false
  public isBgmEnabled: boolean = true
  private discardIdx: number = 0

  private constructor() {}

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager()
    }
    return SoundManager.instance
  }

  init() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioCtx = new AudioCtxClass()
      this.bgmGain = this.audioCtx.createGain()
      this.sfxGain = this.audioCtx.createGain()
      
      this.bgmGain.gain.value = 0.45 // balanced BGM level
      this.sfxGain.gain.value = 0.85 // punchy SFX level

      this.bgmGain.connect(this.audioCtx.destination)
      this.sfxGain.connect(this.audioCtx.destination)
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
    }
  }

  private async loadBuffer(path: string): Promise<AudioBuffer | null> {
    this.init()
    if (!this.audioCtx) return null
    if (this.buffers.has(path)) {
      return this.buffers.get(path)!
    }
    try {
      const resp = await fetch(path)
      if (!resp.ok) return null
      const arrayBuf = await resp.arrayBuffer()
      const decoded = await this.audioCtx.decodeAudioData(arrayBuf)
      this.buffers.set(path, decoded)
      return decoded
    } catch (e) {
      console.warn(`Failed to decode audio: ${path}`, e)
      return null
    }
  }

  // Preload core sound effects
  async preloadAll() {
    this.init()
    const coreFiles = [
      '/assets/audio/tile_discard_1.wav',
      '/assets/audio/tile_discard_2.wav',
      '/assets/audio/tile_discard_3.wav',
      '/assets/audio/tile_select.wav',
      '/assets/audio/sfx_coin.wav',
      '/assets/audio/sfx_bet.wav',
      '/assets/audio/sfx_donden.wav',
      '/assets/audio/sfx_thunder.wav',
      '/assets/audio/sfx_fanfare.wav',
      '/assets/audio/sfx_timer_tick.wav',
      '/assets/audio/bgm_denshi_kiban.wav'
    ]
    for (const f of coreFiles) {
      this.loadBuffer(f).catch(() => {})
    }
  }

  // Play a one-shot sound effect
  async playSfx(path: string, volumeScale: number = 1.0) {
    if (this.isMuted) return
    this.init()
    const buf = await this.loadBuffer(path)
    if (!buf || !this.audioCtx || !this.sfxGain) return

    const source = this.audioCtx.createBufferSource()
    source.buffer = buf

    if (volumeScale !== 1.0) {
      const g = this.audioCtx.createGain()
      g.gain.value = volumeScale
      source.connect(g)
      g.connect(this.sfxGain)
    } else {
      source.connect(this.sfxGain)
    }
    source.start()
  }

  // 1. Play Authentic Mahjong Tile Discard ("啪！" crisp physical slap)
  playTileDiscard() {
    this.discardIdx = (this.discardIdx % 3) + 1
    this.playSfx(`/assets/audio/tile_discard_${this.discardIdx}.wav`, 1.0)
  }

  // 2. Play Subtle Tile Touch/Select Click
  playTileSelect() {
    this.playSfx('/assets/audio/tile_select.wav', 0.6)
  }

  // 3. Play Coin Insert ("叮铃！")
  playCoin() {
    this.playSfx('/assets/audio/sfx_coin.wav', 0.9)
  }

  // 4. Play Bet Button Click ("嘟！")
  playBet() {
    this.playSfx('/assets/audio/sfx_bet.wav', 0.8)
  }

  // 5. Play Donden Exchange Zap
  playDonden() {
    this.playSfx('/assets/audio/sfx_donden.wav', 1.0)
  }

  // 6. Play Reach Voice & Alert
  playReach() {
    this.duckBgm(true)
    this.playSfx('/assets/audio/sample_41.wav', 1.0)
    setTimeout(() => this.duckBgm(false), 900)
  }

  // 7. Play Ron / Tsumo Strike + Thunder + Fanfare
  playWinningFanfare(isTsumo: boolean = false) {
    this.duckBgm(true)
    // Thunder & electric shock
    this.playSfx('/assets/audio/sfx_thunder.wav', 0.9)
    // Voice call
    const voiceSample = isTsumo ? '/assets/audio/sample_40.wav' : '/assets/audio/sample_39.wav'
    setTimeout(() => {
      this.playSfx(voiceSample, 1.0)
    }, 150)
    // Victory fanfare chords
    setTimeout(() => {
      this.playSfx('/assets/audio/sfx_fanfare.wav', 0.95)
    }, 500)
    setTimeout(() => this.duckBgm(false), 3800)
  }

  // 8. Play Timer Countdown Warning Tick
  playTimerTick() {
    this.playSfx('/assets/audio/sfx_timer_tick.wav', 0.7)
  }

  // --- Background Music (BGM) Engine ---
  async startBgm() {
    if (!this.isBgmEnabled || this.isMuted) return
    this.init()
    if (!this.audioCtx || !this.bgmGain) return
    if (this.bgmSource) {
      return // already playing
    }

    const buf = await this.loadBuffer('/assets/audio/bgm_denshi_kiban.wav')
    if (!buf || !this.audioCtx || !this.bgmGain) return

    this.bgmSource = this.audioCtx.createBufferSource()
    this.bgmSource.buffer = buf
    this.bgmSource.loop = true
    this.bgmSource.connect(this.bgmGain)
    this.bgmSource.start()
  }

  stopBgm() {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop()
        this.bgmSource.disconnect()
      } catch {}
      this.bgmSource = null
    }
  }

  toggleBgm(): boolean {
    this.isBgmEnabled = !this.isBgmEnabled
    if (this.isBgmEnabled) {
      this.startBgm()
    } else {
      this.stopBgm()
    }
    return this.isBgmEnabled
  }

  // Audio Ducking: lowers BGM volume during voice calls / fanfare
  duckBgm(duck: boolean) {
    if (!this.bgmGain || !this.audioCtx) return
    const now = this.audioCtx.currentTime
    const target = duck ? 0.12 : 0.45
    this.bgmGain.gain.cancelScheduledValues(now)
    this.bgmGain.gain.linearRampToValueAtTime(target, now + 0.12)
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted
    if (this.isMuted) {
      this.stopBgm()
    } else if (this.isBgmEnabled) {
      this.startBgm()
    }
    return this.isMuted
  }

  // Play legacy sample indices if needed
  async playSample(sampleIndex: number) {
    const pad = sampleIndex.toString().padStart(2, '0')
    this.playSfx(`/assets/audio/sample_${pad}.wav`, 0.85)
  }
}
