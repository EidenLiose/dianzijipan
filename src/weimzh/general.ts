// 1:1 Port of general.h & general.cpp from weimzh/mahjong
import { CTile, TileSuit } from './tile'
import { msg } from './titles'

export const GIRL_GRAYSTYLE = 0
export const GIRL_COLOR = 1
export const GIRL_FULL = 2

export enum TileDir {
  PLAYER_SHOWN = 0,
  COMPUTER_SHOWN = 1,
  WALL_SHOWN = 2,
  PLAYER_CONCEALED = 100,
  COMPUTER_CONCEALED = 101,
  WALL_CONCEALED = 102,
}

export enum SoundId {
  SND_DISCARD1 = 0,
  SND_DISCARD2 = 1,
  SND_DING = 2,
  SND_BOOM = 3,
  SND_FLASH = 4,
  SND_SOUND1 = 5,
  SND_SOUND2 = 6,
  SND_SOUND3 = 7,
  SND_SOUND4 = 8,
  SND_REACH = 9,
  SND_FIRE = 10,
}

export const TILE_WIDTH = 42
export const TILE_HEIGHT_CONCEALED = 76
export const TILE_HEIGHT_SHOWN = 60
export const TILE_HEIGHT_WALL = 60
export const TILE_HEIGHT_COMPUTER = 70

export class CGeneral {
  public canvas: HTMLCanvasElement
  public ctx: CanvasRenderingContext2D

  public m_imgGirls: HTMLImageElement[][] = Array.from({ length: 4 }, () => [])
  public m_imgGameOver!: HTMLImageElement
  public m_imgElectron!: HTMLImageElement
  public m_imgTiles!: HTMLImageElement
  public m_imgBonusGame!: HTMLImageElement
  public m_imgBonusGameGray!: HTMLImageElement
  public m_imgHand!: HTMLImageElement
  public m_imgFire1!: HTMLImageElement
  public m_imgFire2!: HTMLImageElement
  public m_imgFlash1!: HTMLImageElement
  public m_imgFlash2!: HTMLImageElement

  public m_musBG: HTMLAudioElement[] = []
  public m_musGameOver!: HTMLAudioElement
  public m_musWin!: HTMLAudioElement
  public m_musEndRound!: HTMLAudioElement
  public m_musBGame!: HTMLAudioElement
  public m_snd: string[] = []

  public m_iPrevGirl: number = 0
  public m_iPrevGirlColor: number = 0
  public m_iCurMusic: number = -1
  public currentAudio: HTMLAudioElement | null = null

  public isMusicMuted: boolean = false
  public isSoundMuted: boolean = false
  public isAudioDucked: boolean = false
  private duckTimeout: any = null

  private savedMsgImage: ImageData | null = null
  private keyResolvers: ((key: string) => void)[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!
    this.ctx.imageSmoothingEnabled = true
  }

  setAudioDucking(speaking: boolean): void {
    if (speaking) {
      if (this.duckTimeout) {
        clearTimeout(this.duckTimeout)
        this.duckTimeout = null
      }
      this.isAudioDucked = true
      if (this.currentAudio && !this.isMusicMuted) {
        this.currentAudio.volume = 0.2
      }
    } else {
      if (this.duckTimeout) clearTimeout(this.duckTimeout)
      this.duckTimeout = setTimeout(() => {
        this.isAudioDucked = false
        if (this.currentAudio && !this.isMusicMuted) {
          this.currentAudio.volume = 0.75
        }
      }, 1000)
    }
  }

  async initAssets(): Promise<void> {
    // Load fonts into document.fonts
    try {
      const fontKai = new FontFace('WeimzhKai', 'url(/weimzh/fonts/gkai00mp.ttf)')
      const fontBrush = new FontFace('WeimzhBrush', 'url(/weimzh/fonts/brush.ttf)')
      const [loadedKai, loadedBrush] = await Promise.all([fontKai.load(), fontBrush.load()])
      ;(document.fonts as any).add(loadedKai)
      ;(document.fonts as any).add(loadedBrush)
    } catch (e) {
      console.warn('Font load fallback:', e)
    }

    const loadImg = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })

    for (let i = 0; i < 4; i++) {
      const idx = i + 1
      this.m_imgGirls[i][GIRL_GRAYSTYLE] = await loadImg(`/weimzh/images/mjgirl${idx}a.png`)
      this.m_imgGirls[i][GIRL_COLOR] = await loadImg(`/weimzh/images/mjgirl${idx}b.jpg`)
      this.m_imgGirls[i][GIRL_FULL] = await loadImg(`/weimzh/images/mjgirl${idx}c.jpg`)
    }

    this.m_imgElectron = await loadImg('/weimzh/images/electron.jpg')
    this.m_imgGameOver = await loadImg('/weimzh/images/gameover.jpg')
    this.m_imgTiles = await loadImg('/weimzh/images/tiles.jpg')
    this.m_imgBonusGame = await loadImg('/weimzh/images/bgame.jpg')
    this.m_imgBonusGameGray = await loadImg('/weimzh/images/bgame_gray.png')

    this.m_imgFire1 = await loadImg('/weimzh/images/fire1.png')
    this.m_imgFire2 = await loadImg('/weimzh/images/fire2.png')
    this.m_imgFlash1 = await loadImg('/weimzh/images/flash1.png')
    this.m_imgFlash2 = await loadImg('/weimzh/images/flash2.png')
    this.m_imgHand = await loadImg('/weimzh/images/hand.png')

    const musFiles = [
      '/weimzh/music/music.ogg',
      '/weimzh/music/music1.ogg',
      '/weimzh/music/musicc.ogg',
      '/weimzh/music/musicp.ogg',
      '/weimzh/music/bet.ogg',
      '/weimzh/music/bonus.ogg',
      '/weimzh/music/musicb.ogg',
    ]
    this.m_musBG = musFiles.map((f) => {
      const a = new Audio(f)
      a.loop = true
      return a
    })

    this.m_musGameOver = new Audio('/weimzh/music/gameover.ogg')
    this.m_musWin = new Audio('/weimzh/music/win.ogg')
    this.m_musEndRound = new Audio('/weimzh/music/musice.ogg')
    this.m_musEndRound.loop = true
    this.m_musBGame = new Audio('/weimzh/music/bgame.ogg')

    this.m_snd[SoundId.SND_DISCARD1] = '/weimzh/sound/discard.wav'
    this.m_snd[SoundId.SND_DISCARD2] = '/weimzh/sound/discard2.wav'
    this.m_snd[SoundId.SND_DING] = '/weimzh/sound/ding.wav'
    this.m_snd[SoundId.SND_BOOM] = '/weimzh/sound/boom.wav'
    this.m_snd[SoundId.SND_FLASH] = '/weimzh/sound/flash.wav'
    this.m_snd[SoundId.SND_SOUND1] = '/weimzh/sound/snd1.wav'
    this.m_snd[SoundId.SND_SOUND2] = '/weimzh/sound/snd2.wav'
    this.m_snd[SoundId.SND_SOUND3] = '/weimzh/sound/snd3.wav'
    this.m_snd[SoundId.SND_SOUND4] = '/weimzh/sound/snd4.wav'
    this.m_snd[SoundId.SND_REACH] = '/weimzh/sound/reach.wav'
    this.m_snd[SoundId.SND_FIRE] = '/weimzh/sound/fire.wav'
  }

  pushKey(key: string): void {
    if (this.keyResolvers.length > 0) {
      const r = this.keyResolvers.shift()!
      r(key)
    }
  }

  handleCanvasMouseDown(x: number, y: number, button: number): void {
    if (button === 2) {
      this.pushKey('ArrowRight')
      return
    }
    if (button === 0) {
      if (this.m_iCurMusic === 4) {
        if (y < 240) {
          this.pushKey(x < 320 ? 'a' : 'b')
        } else {
          this.pushKey(x < 320 ? 'c' : 'd')
        }
        return
      }
      if (y > (this.m_iCurMusic === 8 ? 260 : 380)) {
        const idx = Math.floor((x - 20) / TILE_WIDTH)
        if (idx >= 0 && idx <= 12) {
          this.pushKey(String.fromCharCode(97 + idx))
          return
        } else if (idx >= 13) {
          this.pushKey('n')
          return
        }
      }
      this.pushKey('Enter')
    }
  }

  ReadKey(): Promise<string> {
    return new Promise((resolve) => {
      this.keyResolvers.push(resolve)
    })
  }

  async WaitForAnyKey(): Promise<void> {
    await this.ReadKey()
  }

  UTIL_Delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  DrawBG(girlnum: number = 0, color: number = 0): void {
    const bg = girlnum >= 4 ? this.m_imgElectron : this.m_imgGirls[girlnum][color]
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, 640, 480)
    }
    this.m_iPrevGirl = girlnum
    this.m_iPrevGirlColor = color
  }

  async DrawBGFade(girlnum: number = 0, color: number = 0, duration: number = 200): Promise<void> {
    const bg = girlnum >= 4 ? this.m_imgElectron : this.m_imgGirls[girlnum][color]
    await this.ScreenFade(duration, bg)
    this.m_iPrevGirl = girlnum
    this.m_iPrevGirlColor = color
  }

  EraseArea(x: number, y: number, w: number, h: number, girlnum: number = -1, color: number = -1): void {
    if (girlnum < 0 || girlnum > 3) {
      girlnum = this.m_iPrevGirl
      color = this.m_iPrevGirlColor
    }
    const bg = girlnum >= 4 ? this.m_imgElectron : this.m_imgGirls[girlnum]?.[color]
    if (bg && w > 0 && h > 0) {
      this.ctx.drawImage(bg, x, y, w, h, x, y, w, h)
    }
  }

  async ScreenFade(duration: number = 500, targetImg: HTMLImageElement | null = null): Promise<void> {
    const fromData = this.ctx.getImageData(0, 0, 640, 480)
    const off = document.createElement('canvas')
    off.width = 640
    off.height = 480
    const offCtx = off.getContext('2d')!
    if (targetImg) {
      offCtx.drawImage(targetImg, 0, 0, 640, 480)
    } else {
      offCtx.fillStyle = '#000000'
      offCtx.fillRect(0, 0, 640, 480)
    }

    const steps = Math.max(4, Math.floor(duration / 25))
    const stepMs = duration / steps
    const fromCanvas = document.createElement('canvas')
    fromCanvas.width = 640
    fromCanvas.height = 480
    fromCanvas.getContext('2d')!.putImageData(fromData, 0, 0)

    for (let i = 1; i <= steps; i++) {
      const alpha = i / steps
      this.ctx.globalAlpha = 1
      this.ctx.drawImage(fromCanvas, 0, 0)
      this.ctx.globalAlpha = alpha
      this.ctx.drawImage(off, 0, 0)
      this.ctx.globalAlpha = 1
      await this.UTIL_Delay(stepMs)
    }
  }

  DrawGirl(x: number, y: number, w: number, h: number, girlnum: number = 0, color: number = 0): void {
    const bg = this.m_imgGirls[girlnum]?.[color]
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, 640, 480, x, y, w, h)
    }
  }

  DrawText(
    sz: string,
    x: number,
    y: number,
    size: number = 0,
    r: number = 255,
    g: number = 255,
    b: number = 255
  ): void {
    const px = size === 0 ? 24 : size === 1 ? 36 : 72
    this.ctx.font = `bold ${px}px "WeimzhBrush", "Arial Black", sans-serif`
    this.ctx.textBaseline = 'top'
    this.ctx.fillStyle = 'rgb(16, 8, 8)'
    this.ctx.fillText(sz, x + 2, y + 2)
    this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    this.ctx.fillText(sz, x, y)
  }

  DrawUTF8Text(
    sz: string,
    x: number,
    y: number,
    size: number = 0,
    r: number = 255,
    g: number = 255,
    b: number = 255
  ): void {
    const px = size === 0 ? 24 : size === 1 ? 36 : 72
    this.ctx.font = `bold ${px}px "WeimzhKai", "KaiTi", "STKaiti", serif`
    this.ctx.textBaseline = 'top'
    this.ctx.fillStyle = 'rgb(16, 8, 8)'
    this.ctx.fillText(sz, x + 2, y + 2)
    this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    this.ctx.fillText(sz, x, y)
  }

  DrawMessage(sz: string | null): void {
    if (sz === null) {
      if (this.savedMsgImage) {
        this.ctx.putImageData(this.savedMsgImage, 150, 300)
        this.savedMsgImage = null
      }
      return
    }
    if (!this.savedMsgImage) {
      this.savedMsgImage = this.ctx.getImageData(150, 300, 340, 60)
    }
    this.ctx.fillStyle = 'rgb(100, 100, 100)'
    this.ctx.fillRect(150, 300, 340, 60)
    this.ctx.fillStyle = 'rgb(20, 100, 190)'
    this.ctx.fillRect(155, 305, 330, 50)

    const lines = sz.split('\n')
    if (lines.length === 1) {
      this.DrawUTF8Text(lines[0], 160, 317)
    } else {
      this.DrawUTF8Text(lines[0], 160, 305)
      this.DrawUTF8Text(lines[1], 160, 331)
    }
    this.PlaySound(SoundId.SND_DING)
  }

  DrawTile(t: CTile | null, x: number, y: number, dir: number = TileDir.PLAYER_SHOWN, size: number = 1): void {
    let sx = 0
    let sy = 0
    let sw = TILE_WIDTH
    let sh = TILE_HEIGHT_SHOWN

    if (dir <= TileDir.PLAYER_CONCEALED && t) {
      sw = TILE_WIDTH
      sh = dir < TileDir.PLAYER_CONCEALED ? TILE_HEIGHT_SHOWN : TILE_HEIGHT_CONCEALED
      if (t.GetSuit() === TileSuit.TILESUIT_DRAGON) {
        sx = (t.index2() + 4) * TILE_WIDTH
        sy = 3 * sh
      } else {
        sx = t.index2() * TILE_WIDTH
        sy = t.index1() * sh
      }
      if (dir < TileDir.PLAYER_CONCEALED) {
        sy += TILE_HEIGHT_CONCEALED * 4
      }
    } else if (dir === TileDir.COMPUTER_CONCEALED) {
      sx = 0
      sy = TILE_HEIGHT_SHOWN * 4 + TILE_HEIGHT_CONCEALED * 4
      sw = TILE_WIDTH
      sh = TILE_HEIGHT_COMPUTER
    } else if (dir === TileDir.WALL_CONCEALED) {
      sx = TILE_WIDTH
      sy = TILE_HEIGHT_SHOWN * 4 + TILE_HEIGHT_CONCEALED * 4
      sw = TILE_WIDTH
      sh = TILE_HEIGHT_WALL
    }

    const dw = size >= 1 ? sw : Math.floor((sw * 7) / 10)
    const dh = size >= 1 ? sh : Math.floor((sh * 7) / 10)
    this.ctx.drawImage(this.m_imgTiles, sx, sy, sw, sh, x, y, dw, dh)
  }

  DrawTiles(
    t: CTile[] | null,
    num: number,
    x: number,
    y: number,
    dir: number = TileDir.PLAYER_SHOWN,
    size: number = 1
  ): void {
    const step = TILE_WIDTH * (size ? 1 : 0.7)
    if (dir === TileDir.COMPUTER_SHOWN && t) {
      for (let i = num - 1; i >= 0; i--) {
        this.DrawTile(t[i], Math.floor(x + (num - i - 1) * step), y, dir, size)
      }
    } else {
      for (let i = 0; i < num; i++) {
        this.DrawTile(t ? t[i] : null, Math.floor(x + i * step), y, dir, size)
      }
    }
  }

  TintReachTile(x: number, y: number): void {
    const imgData = this.ctx.getImageData(x, y, TILE_WIDTH, TILE_HEIGHT_SHOWN)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      d[i + 1] = Math.min(255, d[i + 1] + 35)
    }
    this.ctx.putImageData(imgData, x, y)
  }

  async DrawDotBar(x: number, y: number, anim: boolean = false): Promise<void> {
    if (anim) {
      for (let i = 1; i <= 20; i++) {
        const dy = y + Math.floor(((20 - i) * 85) / 40)
        const sy = 531 + Math.floor(((20 - i) * 85) / 40)
        const h = Math.floor((i * 85) / 20)
        if (h > 0) {
          this.ctx.drawImage(this.m_imgTiles, 359, sy, 20, h, x, dy, 20, h)
        }
        await this.UTIL_Delay(10)
      }
    }
    this.ctx.drawImage(this.m_imgTiles, 359, 531, 20, 85, x, y, 20, 85)
  }

  DrawTurn(turn: number, x: number, y: number): void {
    const sx = TILE_WIDTH * 2 + (turn === 0 ? 0 : TILE_WIDTH)
    const sy = TILE_HEIGHT_SHOWN * 4 + TILE_HEIGHT_CONCEALED * 4
    this.ctx.drawImage(this.m_imgTiles, sx, sy, 26, 53, x, y, 26, 53)
  }

  UpdateScreen(_x: number = 0, _y: number = 0, _w: number = 0, _h: number = 0): void {
    // Immediate canvas 2D context updates automatically
  }

  private stopCurrentMusic(): void {
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.currentTime = 0
      this.currentAudio = null
    }
  }

  PlayMusic(m: HTMLAudioElement | null, loop: boolean = true): void {
    this.stopCurrentMusic()
    if (this.isMusicMuted || !m) return
    m.loop = loop
    m.volume = this.isAudioDucked ? 0.2 : 0.75
    this.currentAudio = m
    m.play().catch(() => {})
  }

  PlayBGMusic(num: number): void {
    this.m_iCurMusic = num
    if (num < 0 || num > 6) {
      this.PlayMusic(null)
      return
    }
    this.PlayMusic(this.m_musBG[num], true)
  }

  PlayWinMusic(): void {
    this.PlayMusic(this.m_musWin, false)
  }

  PlayEndRoundMusic(): void {
    this.m_iCurMusic = 8
    this.PlayMusic(this.m_musEndRound, true)
  }

  PlaySound(num: SoundId): void {
    if (this.isSoundMuted) return
    const src = this.m_snd[num]
    if (!src) return
    const a = new Audio(src)
    a.volume = 0.9
    a.play().catch(() => {})
  }

  async Fire(): Promise<void> {
    const save = this.ctx.getImageData(5, 470 - 130, 575, 130)
    await this.UTIL_Delay(400)
    this.PlaySound(SoundId.SND_FIRE)

    for (let i = 0; i < 6; i++) {
      this.ctx.putImageData(save, 5, 470 - 130)
      this.ctx.drawImage(this.m_imgFire1, 5, 470 - 125)
      await this.UTIL_Delay(100)

      this.ctx.putImageData(save, 5, 470 - 130)
      this.ctx.drawImage(this.m_imgFire2, 5, 470 - 130)
      await this.UTIL_Delay(100)
    }
    this.ctx.putImageData(save, 5, 470 - 130)
    await this.UTIL_Delay(100)
  }

  async AnimSelfDrawn(t: CTile): Promise<void> {
    this.EraseArea(20, 265, TILE_WIDTH * 10, 303 + TILE_HEIGHT_SHOWN - 265)
    this.PlaySound(SoundId.SND_FLASH)
    for (let i = 0; i < 12; i++) {
      this.EraseArea(20, 235, TILE_WIDTH * 10, 303 + TILE_HEIGHT_SHOWN - 235)
      this.ctx.drawImage(this.m_imgFlash1, 245, 235)
      this.DrawTile(t, 280, 255)
      await this.UTIL_Delay(50)

      this.EraseArea(20, 235, TILE_WIDTH * 10, 303 + TILE_HEIGHT_SHOWN - 235)
      this.ctx.drawImage(this.m_imgFlash2, 245, 235)
      this.DrawTile(t, 280, 255)
      await this.UTIL_Delay(50)
    }
    await this.UTIL_Delay(20)
    this.EraseArea(20, 235, TILE_WIDTH * 10, 303 + TILE_HEIGHT_SHOWN - 235)
    this.ctx.drawImage(this.m_imgFlash1, 245, 235)
    this.DrawTile(t, 280, 255)
    this.DrawUTF8Text(msg('out_selfdrawn'), 215, 265, 2, 255, 255, 255)
    await this.UTIL_Delay(1000)
    this.EraseArea(20, 205, TILE_WIDTH * 10, 303 + TILE_HEIGHT_SHOWN - 205)
  }

  async AnimOut(t: CTile): Promise<void> {
    this.EraseArea(620 - 10 * TILE_WIDTH, 94, TILE_WIDTH * 10, 132 + TILE_HEIGHT_SHOWN - 94)
    const save = this.ctx.getImageData(218, 125, this.m_imgHand.width, this.m_imgHand.height)
    this.ctx.drawImage(this.m_imgHand, 218, 125)
    this.PlaySound(SoundId.SND_FLASH)

    for (let i = 0; i < 10; i++) {
      this.EraseArea(620 - 10 * TILE_WIDTH, 94, TILE_WIDTH * 10, 132 + TILE_HEIGHT_SHOWN - 94)
      this.EraseArea(245, 94, this.m_imgFlash2.width, this.m_imgFlash2.height)
      this.ctx.drawImage(this.m_imgFlash1, 245, 94)
      this.DrawTile(t, 280, 104)
      this.ctx.drawImage(this.m_imgHand, 218, 125)
      await this.UTIL_Delay(50)

      this.EraseArea(620 - 10 * TILE_WIDTH, 94, TILE_WIDTH * 10, 132 + TILE_HEIGHT_SHOWN - 94)
      this.EraseArea(245, 94, this.m_imgFlash2.width, this.m_imgFlash2.height)
      this.ctx.drawImage(this.m_imgFlash2, 245, 94)
      this.DrawTile(t, 280, 104)
      this.ctx.drawImage(this.m_imgHand, 218, 125)
      await this.UTIL_Delay(50)
    }

    await this.UTIL_Delay(120)
    this.DrawUTF8Text(msg('out_discard'), 215, 114, 2, 255, 255, 255)
    await this.UTIL_Delay(1000)
    this.EraseArea(620 - 10 * TILE_WIDTH, 94, TILE_WIDTH * 10, 132 + TILE_HEIGHT_SHOWN - 94)
    this.EraseArea(245, 94, this.m_imgFlash2.width, this.m_imgFlash2.height)
    this.ctx.putImageData(save, 218, 125)
  }

  async BonusGame(): Promise<void> {
    const chars = ['配', '牌', '出', '血']
    this.ctx.drawImage(this.m_imgBonusGame, 0, 0, 640, 480)
    this.PlayMusic(this.m_musBGame, false)
    await this.UTIL_Delay(4500)

    this.ctx.drawImage(this.m_imgBonusGameGray, 0, 0, 640, 480)
    for (let i = 0; i < 4; i++) {
      this.DrawUTF8Text(chars[i], 150 + i * 100, 100, 2, 255, 255, 0)
      this.PlaySound(SoundId.SND_SOUND1)
      await this.UTIL_Delay(1100)
    }
    this.DrawUTF8Text('奖励游戏', 175, 200, 2, 0, 255, 255)
    this.PlaySound(SoundId.SND_DISCARD2)
    await this.UTIL_Delay(2200)
    await this.ScreenFade(400)
  }

  async GameOver(): Promise<void> {
    let iCurSel = 0
    this.ctx.drawImage(this.m_imgGameOver, 0, 0, 640, 480)
    this.DrawText('GAME OVER', 22, 22, 1, 255, 255, 0)
    this.DrawUTF8Text(`${msg('Continue')}?`, 400, 300, 1, 255, 255, 0)
    this.DrawUTF8Text(msg('Yes'), 450, 350, 1, 255, 255, 0)
    this.DrawUTF8Text(msg('No'), 450, 390, 1, 255, 255, 0)
    this.PlayMusic(this.m_musGameOver, false)

    while (true) {
      this.ctx.drawImage(this.m_imgGameOver, 400, 350, 32, 80, 400, 350, 32, 80)
      this.DrawText('>', 400, iCurSel ? 390 : 350, 1, 255, 255, 0)

      const key = await this.ReadKey()
      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        iCurSel ^= 1
      } else if (key.toLowerCase() === 'y' || key === 'Enter' || key === ' ') {
        this.PlayMusic(null)
        this.PlaySound(SoundId.SND_SOUND1)
        await this.UTIL_Delay(1200)
        await this.ScreenFade(300)
        return
      }
    }
  }
}
