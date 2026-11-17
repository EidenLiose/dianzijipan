// 1:1 Port of player.h, player.cpp, bot.h, bot.cpp, game.h, game.cpp from weimzh/mahjong
import { CTile, TileSuit } from './tile'
import { CHand, handtile_flags, chow_location, MAX_HANDTILE } from './hand'
import { CGeneral, TileDir, SoundId, TILE_WIDTH, TILE_HEIGHT_CONCEALED, TILE_HEIGHT_SHOWN, TILE_HEIGHT_WALL } from './general'
import { msg, RandomLong, setGameSeed } from './titles'
import { PvpManager, type PvpMovePacket, type SeatPlayerInfo, type StartMatchPayload } from './pvpManager'

export enum discarded_flags {
  DT_NULL = 0,
  DT_REACH = 1 << 0,
  DT_OPPONENTREACH = 1 << 1,
}

export enum playerstate_flags {
  PS_KONGED = 1 << 0,
  PS_ASKED = 1 << 1,
  PS_CALLREACH = 1 << 2,
  PS_NOTDISCARDED = 1 << 3,
}

export enum playeraction {
  PA_NONE = 0,
  PA_DRAW = 1,
  PA_DISCARD = 2,
  PA_MAHJONG = 3,
  PA_PUNG = 4,
  PA_CHOW = 5,
  PA_KONG = 6,
  PA_REACH = 7,
  PA_COUNT = 8,
}

export enum actionstate {
  AS_DRAW = 0,
  AS_DISCARD = 1,
}

export const MAX_DISCARDED = 20

export enum scorelevel {
  SL_ONEHAN = 0,
  SL_TWOHAN = 1,
  SL_THREEHAN = 2,
  SL_FOURHAN = 3,
  SL_MANGAN = 4,
  SL_HANEMAN = 5,
  SL_BAIMAN = 6,
  SL_SANBAIMAN = 7,
  SL_YAKUMAN = 8,
}

export const TURN_EAST = 0
export const TURN_SOUTH = 1

export interface discarded_t {
  tile: CTile
  flags: number
}

export interface result_t {
  concealed: boolean
  selfdrawn: boolean
  score: number
  level: number
  fu: number

  tenhou: number
  renhou: number
  chihou: number
  tuisou: number
  chinraotou: number
  ryuisou: number
  daisangen: number
  daisusi: number
  syosusi: number
  suankou: number
  surenkou: number
  kokusi: number
  cyurenpotou: number
  sukantu: number

  reach: number
  pinfu: number
  ippatu: number
  double_reach: number
  tanyao: number
  tumo: number
  ryanpeikou: number
  iipeikou: number
  sansiki: number
  sansiki_doukoku: number
  toitoi: number
  sanankou: number
  sanrenkou: number
  junchan: number
  chanta: number
  ittu: number
  chinitu: number
  honitu: number
  chitoitu: number
  honraotou: number
  syosangen: number
  haitei: number
  houtei: number
  rinshan: number
  fanpai: number
  dora: number
  sankantu: number
  nofan: number
}

function emptyResult(): result_t {
  return {
    concealed: false,
    selfdrawn: false,
    score: 0,
    level: 0,
    fu: 0,
    tenhou: 0, renhou: 0, chihou: 0, tuisou: 0, chinraotou: 0, ryuisou: 0,
    daisangen: 0, daisusi: 0, syosusi: 0, suankou: 0, surenkou: 0, kokusi: 0,
    cyurenpotou: 0, sukantu: 0,
    reach: 0, pinfu: 0, ippatu: 0, double_reach: 0, tanyao: 0, tumo: 0,
    ryanpeikou: 0, iipeikou: 0, sansiki: 0, sansiki_doukoku: 0, toitoi: 0,
    sanankou: 0, sanrenkou: 0, junchan: 0, chanta: 0, ittu: 0, chinitu: 0,
    honitu: 0, chitoitu: 0, honraotou: 0, syosangen: 0, haitei: 0, houtei: 0,
    rinshan: 0, fanpai: 0, dora: 0, sankantu: 0, nofan: 0,
  }
}

export abstract class CBasePlayer {
  public m_Hand: CHand = new CHand()
  public m_iState: number = 0
  public m_Discarded: discarded_t[] = Array.from({ length: MAX_DISCARDED }, () => ({ tile: new CTile(), flags: 0 }))
  public m_iNumDiscarded: number = 0
  public m_Result: result_t = emptyResult()
  public m_fReach: boolean = false
  public m_pOpponent!: CBasePlayer
  public m_iTurn: number = TURN_EAST
  public m_iScore: number = 0
  public m_fTuiDaoHu: boolean = false
  public gpGeneral: CGeneral
  public gpGame: CGame

  constructor(general: CGeneral, game: CGame) {
    this.gpGeneral = general
    this.gpGame = game
  }

  abstract IsBot(): boolean
  abstract DrawHand(shown?: boolean): void
  abstract DrawDiscarded(): void
  abstract Action(state: actionstate): Promise<playeraction>

  async FirstChance(): Promise<void> {}
  async LastChance(): Promise<boolean> { return false }

  HasDiscarded(t: CTile): boolean {
    for (let i = 0; i < this.m_iNumDiscarded; i++) {
      if (this.m_Discarded[i].tile.equals(t)) return true
    }
    return false
  }

  LastDiscardedTile(): CTile {
    if (this.m_iNumDiscarded <= 0) return new CTile(0)
    return this.m_Discarded[this.m_iNumDiscarded - 1].tile.clone()
  }

  NewRound(): void {
    this.m_iNumDiscarded = 0
    this.m_Hand.NewHand()
    this.m_fReach = false
    this.m_iState = playerstate_flags.PS_NOTDISCARDED
    this.m_Result = emptyResult()
  }

  GetHand(): void {
    this.m_Hand.NewHand()
    for (let i = 0; i < 13; i++) {
      this.m_Hand.AddRandomTile(0)
    }
  }

  GetBonusHand(): void {
    let count = 0
    let num = RandomLong(9, 12)
    const t: CTile[] = Array.from({ length: 13 }, () => new CTile())
    const maj = ['1C', '9C', '1B', '9B', '1D', '9D', 'EW', 'SW', 'WW', 'NW', 'WD', 'GD', 'RD'].map((c) => new CTile(c))
    const wind = ['EW', 'SW', 'WW', 'NW'].map((c) => new CTile(c))
    const elem = ['RD', 'GD', 'WD'].map((c) => new CTile(c))

    const kind = RandomLong(1, 7)
    switch (kind) {
      case 1: {
        t[0] = CTile.RandomTile()
        count = 1
        const suit = t[0].GetSuit()
        for (let i = 0; i < num; i++) {
          const v = RandomLong(1, 9)
          const tmp = new CTile(suit | v)
          if (CTile.FetchTile(tmp)) t[count++] = tmp
        }
        break
      }
      case 2:
        while (count < num) {
          const tmp = maj[RandomLong(0, 12)]
          const c = RandomLong(1, 100) > 75 ? 2 : 3
          for (let j = 0; j < c; j++) {
            if (CTile.RemainingTile(tmp) > 1) {
              CTile.FetchTile(tmp)
              t[count++] = tmp.clone()
            }
            if (count >= num) break
          }
        }
        break
      case 3:
        while (count < num) {
          const tmp = maj[RandomLong(0, 5)]
          const c = RandomLong(1, 100) > 75 ? 2 : 3
          for (let j = 0; j < c; j++) {
            if (CTile.RemainingTile(tmp) > 1) {
              CTile.FetchTile(tmp)
              t[count++] = tmp.clone()
            }
            if (count >= num) break
          }
        }
        break
      case 4:
        for (let i = 0; i < num; i++) {
          if (RandomLong(0, 100) > 90) continue
          if (CTile.FetchTile(maj[i])) t[count++] = maj[i].clone()
        }
        break
      case 5:
        for (let i = 0; i < 12; i++) {
          if (RandomLong(0, 100) > 90) continue
          const w = wind[Math.floor(i / 3)]
          if (CTile.FetchTile(w)) t[count++] = w.clone()
        }
        break
      case 6:
        for (let i = 0; i < 9; i++) {
          if (RandomLong(0, 100) > 80) continue
          const el = elem[Math.floor(i / 3)]
          if (CTile.FetchTile(el)) t[count++] = el.clone()
        }
        break
      case 7: {
        const suit = TileSuit.TILESUIT_CHAR << RandomLong(0, 2)
        for (let i = 0; i < 13; i++) {
          if (RandomLong(0, 100) > 90) continue
          const v = i < 3 ? 1 : i > 9 ? 9 : i - 1
          const tmp = new CTile(suit | v)
          if (CTile.FetchTile(tmp)) t[count++] = tmp
        }
        break
      }
    }

    for (let i = count; i < 13; i++) {
      t[i] = CTile.RandomTile()
    }
    for (let i = 0; i < 13; i++) {
      const b = RandomLong(0, 12)
      const tmp = t[i]
      t[i] = t[b]
      t[b] = tmp
    }
    this.m_Hand.NewHand()
    for (let i = 0; i < 13; i++) {
      this.m_Hand.AddTile(t[i], 0)
    }
  }

  HasYakuman(): boolean {
    const r = this.m_Result
    return Boolean(
      r.tenhou || r.renhou || r.chihou || r.tuisou || r.chinraotou ||
      r.ryuisou || r.daisangen || r.daisusi || r.syosusi || r.suankou ||
      r.surenkou || r.kokusi || r.cyurenpotou || r.sukantu
    )
  }

  HasFan(): number {
    if (this.HasYakuman()) return 13
    const r = this.m_Result
    const concealed = this.m_Hand.IsConcealed()
    let fan = 0
    fan += r.reach
    fan += r.pinfu
    fan += r.ippatu
    fan += r.double_reach
    fan += r.tanyao
    fan += r.tumo
    fan += r.ryanpeikou * 3
    fan += r.iipeikou
    fan += r.sansiki * (concealed ? 2 : 1)
    fan += r.sansiki_doukoku * 2
    fan += r.toitoi * 2
    fan += r.sanankou * 2
    fan += r.sanrenkou * 2
    fan += r.junchan * (concealed ? 3 : 2)
    fan += r.chanta * (concealed ? 2 : 1)
    fan += r.ittu * (concealed ? 2 : 1)
    fan += r.chinitu * (concealed ? 6 : 5)
    fan += r.honitu * (concealed ? 3 : 2)
    fan += r.chitoitu * 2
    fan += r.honraotou * 2
    fan += r.syosangen * 2
    fan += r.haitei
    fan += r.houtei
    fan += r.rinshan
    fan += r.fanpai
    fan += r.dora
    fan += r.sankantu * 2
    fan += r.nofan
    return fan
  }

  CalcResult(): void {
    this.m_Result = emptyResult()
    this.m_Result.concealed = this.m_Hand.IsConcealed()
    this.CalcFu()

    this.CalcResult_tenhou()
    this.CalcResult_renhou()
    this.CalcResult_tuisou()
    this.CalcResult_chinraotou()
    this.CalcResult_ryuisou()
    this.CalcResult_daisangen()
    this.CalcResult_daisusi()
    this.CalcResult_suankou()
    this.CalcResult_surenkou()
    this.CalcResult_kokusi()
    this.CalcResult_cyurenpotou()
    this.CalcResult_sukantu()
    this.CalcResult_chitoitu()

    if (!this.HasYakuman()) {
      this.CalcResult_reach()
      this.CalcResult_ippatu()
      this.CalcResult_double_reach()
      this.CalcResult_tanyao()
      this.CalcResult_ryanpeikou()
      this.CalcResult_sansiki()
      this.CalcResult_sansiki_doukoku()
      this.CalcResult_toitoi()
      this.CalcResult_honraotou()
      this.CalcResult_junchan()
      this.CalcResult_ittu()
      this.CalcResult_chinitu()
      this.CalcResult_honitu()
      this.CalcResult_haitei()
      this.CalcResult_rinshan()
      this.CalcResult_fanpai()
      this.CalcResult_dora()
    }

    this.CalcScore()
  }

  private CalcResult_tenhou(): void {
    if ((this.m_iState & playerstate_flags.PS_NOTDISCARDED) && this.m_iTurn === TURN_EAST) {
      this.m_Result.tenhou = 1
    }
  }

  private CalcResult_renhou(): void {
    if ((this.m_iState & playerstate_flags.PS_NOTDISCARDED) && this.m_iTurn !== TURN_EAST) {
      if (this.m_Result.selfdrawn) {
        this.m_Result.chihou = 1
        return
      }
      this.m_Result.renhou = 1
    }
  }

  private CalcResult_tuisou(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (!(this.m_Hand.m_Tiles[i].tile.GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON))) return
    }
    this.m_Result.tuisou = 1
  }

  private CalcResult_chinraotou(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (!this.m_Hand.m_Tiles[i].tile.IsNumMajor()) return
    }
    this.m_Result.chinraotou = 1
  }

  private CalcResult_ryuisou(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      const t = this.m_Hand.m_Tiles[i].tile
      if (t.equals('GD')) continue
      if (t.GetSuit() !== TileSuit.TILESUIT_BAMBOO) return
      const v = t.GetValue()
      if (v !== 2 && v !== 3 && v !== 4 && v !== 6 && v !== 8) return
    }
    this.m_Result.ryuisou = 1
  }

  private CalcResult_daisangen(): void {
    const a = [0, 0, 0]
    let pair = false
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].first.GetSuit() === TileSuit.TILESUIT_DRAGON) {
        if (this.m_Hand.m_TileSets[i].type & handtile_flags.HT_PAIR) {
          if (pair) return
          pair = true
        }
        a[this.m_Hand.m_TileSets[i].first.GetValue() - 1]++
      }
    }
    if (a[0] && a[1] && a[2]) {
      if (!pair) this.m_Result.daisangen = 1
      else this.m_Result.syosangen = 1
    }
  }

  private CalcResult_daisusi(): void {
    const a = [0, 0, 0, 0]
    let pair = false
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].first.GetSuit() === TileSuit.TILESUIT_WIND) {
        if (this.m_Hand.m_TileSets[i].type & handtile_flags.HT_PAIR) {
          if (pair) return
          pair = true
        }
        a[this.m_Hand.m_TileSets[i].first.GetValue() - 1]++
      }
    }
    if (a[0] && a[1] && a[2] && a[3]) {
      if (!pair) this.m_Result.daisusi = 1
      else this.m_Result.syosusi = 1
    }
  }

  private CalcResult_suankou(): void {
    let count = 0
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_CLOSEDKONG | handtile_flags.HT_CLOSEDPUNG)) {
        count++
      }
    }
    if (count >= 4) this.m_Result.suankou = 1
    else if (count >= 3) this.m_Result.sanankou = 1
  }

  private CalcResult_surenkou(): void {
    const pflags =
      handtile_flags.HT_CLOSEDKONG |
      handtile_flags.HT_CLOSEDPUNG |
      handtile_flags.HT_OPENKONG |
      handtile_flags.HT_OPENPUNG
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & pflags) {
        const a = [0, 0, 0]
        const t1 = this.m_Hand.m_TileSets[i].first
        if (t1.GetValue() >= 7 || (t1.GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON))) continue
        for (let j = 0; j < this.m_Hand.m_iNumTileSets; j++) {
          if (this.m_Hand.m_TileSets[j].type & pflags) {
            const t2 = this.m_Hand.m_TileSets[j].first
            if (t1.GetSuit() !== t2.GetSuit()) continue
            const d = t2.GetValue() - t1.GetValue()
            if (d < 1 || d > 3) continue
            a[d - 1]++
          }
        }
        if (a[0] && a[1] && a[2]) {
          this.m_Result.surenkou = 1
          return
        } else if (a[0] && a[1]) {
          this.m_Result.sanrenkou = 1
          return
        }
      }
    }
  }

  private CalcResult_kokusi(): void {
    if (this.m_Hand.m_Tiles[0].flags & handtile_flags.HT_THIRTEENWONDERS) {
      this.m_Result.kokusi = 1
      for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
        if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) {
          this.m_Result.selfdrawn = true
        }
      }
    }
  }

  private CalcResult_cyurenpotou(): void {
    if (!this.m_Result.concealed) return
    const count = Array(9).fill(0)
    const suit = this.m_Hand.m_Tiles[0].tile.GetSuit()
    if (suit & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) return
    let b = false
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].tile.GetSuit() !== suit) return
      count[this.m_Hand.m_Tiles[i].tile.GetValue() - 1]++
    }
    for (let i = 0; i < 9; i++) {
      const s = i === 0 || i === 8 ? 3 : 1
      if (count[i] === s + 1) {
        if (b) return
        b = true
      } else if (count[i] !== s) {
        return
      }
    }
    this.m_Result.cyurenpotou = 1
  }

  private CalcResult_sukantu(): void {
    let count = 0
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_OPENKONG | handtile_flags.HT_CLOSEDKONG)) count++
    }
    if (count >= 4) this.m_Result.sukantu = 1
    else if (count >= 3) this.m_Result.sankantu = 1
  }

  private CalcResult_reach(): void {
    if (this.m_fReach) this.m_Result.reach = 1
  }

  private CalcResult_ippatu(): void {
    if (
      (this.m_iState & playerstate_flags.PS_CALLREACH) &&
      this.m_iNumDiscarded > 0 &&
      (this.m_Discarded[this.m_iNumDiscarded - 1].flags & discarded_flags.DT_REACH)
    ) {
      this.m_Result.ippatu = 1
    }
  }

  private CalcResult_double_reach(): void {
    if (this.m_fReach && this.m_iNumDiscarded > 0 && (this.m_Discarded[0].flags & discarded_flags.DT_REACH)) {
      this.m_Result.double_reach = 1
    }
  }

  private CalcResult_tanyao(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].tile.IsMajor()) return
    }
    this.m_Result.tanyao = 1
  }

  private CalcResult_ryanpeikou(): void {
    if (!this.m_Result.concealed) return
    let count = 0
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_CLOSEDCHOW | handtile_flags.HT_OPENCHOW)) {
        for (let j = i + 1; j < this.m_Hand.m_iNumTileSets; j++) {
          if (this.m_Hand.m_TileSets[j].type & (handtile_flags.HT_CLOSEDCHOW | handtile_flags.HT_OPENCHOW)) {
            if (this.m_Hand.m_TileSets[j].first.equals(this.m_Hand.m_TileSets[i].first)) count++
          }
        }
      }
    }
    if (count >= 2) this.m_Result.ryanpeikou = 1
    else if (count >= 1) this.m_Result.iipeikou = 1
  }

  private CalcResult_sansiki(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (!(this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_OPENCHOW | handtile_flags.HT_CLOSEDCHOW))) continue
      const t = this.m_Hand.m_TileSets[i].first
      if (t.GetSuit() !== TileSuit.TILESUIT_CHAR) continue
      const b = [false, false]
      for (let j = 0; j < this.m_Hand.m_iNumTileSets; j++) {
        if (!(this.m_Hand.m_TileSets[j].type & (handtile_flags.HT_OPENCHOW | handtile_flags.HT_CLOSEDCHOW))) continue
        const s = this.m_Hand.m_TileSets[j].first
        if (s.GetValue() === t.GetValue()) {
          if (s.GetSuit() === TileSuit.TILESUIT_BAMBOO) b[0] = true
          else if (s.GetSuit() === TileSuit.TILESUIT_CIRCLE) b[1] = true
        }
      }
      if (b[0] && b[1]) {
        this.m_Result.sansiki = 1
        return
      }
    }
  }

  private CalcResult_sansiki_doukoku(): void {
    const flags =
      handtile_flags.HT_OPENPUNG |
      handtile_flags.HT_CLOSEDPUNG |
      handtile_flags.HT_OPENKONG |
      handtile_flags.HT_CLOSEDKONG
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (!(this.m_Hand.m_TileSets[i].type & flags)) continue
      const t = this.m_Hand.m_TileSets[i].first
      if (t.GetSuit() !== TileSuit.TILESUIT_CHAR) continue
      const b = [false, false]
      for (let j = 0; j < this.m_Hand.m_iNumTileSets; j++) {
        if (!(this.m_Hand.m_TileSets[j].type & flags)) continue
        const s = this.m_Hand.m_TileSets[j].first
        if (s.GetValue() === t.GetValue()) {
          if (s.GetSuit() === TileSuit.TILESUIT_BAMBOO) b[0] = true
          else if (s.GetSuit() === TileSuit.TILESUIT_CIRCLE) b[1] = true
        }
      }
      if (b[0] && b[1]) {
        this.m_Result.sansiki_doukoku = 1
        return
      }
    }
  }

  private CalcResult_toitoi(): void {
    if (this.m_Result.chitoitu) return
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_OPENCHOW | handtile_flags.HT_CLOSEDCHOW)) return
    }
    this.m_Result.toitoi = 1
  }

  private CalcResult_junchan(): void {
    if (this.m_Result.honraotou) return
    if (this.m_Hand.m_iNumTileSets <= 0) return
    let mixed = false
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_OPENCHOW | handtile_flags.HT_CLOSEDCHOW)) {
        const v = this.m_Hand.m_TileSets[i].first.GetValue()
        if (v !== 1 && v !== 7) return
      } else {
        const t = this.m_Hand.m_TileSets[i].first
        if (!t.IsMajor()) return
        if (!t.IsNumMajor()) mixed = true
      }
    }
    if (mixed) this.m_Result.chanta = 1
    else this.m_Result.junchan = 1
  }

  private CalcResult_ittu(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (this.m_Hand.m_TileSets[i].type & (handtile_flags.HT_OPENCHOW | handtile_flags.HT_CLOSEDCHOW)) {
        const t = this.m_Hand.m_TileSets[i].first
        if (t.GetValue() === 1) {
          const h = [false, false]
          for (let j = 0; j < this.m_Hand.m_iNumTileSets; j++) {
            if (this.m_Hand.m_TileSets[j].type & (handtile_flags.HT_OPENCHOW | handtile_flags.HT_CLOSEDCHOW)) {
              const s = this.m_Hand.m_TileSets[j].first
              if (s.GetSuit() !== t.GetSuit()) continue
              if (s.GetValue() === 4) h[0] = true
              else if (s.GetValue() === 7) h[1] = true
            }
          }
          if (h[0] && h[1]) {
            this.m_Result.ittu = 1
            return
          }
        }
      }
    }
  }

  private CalcResult_chinitu(): void {
    const suit = this.m_Hand.m_Tiles[0].tile.GetSuit()
    if (suit & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) return
    for (let i = 1; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].tile.GetSuit() !== suit) return
    }
    this.m_Result.chinitu = 1
  }

  private CalcResult_honitu(): void {
    if (this.m_Result.chinitu) return
    let suit = -1
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (!(this.m_Hand.m_Tiles[i].tile.GetSuit() & (TileSuit.TILESUIT_DRAGON | TileSuit.TILESUIT_WIND))) {
        suit = this.m_Hand.m_Tiles[i].tile.GetSuit()
        break
      }
    }
    if (suit === -1) return
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (
        this.m_Hand.m_Tiles[i].tile.GetSuit() !== suit &&
        !(this.m_Hand.m_Tiles[i].tile.GetSuit() & (TileSuit.TILESUIT_DRAGON | TileSuit.TILESUIT_WIND))
      ) {
        return
      }
    }
    this.m_Result.honitu = 1
  }

  private CalcResult_chitoitu(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (!(this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_PAIR)) return
    }
    if (this.m_Hand.m_iNumTileSets > 0) return
    this.m_Result.chitoitu = 1
    this.m_Result.fu = 25
    this.m_Result.selfdrawn = false
    this.m_Result.tumo = 0
    this.m_Result.pinfu = 0
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) {
        this.m_Result.tumo = 1
        this.m_Result.selfdrawn = true
      }
    }
  }

  private CalcResult_honraotou(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (!this.m_Hand.m_Tiles[i].tile.IsMajor()) return
    }
    this.m_Result.honraotou = 1
  }

  private CalcResult_haitei(): void {
    if (this.m_pOpponent.m_iNumDiscarded >= 20 || this.m_iNumDiscarded >= 20) {
      for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
        if (this.m_Hand.m_TileSets[i].type & handtile_flags.HT_TUMO) {
          this.m_Result.haitei = 1
          break
        } else if ((this.m_Hand.m_TileSets[i].type & handtile_flags.HT_RON) && this.m_iNumDiscarded >= 20) {
          this.m_Result.houtei = 1
          break
        }
      }
      if (this.m_Hand.m_iNumTileSets <= 0) {
        for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
          if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) {
            this.m_Result.haitei = 1
            break
          } else if ((this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_FROMOPPONENT) && this.m_iNumDiscarded >= 20) {
            this.m_Result.houtei = 1
            break
          }
        }
      }
    }
  }

  private CalcResult_rinshan(): void {
    if (this.m_iState & playerstate_flags.PS_KONGED) {
      this.m_Result.rinshan = 1
    }
  }

  private CalcResult_fanpai(): void {
    let count = 0
    const flags =
      handtile_flags.HT_OPENPUNG |
      handtile_flags.HT_CLOSEDPUNG |
      handtile_flags.HT_OPENKONG |
      handtile_flags.HT_CLOSEDKONG
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (!(this.m_Hand.m_TileSets[i].type & flags)) continue
      const t = this.m_Hand.m_TileSets[i].first
      if (
        t.GetSuit() === TileSuit.TILESUIT_DRAGON ||
        t.equals(this.gpGame.GetRound() === TURN_EAST ? 'EW' : 'SW')
      ) {
        count++
      }
      if (t.equals(this.m_iTurn === TURN_EAST ? 'EW' : 'SW')) {
        count++
      }
    }
    this.m_Result.fanpai = count
  }

  private CalcResult_dora(): void {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      this.m_Result.dora += this.gpGame.IsDora(this.m_Hand.m_Tiles[i].tile, this.m_fReach)
    }
  }

  private CalcFu(): void {
    if (this.m_Result.chitoitu) {
      this.m_Result.fu = 25
      return
    }
    let fu = 20
    let ron = 0
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      const ts = this.m_Hand.m_TileSets[i]
      if (ts.type & handtile_flags.HT_OPENKONG) {
        fu += ts.first.IsMajor() ? 16 : 8
      } else if (ts.type & handtile_flags.HT_CLOSEDKONG) {
        fu += ts.first.IsMajor() ? 32 : 16
      } else if (ts.type & handtile_flags.HT_OPENPUNG) {
        fu += ts.first.IsMajor() ? 4 : 2
      } else if (ts.type & handtile_flags.HT_CLOSEDPUNG) {
        fu += ts.first.IsMajor() ? 8 : 4
      } else if (ts.type & handtile_flags.HT_PAIR) {
        if (
          ts.first.GetSuit() === TileSuit.TILESUIT_DRAGON ||
          ts.first.equals(this.gpGame.GetRound() === TURN_EAST ? 'EW' : 'SW')
        ) {
          fu += 2
        }
        if (ts.first.equals(this.m_iTurn === TURN_EAST ? 'EW' : 'SW')) {
          fu += 2
        }
      }
      if (ts.type & handtile_flags.HT_RON) {
        ron = 1
      } else if (ts.type & handtile_flags.HT_TUMO) {
        if (this.m_Result.concealed) this.m_Result.tumo = 1
      }
    }

    this.m_Result.selfdrawn = false
    if (fu === 20 && this.m_Result.concealed) {
      this.m_Result.pinfu = 1
      this.m_Result.fu = ron ? 30 : 20
      if (!ron) this.m_Result.selfdrawn = true
      return
    }
    if (!ron) {
      fu += 2
      this.m_Result.selfdrawn = true
    } else if (this.m_Result.concealed) {
      fu += 10
    }
    if (fu <= 20 && this.HasFan() <= 1) fu = 30
    this.m_Result.fu = Math.floor((fu + 9) / 10) * 10
  }

  private CalcScore(): void {
    const fan = this.HasFan()
    if (this.HasYakuman() || fan >= 13) {
      this.m_Result.score = 8000
      this.m_Result.level = scorelevel.SL_YAKUMAN
    } else if (fan === 5) {
      this.m_Result.score = 2000
      this.m_Result.level = scorelevel.SL_MANGAN
    } else if (fan >= 6 && fan <= 7) {
      this.m_Result.score = 3000
      this.m_Result.level = scorelevel.SL_HANEMAN
    } else if (fan >= 8 && fan <= 10) {
      this.m_Result.score = 4000
      this.m_Result.level = scorelevel.SL_BAIMAN
    } else if (fan >= 11) {
      this.m_Result.score = 6000
      this.m_Result.level = scorelevel.SL_SANBAIMAN
    } else {
      let n = 4
      for (let i = 0; i < fan; i++) n *= 2
      this.m_Result.score = this.m_Result.fu * n
      if (this.m_Result.score >= 2000) {
        this.m_Result.score = 2000
        this.m_Result.level = scorelevel.SL_MANGAN
      } else {
        if (fan <= 1) this.m_Result.level = scorelevel.SL_ONEHAN
        else if (fan === 2) this.m_Result.level = scorelevel.SL_TWOHAN
        else if (fan === 3) this.m_Result.level = scorelevel.SL_THREEHAN
        else this.m_Result.level = scorelevel.SL_FOURHAN
      }
    }

    if (this.m_iTurn === TURN_EAST) this.m_Result.score *= 6
    else this.m_Result.score *= 4
    this.m_Result.score += this.gpGame.GetNumDeal() * 100
    this.m_Result.score = Math.floor((this.m_Result.score + 99) / 100) * 100
  }

  ActionIsValid(state: actionstate, act: playeraction): boolean {
    if (state === actionstate.AS_DRAW) {
      switch (act) {
        case playeraction.PA_DRAW:
          return true
        case playeraction.PA_PUNG:
          if (this.m_fReach || (this.m_iState & playerstate_flags.PS_ASKED) || this.m_iNumDiscarded >= 20) return false
          return this.m_Hand.CanPung(this.m_pOpponent.LastDiscardedTile())
        case playeraction.PA_CHOW:
          if (this.m_fReach || (this.m_iState & playerstate_flags.PS_ASKED) || this.m_iNumDiscarded >= 20) return false
          return (
            this.m_Hand.CanChow(this.m_pOpponent.LastDiscardedTile(), chow_location.CHOW_UPPER) ||
            this.m_Hand.CanChow(this.m_pOpponent.LastDiscardedTile(), chow_location.CHOW_MIDDLE) ||
            this.m_Hand.CanChow(this.m_pOpponent.LastDiscardedTile(), chow_location.CHOW_LOWER)
          )
        case playeraction.PA_KONG:
          if (this.m_fReach || (this.m_iState & playerstate_flags.PS_ASKED) || this.m_iNumDiscarded >= 20) return false
          return this.m_Hand.CanKong(this.m_pOpponent.LastDiscardedTile(), true)
        case playeraction.PA_MAHJONG: {
          if (this.m_pOpponent.m_iNumDiscarded <= 0) return false
          const waiting: CTile[] = []
          const num = this.m_Hand.GetWaitingTile(waiting, 13)
          if (num <= 0) return false
          if (!this.m_fTuiDaoHu && num < 13) {
            for (let i = 0; i < this.m_iNumDiscarded; i++) {
              for (let j = 0; j < num; j++) {
                if (this.m_Discarded[i].tile.equals(waiting[j])) return false
              }
            }
          }
          const bak = this.m_Hand.clone()
          if (this.m_Hand.GoMahjong(this.m_pOpponent.LastDiscardedTile())) {
            this.CalcResult()
            this.m_Hand.copyFrom(bak)
            if (this.m_fTuiDaoHu || this.HasFan() - this.m_Result.dora > 0) return true
          }
          this.m_Hand.copyFrom(bak)
          return false
        }
        default:
          return false
      }
    } else {
      switch (act) {
        case playeraction.PA_DISCARD:
          return true
        case playeraction.PA_KONG:
          for (let i = this.m_Hand.m_iNumTiles - 1; i >= 0; i--) {
            if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_OPEN) continue
            if (this.m_Hand.CanKong(this.m_Hand.m_Tiles[i].tile, false)) return true
            if (this.m_fReach) break
          }
          return false
        case playeraction.PA_REACH:
          if (
            this.m_Hand.IsConcealed() &&
            !this.m_fReach &&
            this.m_iNumDiscarded < 19 &&
            this.m_pOpponent.m_iNumDiscarded < 20
          ) {
            for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
              if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_LOCKED) continue
              const t = this.m_Hand.clone()
              t.RemoveTile(i)
              if (t.IsReady()) return true
            }
          }
          return false
        case playeraction.PA_MAHJONG: {
          const bak = this.m_Hand.clone()
          if (this.m_Hand.GoMahjong()) {
            this.CalcResult()
            this.m_Hand.copyFrom(bak)
            if (this.m_fTuiDaoHu || this.HasFan() - this.m_Result.dora > 0) return true
          }
          this.m_Hand.copyFrom(bak)
          return false
        }
        default:
          return false
      }
    }
  }

  IsRoundDraw(): boolean {
    return (
      this.m_iNumDiscarded >= 20 ||
      (!this.gpGame.CanDeclareKong() && !(this.m_iState & playerstate_flags.PS_KONGED))
    )
  }

  DrawResult(): void {
    const res = [
      msg('1han'),
      msg('2han'),
      msg('3han'),
      msg('4han'),
      msg('man'),
      msg('hane'),
      msg('bai'),
      msg('3bai'),
      msg('yaku'),
    ]

    let top = 10
    if (this.IsBot()) top += 85
    let y = top

    const drawFan = (key: keyof result_t, fan: number, fanc: number) => {
      const val = this.m_Result[key] as number
      if (val) {
        this.gpGeneral.DrawUTF8Text(msg(key as string), 20, y, 0, 255, 255, 0)
        if (fan < 13) {
          const fcount = (this.m_Result.concealed ? fanc : fan) * val
          this.gpGeneral.DrawUTF8Text(`${fcount.toString().padStart(2, ' ')} 翻`, 175, y)
        }
        y += 32
      }
    }

    drawFan('tenhou', 13, 13)
    drawFan('renhou', 13, 13)
    drawFan('chihou', 13, 13)
    drawFan('tuisou', 13, 13)
    drawFan('chinraotou', 13, 13)
    drawFan('ryuisou', 13, 13)
    drawFan('daisangen', 13, 13)
    drawFan('daisusi', 13, 13)
    drawFan('syosusi', 13, 13)
    drawFan('suankou', 13, 13)
    drawFan('surenkou', 13, 13)
    drawFan('kokusi', 13, 13)
    drawFan('cyurenpotou', 13, 13)
    drawFan('sukantu', 13, 13)

    if (!this.HasYakuman()) {
      drawFan('reach', 0, 1)
      drawFan('pinfu', 0, 1)
      drawFan('ippatu', 0, 1)
      drawFan('double_reach', 0, 1)
      drawFan('tanyao', 1, 1)
      drawFan('tumo', 0, 1)
      drawFan('ryanpeikou', 3, 3)
      drawFan('iipeikou', 0, 1)
      drawFan('sansiki', 1, 2)
      drawFan('sansiki_doukoku', 2, 2)
      drawFan('toitoi', 2, 2)
      drawFan('sanankou', 2, 2)
      drawFan('sanrenkou', 2, 2)
      drawFan('junchan', 2, 3)
      drawFan('chanta', 1, 2)
      drawFan('ittu', 1, 2)
      drawFan('chinitu', 5, 6)
      drawFan('honitu', 2, 3)
      drawFan('chitoitu', 0, 2)
      drawFan('honraotou', 2, 2)
      drawFan('syosangen', 2, 2)
      drawFan('haitei', 1, 1)
      drawFan('houtei', 1, 1)
      drawFan('rinshan', 1, 1)
      drawFan('fanpai', 1, 1)
      drawFan('dora', 1, 1)
      drawFan('sankantu', 2, 2)
      drawFan('nofan', 1, 1)
    }

    if (!this.HasFan()) {
      this.gpGeneral.DrawUTF8Text(msg('nofan'), 20, y, 0, 255, 255, 0)
    }

    y = top
    if (!this.HasYakuman()) {
      this.gpGeneral.DrawUTF8Text(msg('total'), 420, y, 0, 255, 255, 0)
      y += 32
      this.gpGeneral.DrawUTF8Text(`${this.m_Result.fu} 符 ${this.HasFan()} 翻`, 420, y)
      y += 40
    }
    this.gpGeneral.DrawUTF8Text(res[this.m_Result.level] || '', 420, y, 0, 255, 255, 0)
    y += 40
    this.gpGeneral.DrawUTF8Text(`${this.m_Result.score} 点`, 420, y, 0, 80, 180, 255)
  }

  async AnnounceResultVoice(): Promise<void> {
    const yakumanKeys: (keyof result_t)[] = [
      'tenhou', 'renhou', 'chihou', 'tuisou', 'chinraotou', 'ryuisou',
      'daisangen', 'daisusi', 'syosusi', 'suankou', 'surenkou', 'kokusi',
      'cyurenpotou', 'sukantu',
    ]
    const normalKeys: (keyof result_t)[] = [
      'reach', 'pinfu', 'ippatu', 'double_reach', 'tanyao', 'tumo',
      'ryanpeikou', 'iipeikou', 'sansiki', 'sansiki_doukoku', 'toitoi',
      'sanankou', 'sanrenkou', 'junchan', 'chanta', 'ittu', 'chinitu',
      'honitu', 'chitoitu', 'honraotou', 'syosangen', 'haitei', 'houtei',
      'rinshan', 'fanpai', 'dora', 'sankantu',
    ]

    const listToSpeak: string[] = []
    for (const k of yakumanKeys) {
      if (this.m_Result[k]) listToSpeak.push(k as string)
    }
    if (listToSpeak.length === 0) {
      for (const k of normalKeys) {
        if (this.m_Result[k]) listToSpeak.push(k as string)
      }
    }
    if (listToSpeak.length === 0) {
      listToSpeak.push('nofan')
    }
    listToSpeak.push(`level_${Math.min(8, Math.max(0, this.m_Result.level))}`)

    for (const key of listToSpeak) {
      if (this.gpGame.abortCurrentRound) return
      await this.gpGeneral.PlayYakuVoice(key)
    }
  }

  protected IndexToLoc(index: number): number {
    let loc = 0
    if (index < 0 || index >= this.m_Hand.m_iNumTiles) return -1
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if ((this.m_Hand.m_TileSets[i].type & handtile_flags.HT_OPEN) && !(this.m_Hand.m_TileSets[i].type & handtile_flags.HT_RON)) {
        loc += 3
      }
    }
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if ((this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_OPEN) && !(this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_RON)) {
        continue
      }
      if (i === index) return loc
      loc++
    }
    return loc
  }

  public pickBestDiscardIndexPublic(): number {
    if (this.m_fReach) {
      for (let i = this.m_Hand.m_iNumTiles - 1; i >= 0; i--) {
        if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) return i
      }
      return this.m_Hand.m_iNumTiles - 1
    }

    let minScore = 999999
    let bestIdx = this.m_Hand.m_iNumTiles - 1

    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_LOCKED) continue
      const t = this.m_Hand.m_Tiles[i].tile
      let score = 0
      for (let j = 0; j < this.m_Hand.m_iNumTiles; j++) {
        if (i === j) continue
        const o = this.m_Hand.m_Tiles[j].tile
        if (o.equals(t)) score += 300
        else if (
          o.GetSuit() === t.GetSuit() &&
          !(t.GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON))
        ) {
          const diff = Math.abs(o.GetValue() - t.GetValue())
          if (diff === 1) score += 180
          else if (diff === 2) score += 90
        }
      }
      if (!t.IsMajor()) score += 25
      if (this.gpGame.IsDora(t)) score += 150

      const testHand = this.m_Hand.clone()
      testHand.RemoveTile(i)
      if (testHand.IsReady()) {
        return i
      }

      if (score < minScore) {
        minScore = score
        bestIdx = i
      }
    }
    return bestIdx
  }
}

function playerDrawLoc(l: number): number {
  return l >= 13 ? 20 + TILE_WIDTH * l + 8 : 20 + TILE_WIDTH * l
}

export class CPlayer extends CBasePlayer {
  public m_fAutoDraw: boolean = true
  public m_SanGenRush: CTile[] = Array.from({ length: 9 }, () => new CTile())
  public m_iNumSanGenRush: number = 0
  public m_iCountSanGenRush: number = 0
  public currentActionState: actionstate = actionstate.AS_DRAW
  public currentSelectedAct: playeraction = playeraction.PA_DRAW

  IsBot(): boolean {
    return false
  }

  NewRound(): void {
    this.m_iNumSanGenRush = 0
    super.NewRound()
  }

  DrawHand(shown: boolean = false): void {
    let loc = 0
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      const ts = this.m_Hand.m_TileSets[i]
      if ((ts.type & handtile_flags.HT_OPEN) && !(ts.type & handtile_flags.HT_RON)) {
        if (ts.type & handtile_flags.HT_OPENKONG) {
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(playerDrawLoc(loc), 380, TILE_WIDTH, 100)
            this.gpGeneral.DrawTile(ts.first, playerDrawLoc(loc), 410, TileDir.PLAYER_SHOWN)
            loc++
          }
          this.gpGeneral.DrawTile(ts.first, playerDrawLoc(loc - 2), 390, TileDir.PLAYER_SHOWN)
        } else if (ts.type & handtile_flags.HT_CLOSEDKONG) {
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(playerDrawLoc(loc), 380, TILE_WIDTH, 100)
            this.gpGeneral.DrawTile(ts.first, playerDrawLoc(loc), 410, TileDir.WALL_CONCEALED)
            loc++
          }
          this.gpGeneral.DrawTile(ts.first, playerDrawLoc(loc - 2), 390, TileDir.PLAYER_SHOWN)
        } else if (ts.type & handtile_flags.HT_OPENPUNG) {
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(playerDrawLoc(loc), 380, TILE_WIDTH, 100)
            this.gpGeneral.DrawTile(ts.first, playerDrawLoc(loc), 410, TileDir.PLAYER_SHOWN)
            loc++
          }
        } else if (ts.type & handtile_flags.HT_OPENCHOW) {
          let t = ts.first.clone()
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(playerDrawLoc(loc), 380, TILE_WIDTH, 100)
            this.gpGeneral.DrawTile(t, playerDrawLoc(loc), 410, TileDir.PLAYER_SHOWN)
            loc++
            t = new CTile(t.GetKind() + 1)
          }
        }
      }
    }

    let charCode = 65 + loc
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (
        (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_OPEN) &&
        !(this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_RON)
      ) {
        continue
      }
      this.gpGeneral.EraseArea(playerDrawLoc(loc), 380, TILE_WIDTH, 100)
      this.gpGeneral.DrawTile(
        this.m_Hand.m_Tiles[i].tile,
        playerDrawLoc(loc),
        shown ? 396 : 380,
        shown ? TileDir.PLAYER_SHOWN : TileDir.PLAYER_CONCEALED
      )
      this.gpGeneral.DrawUTF8Text(String.fromCharCode(charCode), playerDrawLoc(loc) + 15, 455)
      charCode++
      loc++
    }

    if (charCode <= 78) {
      this.gpGeneral.EraseArea(playerDrawLoc(13), 380, TILE_WIDTH, 100)
      this.gpGeneral.DrawUTF8Text('N', playerDrawLoc(13) + 15, 455)
    }
  }

  DrawDiscarded(): void {
    let i = 0
    for (i = 0; i < 10 && i < this.m_iNumDiscarded; i++) {
      const x = playerDrawLoc(i)
      this.gpGeneral.DrawTile(this.m_Discarded[i].tile, x, 265, TileDir.WALL_SHOWN)
      if (this.m_Discarded[i].flags & discarded_flags.DT_REACH) {
        this.gpGeneral.TintReachTile(x, 265)
      }
    }
    this.gpGeneral.EraseArea(playerDrawLoc(i), 265, TILE_WIDTH * (10 - i), TILE_HEIGHT_SHOWN)

    let j = 0
    for (j = 0; j < 10 && j < this.m_iNumDiscarded - 10; j++) {
      const x = playerDrawLoc(j)
      this.gpGeneral.DrawTile(this.m_Discarded[j + 10].tile, x, 303, TileDir.WALL_SHOWN)
      if (this.m_Discarded[j + 10].flags & discarded_flags.DT_REACH) {
        this.gpGeneral.TintReachTile(x, 303)
      }
    }
    this.gpGeneral.EraseArea(playerDrawLoc(j), 325, TILE_WIDTH * (10 - j), TILE_HEIGHT_SHOWN - 22)

    if (this.m_fReach) {
      this.gpGeneral.DrawDotBar(playerDrawLoc(10) + 5, 270)
    } else {
      this.gpGeneral.EraseArea(playerDrawLoc(10) + 5, 270, 20, 85)
    }
  }

  KeyToIndex(key: string): number {
    const k = key.toLowerCase()
    if (k.length !== 1) return -1
    const d = k.charCodeAt(0) - 97
    if (d < 0 || d > 14) return -1

    let loc = 0
    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      if (
        (this.m_Hand.m_TileSets[i].type & handtile_flags.HT_OPEN) &&
        !(this.m_Hand.m_TileSets[i].type & handtile_flags.HT_RON)
      ) {
        loc += 3
      }
    }
    let lastConcealedIdx = -1
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (
        (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_OPEN) &&
        !(this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_RON)
      ) {
        continue
      }
      lastConcealedIdx = i
      if (loc === d) return i
      loc++
    }
    // Fallback for 'n' key (14th slot): always return the rightmost concealed tile so player is never stuck!
    if (k === 'n' && lastConcealedIdx >= 0) {
      return lastConcealedIdx
    }
    return -1
  }

  async FirstChance(): Promise<void> {
    let changed = 0
    this.gpGeneral.DrawMessage(msg('hint_firstchance'))

    while (true) {
      const key = await this.gpGeneral.ReadKey()
      if (key === 'Enter' || key === ' ') break
      const index = this.KeyToIndex(key)
      if (index < 0 || index >= 13 || (changed & (1 << index))) continue
      changed |= 1 << index

      CTile.ReturnTile(this.m_Hand.m_Tiles[index].tile)
      this.m_Hand.m_Tiles[index].tile = CTile.RandomTile()
      this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
      this.gpGeneral.EraseArea(playerDrawLoc(index), 380, TILE_WIDTH, TILE_HEIGHT_CONCEALED)
      this.gpGeneral.DrawTile(this.m_Hand.m_Tiles[index].tile, playerDrawLoc(index), 396, TileDir.WALL_CONCEALED)
    }

    this.gpGeneral.DrawMessage(null)
    this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
    this.DrawHand()
    this.m_Hand.Sort()
    await this.gpGeneral.UTIL_Delay(800)

    this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
    this.gpGeneral.EraseArea(0, 380, 640, TILE_HEIGHT_CONCEALED)
    this.gpGeneral.DrawTiles(null, 13, 20, 396, TileDir.WALL_CONCEALED)
    await this.gpGeneral.UTIL_Delay(1000)

    this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
    this.DrawHand()
  }

  async LastChance(): Promise<boolean> {
    const waiting: CTile[] = []
    const wall: CTile[] = []
    const n = this.m_Hand.GetWaitingTile(waiting)
    if (n <= 0) return false

    this.gpGeneral.PlaySound(SoundId.SND_DING)
    const tCount = RandomLong(1, 3)
    let i = 0
    for (i = 0; i < tCount; i++) {
      const s = RandomLong(0, n - 1)
      wall[i] = CTile.FetchTile(waiting[s]) ? waiting[s].clone() : CTile.RandomTile()
    }
    for (; i < 10; i++) {
      wall[i] = CTile.RandomTile()
    }
    for (i = 0; i < 10; i++) {
      const r = RandomLong(0, 9)
      const tmp = wall[i]
      wall[i] = wall[r]
      wall[r] = tmp
    }

    this.gpGeneral.EraseArea(0, 265, 640, 363 - 265)
    this.gpGeneral.DrawTiles(null, 10, 20, 265, TileDir.WALL_CONCEALED)
    for (i = 0; i < 10; i++) {
      this.gpGeneral.DrawUTF8Text(String.fromCharCode(65 + i), 20 + TILE_WIDTH * i + 15, 325)
    }

    let flags = 0
    for (let chance = 0; chance < 3; chance++) {
      const k = await this.gpGeneral.ReadKey()
      const idx = k.toLowerCase().charCodeAt(0) - 97
      if (idx < 0 || idx >= 10 || (flags & (1 << idx))) {
        chance--
        continue
      }
      flags |= 1 << idx
      const x = 20 + TILE_WIDTH * idx
      this.gpGeneral.PlaySound(SoundId.SND_SOUND4)
      this.gpGeneral.DrawTile(wall[idx], x, 265, TileDir.WALL_SHOWN)

      const tmp = this.m_Hand.clone()
      this.m_Hand.AddTile(wall[idx])
      if (this.m_Hand.GoMahjong()) {
        this.CalcResult()
        await this.gpGeneral.UTIL_Delay(1000)
        return true
      }
      this.m_Hand.copyFrom(tmp)
    }

    await this.gpGeneral.UTIL_Delay(500)
    this.gpGeneral.DrawTiles(wall, 10, 20, 265, TileDir.WALL_SHOWN)
    await this.gpGeneral.UTIL_Delay(500)
    return false
  }

  SanGenInit(): void {
    const sangen = ['RD', 'GD', 'WD'].map((c) => new CTile(c))
    this.m_iNumSanGenRush = RandomLong(2, 3) * 3
    for (let i = 0; i < this.m_iNumSanGenRush / 3; i++) {
      for (let j = 0; j < 3; j++) {
        CTile.FetchTile(sangen[i])
        this.m_SanGenRush[i * 3 + j] = sangen[i].clone()
      }
    }
    this.m_iCountSanGenRush = RandomLong(2, 5)
  }

  async SanGenRush(): Promise<boolean> {
    let changed = 0
    let num = 0
    this.gpGeneral.DrawMessage(msg('sangenrush'))
    this.gpGeneral.PlaySound(SoundId.SND_SOUND2)

    while (num < 3) {
      const key = await this.gpGeneral.ReadKey()
      if (key === 'Enter' || key === ' ') break
      const index = this.KeyToIndex(key)
      if (index < 0 || index >= 13 || (changed & (1 << index))) continue
      changed |= 1 << index

      CTile.ReturnTile(this.m_Hand.m_Tiles[index].tile)
      this.m_Hand.m_Tiles[index].tile = this.m_SanGenRush[this.m_iNumSanGenRush - 1].clone()
      num++

      this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
      this.gpGeneral.EraseArea(playerDrawLoc(index), 380, TILE_WIDTH, TILE_HEIGHT_CONCEALED)
      this.gpGeneral.DrawTile(this.m_Hand.m_Tiles[index].tile, playerDrawLoc(index), 396, TileDir.WALL_CONCEALED)
    }

    await this.gpGeneral.UTIL_Delay(200)
    this.gpGeneral.DrawMessage(null)
    this.gpGeneral.PlaySound(SoundId.SND_SOUND2)
    this.DrawHand()
    return num > 0
  }

  DrawAction(act: playeraction): void {
    this.currentSelectedAct = act
    this.gpGeneral.EraseArea(580, 330, 55, 28)
    let pStr: string | null = null
    switch (act) {
      case playeraction.PA_DRAW: pStr = msg('player_drawtile'); break
      case playeraction.PA_DISCARD: pStr = msg('player_discardtile'); break
      case playeraction.PA_PUNG: pStr = msg('player_pung'); break
      case playeraction.PA_CHOW: pStr = msg('player_chow'); break
      case playeraction.PA_KONG: pStr = msg('player_kong'); break
      case playeraction.PA_REACH: pStr = msg('player_reach'); break
      case playeraction.PA_MAHJONG: pStr = msg('player_gomahjong'); break
    }
    if (pStr) {
      this.gpGeneral.DrawUTF8Text(pStr, 580, 330, 0, 255, 255, 100)
    }
    this.gpGame.notifyUI()
  }

  async Action(state: actionstate): Promise<playeraction> {
    this.currentActionState = state
    if (state === actionstate.AS_DRAW) return this.ActionDraw()
    return this.ActionDiscard()
  }

  private async ActionDraw(): Promise<playeraction> {
    let act: playeraction = playeraction.PA_DRAW

    // Auto-select Mahjong if Ron is valid!
    if (this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_MAHJONG)) {
      act = playeraction.PA_MAHJONG
    }

    if (
      this.m_Hand.m_iNumTileSets <= 0 &&
      !this.m_fReach &&
      !(this.m_iState & playerstate_flags.PS_KONGED) &&
      this.m_iNumSanGenRush > 0 &&
      --this.m_iCountSanGenRush <= 0
    ) {
      if ((await this.SanGenRush()) && this.m_iNumSanGenRush > 0) {
        this.m_iCountSanGenRush = RandomLong(2, 6)
        this.m_iNumSanGenRush -= 3
      }
    }

    while (true) {
      this.DrawAction(act)
      let key: string
      const hasCallOption =
        this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_MAHJONG) ||
        this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_PUNG) ||
        this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_CHOW) ||
        this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_KONG)

      if (
        (this.m_iState & playerstate_flags.PS_KONGED) ||
        (this.m_iNumDiscarded === 0 && this.m_pOpponent.m_iNumDiscarded === 0) ||
        (this.m_fAutoDraw && !hasCallOption)
      ) {
        await this.gpGeneral.UTIL_Delay(260)
        key = 'n'
      } else if (this.gpGame.isAutoPlay) {
        await this.gpGeneral.UTIL_Delay(320)
        if (this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_MAHJONG)) {
          act = playeraction.PA_MAHJONG
          key = 'Enter'
        } else {
          key = 'n'
        }
      } else {
        key = await this.gpGeneral.ReadKeyWithTimeout(15000, (sec) => {
          this.gpGame.turnCountdown = sec
          this.gpGame.isWaitingOpponentTurn = false
          this.gpGame.notifyUI()
        })
        if (key === '__TIMEOUT__') {
          this.gpGame.isAutoPlay = true
          this.gpGame.onAutoPlayTriggered?.('⏱️ 15秒响应超时，已自动为您开启电脑 AI 托管！')
          if (this.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_MAHJONG)) {
            act = playeraction.PA_MAHJONG
            key = 'Enter'
          } else {
            key = 'n'
          }
        }
      }

      if (key === '__ABORT_ROUND__') {
        return playeraction.PA_NONE
      }

      if (key.startsWith('ACT:')) {
        act = parseInt(key.slice(4), 10) as playeraction
        key = 'Enter'
      }

      switch (key) {
        case 'y':
        case 'Y':
          if (
            (!this.gpGame.isPvpMode || (this.gpGame.allowDonden && this.gpGame.pvpGameMode === '2P')) &&
            (this.m_iState & (playerstate_flags.PS_ASKED | playerstate_flags.PS_KONGED)) === 0
          ) {
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({ round: this.gpGame.pvpRoundCounter, phase: 'DONDEN', act: 0 })
            }
            this.gpGeneral.PlayActionVoice('donden')
            await this.gpGame.DonDen()
          }
          continue

        case 'n':
        case 'N': {
          if (this.IsRoundDraw()) {
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({
                round: this.gpGame.pvpRoundCounter,
                phase: 'DRAW',
                act: playeraction.PA_NONE,
              })
            }
            return playeraction.PA_NONE
          }
          for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
            this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
          }
          if (!this.gpGame.isPvpMode && this.gpGame.m_fReachBonus && this.m_fReach) {
            this.gpGame.m_fReachBonus = false
            const t: CTile[] = []
            const count = this.m_Hand.GetWaitingTile(t)
            if (count > 0) {
              const idx = RandomLong(0, count - 1)
              if (CTile.FetchTile(t[idx])) {
                this.m_Hand.AddTile(t[idx], handtile_flags.HT_JUSTGOT)
              } else {
                this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
              }
            } else {
              this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
            }
          } else {
            this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
          }
          this.m_iState &=
            playerstate_flags.PS_CALLREACH |
            playerstate_flags.PS_KONGED |
            playerstate_flags.PS_NOTDISCARDED
          const drawnCode = this.m_Hand.m_Tiles[Math.max(0, this.m_Hand.m_iNumTiles - 1)]?.tile.GetCode()
          if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
            this.gpGame.pvpManager.sendPvpMove({
              round: this.gpGame.pvpRoundCounter,
              phase: 'DRAW',
              act: playeraction.PA_DRAW,
              tileCode: drawnCode,
            })
          }
          return playeraction.PA_DRAW
        }

        case 'ArrowUp':
        case 'ArrowRight':
          do {
            act++
            if (act >= playeraction.PA_COUNT) act = playeraction.PA_NONE + 1
          } while (!this.ActionIsValid(actionstate.AS_DRAW, act))
          break

        case 'ArrowDown':
        case 'ArrowLeft':
          do {
            act--
            if (act <= playeraction.PA_NONE) act = playeraction.PA_COUNT - 1
          } while (!this.ActionIsValid(actionstate.AS_DRAW, act))
          break

        case ' ':
        case 'Enter':
          if (act === playeraction.PA_DRAW) {
            if (this.IsRoundDraw()) {
              if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
                this.gpGame.pvpManager.sendPvpMove({
                  round: this.gpGame.pvpRoundCounter,
                  phase: 'DRAW',
                  act: playeraction.PA_NONE,
                })
              }
              return playeraction.PA_NONE
            }
            for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
              this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
            }
            this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
            this.m_iState &=
              playerstate_flags.PS_CALLREACH |
              playerstate_flags.PS_KONGED |
              playerstate_flags.PS_NOTDISCARDED
            const drawnCode = this.m_Hand.m_Tiles[Math.max(0, this.m_Hand.m_iNumTiles - 1)]?.tile.GetCode()
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({
                round: this.gpGame.pvpRoundCounter,
                phase: 'DRAW',
                act: playeraction.PA_DRAW,
                tileCode: drawnCode,
              })
            }
            return playeraction.PA_DRAW
          } else if (act === playeraction.PA_PUNG) {
            if (this.m_Hand.Pung(this.m_pOpponent.LastDiscardedTile())) {
              this.m_pOpponent.m_iNumDiscarded--
              this.m_iState |= playerstate_flags.PS_ASKED
              this.gpGeneral.PlayActionVoice('pung')
              if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
                this.gpGame.pvpManager.sendPvpMove({
                  round: this.gpGame.pvpRoundCounter,
                  phase: 'DRAW',
                  act: playeraction.PA_PUNG,
                })
              }
              return playeraction.PA_PUNG
            }
          } else if (act === playeraction.PA_CHOW) {
            const chowRes = await this.ActionChow()
            if (chowRes !== playeraction.PA_NONE) {
              this.m_iState |= playerstate_flags.PS_ASKED
              this.gpGeneral.PlayActionVoice('chow')
              return playeraction.PA_CHOW
            }
          } else if (act === playeraction.PA_KONG) {
            if (this.m_Hand.Kong(this.m_pOpponent.LastDiscardedTile(), true)) {
              this.m_pOpponent.m_iNumDiscarded--
              this.m_iState |= playerstate_flags.PS_KONGED | playerstate_flags.PS_ASKED
              this.gpGeneral.PlayActionVoice('kong')
              if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
                this.gpGame.pvpManager.sendPvpMove({
                  round: this.gpGame.pvpRoundCounter,
                  phase: 'DRAW',
                  act: playeraction.PA_KONG,
                })
              }
              return playeraction.PA_KONG
            }
          } else if (act === playeraction.PA_MAHJONG) {
            this.m_Hand.AddTile(this.m_pOpponent.LastDiscardedTile())
            this.gpGeneral.PlayActionVoice('ron')
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({
                round: this.gpGame.pvpRoundCounter,
                phase: 'DRAW',
                act: playeraction.PA_MAHJONG,
              })
            }
            return playeraction.PA_MAHJONG
          }
          break
      }
    }
  }

  private async ActionDiscard(): Promise<playeraction> {
    let act: playeraction = playeraction.PA_DISCARD
    let reach = false

    if (this.ActionIsValid(actionstate.AS_DISCARD, playeraction.PA_MAHJONG)) {
      act = playeraction.PA_MAHJONG
    }

    while (true) {
      this.DrawAction(act)
      let key: string
      if (
        this.m_fReach &&
        this.m_fAutoDraw &&
        !this.ActionIsValid(actionstate.AS_DISCARD, playeraction.PA_MAHJONG) &&
        !this.ActionIsValid(actionstate.AS_DISCARD, playeraction.PA_KONG)
      ) {
        await this.gpGeneral.UTIL_Delay(450)
        key = 'n'
      } else if (this.gpGame.isAutoPlay) {
        await this.gpGeneral.UTIL_Delay(380)
        if (this.ActionIsValid(actionstate.AS_DISCARD, playeraction.PA_MAHJONG)) {
          act = playeraction.PA_MAHJONG
          key = 'Enter'
        } else {
          const bestIdx = this.pickBestDiscardIndexPublic()
          const loc = this.IndexToLoc(bestIdx)
          key = loc >= 0 && loc <= 12 ? String.fromCharCode(97 + loc) : 'n'
        }
      } else {
        key = await this.gpGeneral.ReadKeyWithTimeout(30000, (sec) => {
          this.gpGame.turnCountdown = sec
          this.gpGame.isWaitingOpponentTurn = false
          this.gpGame.notifyUI()
        })
        if (key === '__TIMEOUT__') {
          this.gpGame.isAutoPlay = true
          this.gpGame.onAutoPlayTriggered?.('⏱️ 30秒出牌超时，已自动为您开启电脑 AI 托管！')
          continue
        }
      }

      if (key === '__ABORT_ROUND__') {
        return playeraction.PA_DISCARD
      }

      if (key.startsWith('ACT:')) {
        act = parseInt(key.slice(4), 10) as playeraction
        key = 'Enter'
      }

      switch (key) {
        case 'y':
        case 'Y':
          if (
            !reach &&
            (!this.gpGame.isPvpMode || (this.gpGame.allowDonden && this.gpGame.pvpGameMode === '2P')) &&
            (this.m_iState & (playerstate_flags.PS_ASKED | playerstate_flags.PS_KONGED)) === 0
          ) {
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({ round: this.gpGame.pvpRoundCounter, phase: 'DONDEN', act: 0 })
            }
            this.gpGeneral.PlayActionVoice('donden')
            await this.gpGame.DonDen()
          }
          continue

        case 'ArrowUp':
        case 'ArrowRight':
          if (!reach) {
            do {
              act++
              if (act >= playeraction.PA_COUNT) act = playeraction.PA_NONE + 1
            } while (!this.ActionIsValid(actionstate.AS_DISCARD, act))
          }
          break

        case 'ArrowDown':
        case 'ArrowLeft':
          if (!reach) {
            do {
              act--
              if (act <= playeraction.PA_NONE) act = playeraction.PA_COUNT - 1
            } while (!this.ActionIsValid(actionstate.AS_DISCARD, act))
          }
          break

        case ' ':
        case 'Enter':
          if (act === playeraction.PA_DISCARD) {
            const index = this.KeyToIndex('n')
            if (index < 0) break
            const discTile = this.m_Hand.m_Tiles[index].tile.clone()
            const discCode = discTile.GetCode()
            this.m_Discarded[this.m_iNumDiscarded] = {
              tile: discTile,
              flags: 0,
            }
            this.m_iNumDiscarded++
            this.m_Hand.RemoveTile(index)
            this.m_Hand.Sort()
            for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
              this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
            }
            this.gpGeneral.PlayTileVoice(discCode)
            if (reach && this.m_Hand.IsReady()) {
              this.m_fReach = true
              this.m_Discarded[this.m_iNumDiscarded - 1].flags |= discarded_flags.DT_REACH
              if (this.m_pOpponent.m_iNumDiscarded > 0) {
                this.m_pOpponent.m_Discarded[this.m_pOpponent.m_iNumDiscarded - 1].flags |=
                  discarded_flags.DT_OPPONENTREACH
              }
              this.m_iState = playerstate_flags.PS_CALLREACH
              if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
                this.gpGame.pvpManager.sendPvpMove({
                  round: this.gpGame.pvpRoundCounter,
                  phase: 'DISCARD',
                  act: playeraction.PA_REACH,
                  index,
                  tileCode: discCode,
                })
              }
              return playeraction.PA_REACH
            }
            this.m_iState = 0
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({
                round: this.gpGame.pvpRoundCounter,
                phase: 'DISCARD',
                act: playeraction.PA_DISCARD,
                index,
                tileCode: discCode,
              })
            }
            return playeraction.PA_DISCARD
          } else if (act === playeraction.PA_REACH) {
            reach = true
            this.gpGeneral.PlaySound(SoundId.SND_REACH)
            this.gpGeneral.PlayActionVoice('reach')
            await this.gpGeneral.DrawDotBar(445, 270, true)
            act = playeraction.PA_DISCARD
          } else if (act === playeraction.PA_KONG) {
            if (!reach) {
              if ((await this.ActionKong()) !== playeraction.PA_NONE) {
                this.m_iState |= playerstate_flags.PS_KONGED
                this.gpGeneral.PlayActionVoice('kong')
                return playeraction.PA_KONG
              }
            }
          } else if (act === playeraction.PA_MAHJONG) {
            if (!reach) {
              this.gpGeneral.PlayActionVoice('tsumo')
              if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
                this.gpGame.pvpManager.sendPvpMove({
                  round: this.gpGame.pvpRoundCounter,
                  phase: 'DISCARD',
                  act: playeraction.PA_MAHJONG,
                })
              }
              return playeraction.PA_MAHJONG
            }
          }
          break

        default: {
          if (this.m_fReach && key.toLowerCase() !== 'n') continue
          const index = this.KeyToIndex(key)
          if (index < 0) continue
          const discTile = this.m_Hand.m_Tiles[index].tile.clone()
          const discCode = discTile.GetCode()
          this.m_Discarded[this.m_iNumDiscarded] = {
            tile: discTile,
            flags: 0,
          }
          this.m_iNumDiscarded++
          this.m_Hand.RemoveTile(index)
          this.m_Hand.Sort()
          for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
            this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
          }
          this.gpGeneral.PlayTileVoice(discCode)
          if (reach && this.m_Hand.IsReady()) {
            this.m_fReach = true
            this.m_Discarded[this.m_iNumDiscarded - 1].flags |= discarded_flags.DT_REACH
            if (this.m_pOpponent.m_iNumDiscarded > 0) {
              this.m_pOpponent.m_Discarded[this.m_pOpponent.m_iNumDiscarded - 1].flags |=
                discarded_flags.DT_OPPONENTREACH
            }
            this.m_iState = playerstate_flags.PS_CALLREACH
            if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
              this.gpGame.pvpManager.sendPvpMove({
                round: this.gpGame.pvpRoundCounter,
                phase: 'DISCARD',
                act: playeraction.PA_REACH,
                index,
                tileCode: discCode,
              })
            }
            return playeraction.PA_REACH
          }
          this.m_iState = 0
          if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
            this.gpGame.pvpManager.sendPvpMove({
              round: this.gpGame.pvpRoundCounter,
              phase: 'DISCARD',
              act: playeraction.PA_DISCARD,
              index,
              tileCode: discCode,
            })
          }
          return playeraction.PA_DISCARD
        }
      }
    }
  }

  private async ActionChow(): Promise<playeraction> {
    const t = this.m_pOpponent.LastDiscardedTile()
    for (let loc = chow_location.CHOW_LOWER; loc <= chow_location.CHOW_UPPER; loc++) {
      if (this.m_Hand.CanChow(t, loc)) {
        if (this.m_Hand.Chow(t, loc)) {
          this.m_pOpponent.m_iNumDiscarded--
          this.m_iState |= playerstate_flags.PS_ASKED
          if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
            this.gpGame.pvpManager.sendPvpMove({
              round: this.gpGame.pvpRoundCounter,
              phase: 'DRAW',
              act: playeraction.PA_CHOW,
              chowLocation: loc,
            })
          }
          return playeraction.PA_CHOW
        }
      }
    }
    return playeraction.PA_NONE
  }

  private async ActionKong(): Promise<playeraction> {
    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_OPEN) continue
      const kTile = this.m_Hand.m_Tiles[i].tile.clone()
      if (this.m_Hand.CanKong(kTile, false)) {
        if (this.m_Hand.Kong(kTile, false)) {
          this.m_iState |= playerstate_flags.PS_KONGED
          if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
            this.gpGame.pvpManager.sendPvpMove({
              round: this.gpGame.pvpRoundCounter,
              phase: 'DISCARD',
              act: playeraction.PA_KONG,
              index: i,
              tileCode: kTile.GetCode(),
            })
          }
          return playeraction.PA_KONG
        }
      }
    }
    return playeraction.PA_NONE
  }
}

function botDrawLoc(l: number): number {
  return l >= 13 ? 640 - (20 + TILE_WIDTH * (l + 1) + 8) : 640 - (20 + TILE_WIDTH * (l + 1))
}

export class CBot extends CBasePlayer {
  private m_iLastDiscardIndex: number = -1

  IsBot(): boolean {
    return true
  }

  DrawHand(shown: boolean = false): void {
    let loc = 0
    if (this.m_pOpponent.m_fReach) shown = true

    for (let i = 0; i < this.m_Hand.m_iNumTileSets; i++) {
      const ts = this.m_Hand.m_TileSets[i]
      if ((ts.type & handtile_flags.HT_OPEN) && !(ts.type & handtile_flags.HT_RON)) {
        if (ts.type & handtile_flags.HT_OPENKONG) {
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(botDrawLoc(loc), 10, TILE_WIDTH, 80)
            this.gpGeneral.DrawTile(ts.first, botDrawLoc(loc), 25, TileDir.COMPUTER_SHOWN)
            loc++
          }
          this.gpGeneral.DrawTile(ts.first, botDrawLoc(loc - 2), 8, TileDir.COMPUTER_SHOWN)
        } else if (ts.type & handtile_flags.HT_CLOSEDKONG) {
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(botDrawLoc(loc), 10, TILE_WIDTH, 80)
            this.gpGeneral.DrawTile(ts.first, botDrawLoc(loc), 25, TileDir.WALL_CONCEALED)
            loc++
          }
          this.gpGeneral.DrawTile(ts.first, botDrawLoc(loc - 2), 8, TileDir.COMPUTER_SHOWN)
        } else if (ts.type & handtile_flags.HT_OPENPUNG) {
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(botDrawLoc(loc), 10, TILE_WIDTH, 80)
            this.gpGeneral.DrawTile(ts.first, botDrawLoc(loc), 25, TileDir.COMPUTER_SHOWN)
            loc++
          }
        } else if (ts.type & handtile_flags.HT_OPENCHOW) {
          let t = ts.first.clone()
          for (let j = 0; j < 3; j++) {
            this.gpGeneral.EraseArea(botDrawLoc(loc), 10, TILE_WIDTH, 80)
            this.gpGeneral.DrawTile(t, botDrawLoc(loc), 25, TileDir.COMPUTER_SHOWN)
            loc++
            t = new CTile(t.GetKind() + 1)
          }
        }
      }
    }

    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (
        (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_OPEN) &&
        !(this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_RON)
      ) {
        continue
      }
      this.gpGeneral.EraseArea(botDrawLoc(loc), 10, TILE_WIDTH, 80)
      this.gpGeneral.DrawTile(
        this.m_Hand.m_Tiles[i].tile,
        botDrawLoc(loc),
        shown ? 18 : 10,
        shown ? TileDir.COMPUTER_SHOWN : TileDir.COMPUTER_CONCEALED
      )
      loc++
    }
    if (loc > 0) {
      this.gpGeneral.EraseArea(0, 0, botDrawLoc(loc - 1), 18 + TILE_HEIGHT_CONCEALED)
    }
  }

  DrawDiscarded(): void {
    let i = 0
    for (i = 0; i < 10 && i < this.m_iNumDiscarded - 10; i++) {
      const x = botDrawLoc(i)
      this.gpGeneral.DrawTile(this.m_Discarded[i + 10].tile, x, 94, TileDir.WALL_SHOWN)
      if (this.m_Discarded[i + 10].flags & discarded_flags.DT_REACH) {
        this.gpGeneral.TintReachTile(x, 94)
      }
    }
    this.gpGeneral.EraseArea(botDrawLoc(9), 94, TILE_WIDTH * (10 - i), TILE_HEIGHT_SHOWN - 22)

    let j = 0
    for (j = 0; j < 10 && j < this.m_iNumDiscarded; j++) {
      const x = botDrawLoc(j)
      this.gpGeneral.DrawTile(this.m_Discarded[j].tile, x, 132, TileDir.WALL_SHOWN)
      if (this.m_Discarded[j].flags & discarded_flags.DT_REACH) {
        this.gpGeneral.TintReachTile(x, 132)
      }
    }
    this.gpGeneral.EraseArea(botDrawLoc(9), 132, TILE_WIDTH * (10 - j), TILE_HEIGHT_SHOWN)

    if (this.m_fReach) {
      this.gpGeneral.DrawDotBar(botDrawLoc(9) - 20, 99)
    } else {
      this.gpGeneral.EraseArea(botDrawLoc(9) - 20, 99, 20, 85)
    }
  }

  async Action(state: actionstate): Promise<playeraction> {
    if (this.gpGame.isPvpMode && this.gpGame.pvpManager) {
      const move = await this.gpGame.pvpManager.waitForOpponentMove(45000, this.gpGame.pvpRoundCounter)
      if (this.gpGame.abortCurrentRound) return playeraction.PA_NONE

      if (move.phase === 'TIMEOUT') {
        this.gpGame.switchToAiTakeover()
        this.gpGame.onAutoPlayTriggered?.('⚠️ 对手45秒超时未操作或已掉线，已自动由电脑 AI 托管接管继续牌局！')
        // Fall through immediately to AI Bot logic below!
      } else if (state === actionstate.AS_DRAW) {
        if (move.act === playeraction.PA_NONE) {
          return playeraction.PA_NONE
        }
        if (move.act === playeraction.PA_DRAW) {
          if (this.IsRoundDraw()) return playeraction.PA_NONE
          for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
            this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
          }
          if (move.tileCode) {
            const exact = new CTile(move.tileCode)
            if (CTile.FetchTile(exact)) {
              RandomLong(0, 100) // Advance shared PRNG in lockstep with opponent's RandomTile()
              this.m_Hand.AddTile(exact, handtile_flags.HT_JUSTGOT)
            } else {
              this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
            }
          } else {
            this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
          }
          this.m_iState &= playerstate_flags.PS_CALLREACH | playerstate_flags.PS_KONGED
          return playeraction.PA_DRAW
        } else if (move.act === playeraction.PA_PUNG) {
          if (this.m_Hand.Pung(this.m_pOpponent.LastDiscardedTile())) {
            this.m_pOpponent.m_iNumDiscarded--
            this.m_iState |= playerstate_flags.PS_ASKED
            this.gpGeneral.PlayActionVoice('pung')
            return playeraction.PA_PUNG
          }
        } else if (move.act === playeraction.PA_CHOW) {
          if (this.m_Hand.Chow(this.m_pOpponent.LastDiscardedTile(), move.chowLocation ?? 0)) {
            this.m_pOpponent.m_iNumDiscarded--
            this.m_iState |= playerstate_flags.PS_ASKED
            this.gpGeneral.PlayActionVoice('chow')
            return playeraction.PA_CHOW
          }
        } else if (move.act === playeraction.PA_KONG) {
          if (this.m_Hand.Kong(this.m_pOpponent.LastDiscardedTile(), true)) {
            this.m_pOpponent.m_iNumDiscarded--
            this.m_iState |= playerstate_flags.PS_KONGED | playerstate_flags.PS_ASKED
            this.gpGeneral.PlayActionVoice('kong')
            return playeraction.PA_KONG
          }
        } else if (move.act === playeraction.PA_MAHJONG) {
          this.m_Hand.AddTile(this.m_pOpponent.LastDiscardedTile())
          this.gpGeneral.PlayActionVoice('ron')
          return playeraction.PA_MAHJONG
        }
        return playeraction.PA_NONE
      } else {
        if (move.act === playeraction.PA_MAHJONG) {
          this.gpGeneral.PlayActionVoice('tsumo')
          return playeraction.PA_MAHJONG
        }
        if (move.act === playeraction.PA_KONG) {
          const idx = Math.min(this.m_Hand.m_iNumTiles - 1, Math.max(0, move.index ?? 0))
          const kTile = move.tileCode ? new CTile(move.tileCode) : this.m_Hand.m_Tiles[idx]?.tile
          if (kTile && this.m_Hand.Kong(kTile, false)) {
            this.m_iState |= playerstate_flags.PS_KONGED
          } else {
            // Fallback: find any valid closed/added kong in hand so phase never desyncs
            for (let k = 0; k < this.m_Hand.m_iNumTiles; k++) {
              if (this.m_Hand.m_Tiles[k].flags & handtile_flags.HT_OPEN) continue
              if (this.m_Hand.Kong(this.m_Hand.m_Tiles[k].tile, false)) {
                this.m_iState |= playerstate_flags.PS_KONGED
                break
              }
            }
          }
          this.gpGeneral.PlayActionVoice('kong')
          return playeraction.PA_KONG
        }
        let idx = Math.min(this.m_Hand.m_iNumTiles - 1, Math.max(0, move.index ?? this.m_Hand.m_iNumTiles - 1))
        if (
          (this.m_Hand.m_Tiles[idx]?.flags & handtile_flags.HT_OPEN) ||
          (move.tileCode && !this.m_Hand.m_Tiles[idx]?.tile.equals(move.tileCode))
        ) {
          let foundIdx = -1
          if (move.tileCode) {
            for (let k = this.m_Hand.m_iNumTiles - 1; k >= 0; k--) {
              if (this.m_Hand.m_Tiles[k].flags & handtile_flags.HT_OPEN) continue
              if (this.m_Hand.m_Tiles[k].tile.equals(move.tileCode)) {
                foundIdx = k
                break
              }
            }
          }
          if (foundIdx === -1) {
            for (let k = this.m_Hand.m_iNumTiles - 1; k >= 0; k--) {
              if (!(this.m_Hand.m_Tiles[k].flags & handtile_flags.HT_OPEN)) {
                foundIdx = k
                break
              }
            }
          }
          if (foundIdx >= 0) idx = foundIdx
        }
        const action = move.act === playeraction.PA_REACH ? playeraction.PA_REACH : playeraction.PA_DISCARD
        if (action === playeraction.PA_REACH) {
          this.gpGeneral.PlayBGMusic(-1)
          this.gpGeneral.PlaySound(SoundId.SND_REACH)
          this.gpGeneral.PlayActionVoice('reach')
          await this.gpGeneral.DrawDotBar(botDrawLoc(9) - 20, 99, true)
          await this.gpGeneral.UTIL_Delay(400)
          this.m_iState = playerstate_flags.PS_CALLREACH
          this.m_fReach = true
        }
        const discTile = move.tileCode ? new CTile(move.tileCode) : this.m_Hand.m_Tiles[idx].tile.clone()
        this.gpGeneral.PlayTileVoice(discTile.GetCode())
        this.m_Discarded[this.m_iNumDiscarded] = {
          tile: discTile,
          flags: action === playeraction.PA_REACH ? discarded_flags.DT_REACH : 0,
        }
        this.m_iNumDiscarded++
        if (action === playeraction.PA_REACH && this.m_pOpponent.m_iNumDiscarded > 0) {
          this.m_pOpponent.m_Discarded[this.m_pOpponent.m_iNumDiscarded - 1].flags |=
            discarded_flags.DT_OPPONENTREACH
        } else if (action !== playeraction.PA_REACH) {
          this.m_iState = 0
        }
        this.m_Hand.RemoveTile(idx)
        this.m_iLastDiscardIndex = idx
        for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
          this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
        }
        this.m_Hand.Sort()
        return action
      }
    }

    if (this.ActionIsValid(state, playeraction.PA_MAHJONG)) {
      if (state === actionstate.AS_DRAW) {
        this.m_Hand.AddTile(this.m_pOpponent.LastDiscardedTile())
        this.gpGeneral.PlayActionVoice('ron')
      } else {
        this.gpGeneral.PlayActionVoice('tsumo')
      }
      await this.gpGeneral.UTIL_Delay(500)
      return playeraction.PA_MAHJONG
    }

    if (state === actionstate.AS_DRAW) {
      await this.gpGeneral.UTIL_Delay(220)
      if (this.IsRoundDraw()) return playeraction.PA_NONE
      for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
        this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
      }
      this.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
      this.m_iState &= playerstate_flags.PS_CALLREACH | playerstate_flags.PS_KONGED
      return playeraction.PA_DRAW
    } else {
      await this.gpGeneral.UTIL_Delay(260)
      const bestIdx = this.pickBestDiscardIndex()
      let action = playeraction.PA_DISCARD

      if (!this.m_fReach && this.m_Hand.IsConcealed() && this.m_pOpponent.m_iNumDiscarded < 18) {
        const tmp = this.m_Hand.clone()
        tmp.RemoveTile(bestIdx)
        if (tmp.IsReady() && RandomLong(1, 100) < 65) {
          action = playeraction.PA_REACH
          this.gpGeneral.PlayBGMusic(-1)
          this.gpGeneral.PlaySound(SoundId.SND_REACH)
          this.gpGeneral.PlayActionVoice('reach')
          await this.gpGeneral.DrawDotBar(botDrawLoc(9) - 20, 99, true)
          await this.gpGeneral.UTIL_Delay(600)
          this.m_iState = playerstate_flags.PS_CALLREACH
          this.m_fReach = true
        }
      }

      const discTile = this.m_Hand.m_Tiles[bestIdx].tile.clone()
      this.gpGeneral.PlayTileVoice(discTile.GetCode())
      this.m_Discarded[this.m_iNumDiscarded] = {
        tile: discTile,
        flags: action === playeraction.PA_REACH ? discarded_flags.DT_REACH : 0,
      }
      this.m_iNumDiscarded++
      if (action === playeraction.PA_REACH && this.m_pOpponent.m_iNumDiscarded > 0) {
        this.m_pOpponent.m_Discarded[this.m_pOpponent.m_iNumDiscarded - 1].flags |=
          discarded_flags.DT_OPPONENTREACH
      } else if (action !== playeraction.PA_REACH) {
        this.m_iState = 0
      }

      this.m_Hand.RemoveTile(bestIdx)
      this.m_iLastDiscardIndex = bestIdx
      for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
        this.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
      }
      this.m_Hand.Sort()

      if (this.m_iLastDiscardIndex !== -1) {
        const loc = this.IndexToLoc(this.m_iLastDiscardIndex)
        if (loc >= 0) {
          this.gpGeneral.EraseArea(botDrawLoc(loc), 10, TILE_WIDTH, 80)
          await this.gpGeneral.UTIL_Delay(80)
        }
      }
      return action
    }
  }

  private pickBestDiscardIndex(): number {
    if (this.m_fReach) {
      for (let i = this.m_Hand.m_iNumTiles - 1; i >= 0; i--) {
        if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) return i
      }
      return this.m_Hand.m_iNumTiles - 1
    }

    // Score each tile by how useful it is to form pairs/melds
    let minScore = 999999
    let bestIdx = this.m_Hand.m_iNumTiles - 1

    for (let i = 0; i < this.m_Hand.m_iNumTiles; i++) {
      if (this.m_Hand.m_Tiles[i].flags & handtile_flags.HT_LOCKED) continue
      const t = this.m_Hand.m_Tiles[i].tile
      let score = 0
      for (let j = 0; j < this.m_Hand.m_iNumTiles; j++) {
        if (i === j) continue
        const o = this.m_Hand.m_Tiles[j].tile
        if (o.equals(t)) score += 300
        else if (
          o.GetSuit() === t.GetSuit() &&
          !(t.GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON))
        ) {
          const diff = Math.abs(o.GetValue() - t.GetValue())
          if (diff === 1) score += 180
          else if (diff === 2) score += 90
        }
      }
      if (!t.IsMajor()) score += 25
      if (this.gpGame.IsDora(t)) score += 150

      // Check if removing this tile makes the hand ready
      const testHand = this.m_Hand.clone()
      testHand.RemoveTile(i)
      if (testHand.IsReady()) {
        return i
      }

      if (score < minScore) {
        minScore = score
        bestIdx = i
      }
    }
    return bestIdx
  }

  public pickBestDiscardIndexPublic(): number {
    return this.pickBestDiscardIndex()
  }
}

export interface FourPlayerSeatState extends SeatPlayerInfo {
  score: number
  chips: number
  playerObj: CBasePlayer
}

export class CGame {
  public gpGeneral: CGeneral
  public m_pPlayer: CPlayer
  public m_pBot: CBot
  public m_fReachBonus: boolean = false

  public m_iRound: number = TURN_EAST
  public m_iNumDeal: number = 0
  public m_iPendingPoint: number = 0
  public m_fTurned: boolean = false
  public m_fBonusGame: boolean = false
  public m_fSanGenRush: boolean = false
  public m_iDonDen: number = 0
  public m_iTotalDonDen: number = 8
  public m_iTotalScore: number = 0
  public m_iCurGirl: number = -1
  public m_iLevelClearFlag: number = 0
  public m_Dora: CTile[] = Array.from({ length: 6 }, () => new CTile('1C'))
  public m_iKongs: number = 0

  public m_iFirstChancePercent: number = 20
  public m_iLastChancePercent: number = 30
  public m_iReachBonusPercent: number = 5
  public m_iBonusGamePercent: number = 3
  public m_iSanGenRushPercent: number = 5

  public forceNextBonusGame: boolean = false
  public forceNextSanGenRush: boolean = false
  public forceNextFirstChance: boolean = false
  public forceNextReachBonus: boolean = false

  // PVP 1v1 & 4P Multiplayer State (PRD 4.4)
  public pvpManager: PvpManager | null = null
  public isPvpMode: boolean = false
  public pvpGameMode: '2P' | '4P' = '2P'
  public allowDonden: boolean = false
  public isPvpHost: boolean = true
  public pvpRoundSeed: number = 0
  public pvpRoundCounter: number = 0
  public pvpBetChips: number = 20
  public pvpPlayerChips: number = 1000
  public pvpOpponentChips: number = 1000
  public pvpOpponentName: string = '电脑'
  public seats4P: FourPlayerSeatState[] = []
  public mySeatIndex: number = 0
  public activeTurnSeat: number = 0
  public abortCurrentRound: boolean = false

  // AI Auto-Play & Turn Countdown State
  public isAutoPlay: boolean = false
  public turnCountdown: number = 0
  public isWaitingOpponentTurn: boolean = false
  public onAutoPlayTriggered?: (reason: string) => void

  public onUIUpdate?: () => void

  toggleAutoPlay(): boolean {
    this.isAutoPlay = !this.isAutoPlay
    if (this.isAutoPlay) {
      // Unblock ReadKeyWithTimeout if currently waiting for player's action!
      const bestIdx = this.m_pPlayer.pickBestDiscardIndexPublic()
      const loc = this.m_pPlayer['IndexToLoc'](bestIdx)
      const k = loc >= 0 && loc <= 12 ? String.fromCharCode(97 + loc) : 'n'
      this.gpGeneral.pushKey(k)
    }
    this.notifyUI()
    return this.isAutoPlay
  }

  constructor(general: CGeneral) {
    this.gpGeneral = general
    this.m_pPlayer = new CPlayer(general, this)
    this.m_pBot = new CBot(general, this)
    this.m_pPlayer.m_pOpponent = this.m_pBot
    this.m_pBot.m_pOpponent = this.m_pPlayer
  }

  startPvpMatchNow(payload: StartMatchPayload, syncMoves?: PvpMovePacket[]): void {
    this.isPvpMode = true
    this.pvpGameMode = payload.gameMode || '2P'
    this.allowDonden = Boolean(payload.allowDonden)
    this.isPvpHost = this.pvpManager ? this.pvpManager.peerId === payload.hostPeerId : true
    this.pvpRoundSeed = payload.roomSeed
    this.pvpBetChips = payload.betAmount || 20
    this.pvpOpponentName = this.isPvpHost ? payload.guestName : payload.hostName
    this.m_iCurGirl = this.isPvpHost ? payload.guestGirl : payload.hostGirl
    this.clearLocalSnapshot()

    // Disable single-player queued cheats in PVP
    this.forceNextBonusGame = false
    this.forceNextSanGenRush = false
    this.forceNextFirstChance = false
    this.forceNextReachBonus = false
    this.m_fReachBonus = false

    // In PVP: fair mode disables DONDEN (0), arcade mode allows 1 DONDEN in 2P
    this.m_iTotalDonDen = this.allowDonden && this.pvpGameMode === '2P' ? 1 : 0
    this.m_iDonDen = 0

    // Setup 2P / 4P seats
    const myPeerId = this.pvpManager?.peerId || ''
    const rawSeats = payload.seats && payload.seats.length > 0
      ? payload.seats
      : [
          { seatIndex: 0, peerId: payload.hostPeerId, name: payload.hostName, girl: payload.hostGirl, isBot: false },
          { seatIndex: 1, peerId: 'guest', name: payload.guestName, girl: payload.guestGirl, isBot: false },
        ]

    const foundMySeat = rawSeats.findIndex((s) => s.peerId === myPeerId)
    this.mySeatIndex = foundMySeat >= 0 ? foundMySeat : this.isPvpHost ? 0 : 1

    this.seats4P = rawSeats.map((s, idx) => {
      const pObj: CBasePlayer = idx === this.mySeatIndex ? this.m_pPlayer : new CBot(this.gpGeneral, this)
      pObj.m_iScore = this.pvpGameMode === '4P' ? 25000 : 24000
      pObj.m_iTurn = idx === 0 ? TURN_EAST : TURN_SOUTH
      return {
        ...s,
        seatIndex: idx,
        score: this.pvpGameMode === '4P' ? 25000 : 24000,
        chips: 1000,
        playerObj: pObj,
      }
    })

    if (this.pvpGameMode === '4P') {
      // Link opponents in ring
      for (let i = 0; i < this.seats4P.length; i++) {
        const nextIdx = (i + 1) % this.seats4P.length
        this.seats4P[i].playerObj.m_pOpponent = this.seats4P[nextIdx].playerObj
      }
      const oppSeat = this.seats4P[(this.mySeatIndex + 2) % this.seats4P.length] || this.seats4P[1]
      if (oppSeat) {
        this.m_pBot = oppSeat.playerObj as CBot
        this.pvpOpponentName = oppSeat.name
        this.m_iCurGirl = oppSeat.girl
      }
    } else {
      this.m_pPlayer.m_pOpponent = this.m_pBot
      this.m_pBot.m_pOpponent = this.m_pPlayer
      this.m_pPlayer.m_iScore = 24000
      this.m_pBot.m_iScore = 24000
    }

    this.m_iNumDeal = 0
    this.pvpRoundCounter = 0
    this.m_iPendingPoint = 0
    this.abortCurrentRound = true
    this.gpGeneral.pushKey('__ABORT_ROUND__')
    if (this.pvpManager) {
      this.pvpManager.clearMoveQueue()
      if (syncMoves && syncMoves.length > 0) {
        for (const m of syncMoves) {
          this.pvpManager['moveQueue'].push(m)
        }
      }
    }
    this.notifyUI()
  }

  switchToAiTakeover(disconnectedPeerId?: string): void {
    if (!this.isPvpMode) return
    if (this.pvpGameMode === '4P' && this.seats4P.length === 4) {
      let anyHumanLeft = false
      for (const s of this.seats4P) {
        if (s.seatIndex !== this.mySeatIndex) {
          if (!disconnectedPeerId || s.peerId === disconnectedPeerId) {
            s.isBot = true
            if (!s.name.includes('AI')) s.name = `${s.name}(AI托管)`
          }
          if (!s.isBot) anyHumanLeft = true
        }
      }
      if (!anyHumanLeft) {
        // Still keep 4P table running with 3 AI bots!
      }
      if (this.pvpManager) {
        this.pvpManager.sendPvpMove({ phase: 'DRAW', act: playeraction.PA_DRAW })
      }
      this.notifyUI()
      return
    }

    this.isPvpMode = false
    this.m_iTotalDonDen = 8
    this.pvpOpponentName = '电脑(AI托管)'
    setGameSeed(null)
    if (this.pvpManager) {
      this.pvpManager.sendPvpMove({ phase: 'DRAW', act: playeraction.PA_DRAW })
    }
    this.notifyUI()
  }

  notifyUI(): void {
    if (this.onUIUpdate) this.onUIUpdate()
  }

  GetRound(): number { return this.m_iRound }
  GetCurGirl(): number { return this.m_iCurGirl }
  GetNumDeal(): number { return this.m_iNumDeal }
  GetPendingPoint(): number { return this.m_iPendingPoint }
  CanDeclareKong(): boolean { return this.m_iKongs < 4 }

  private serializePlayer(p: CBasePlayer) {
    return {
      score: p.m_iScore,
      turn: p.m_iTurn,
      reach: p.m_fReach,
      state: p.m_iState,
      numDiscarded: p.m_iNumDiscarded,
      discarded: p.m_Discarded.slice(0, p.m_iNumDiscarded).map((d) => ({
        kind: d.tile.GetKind(),
        flags: d.flags,
      })),
      numTiles: p.m_Hand.m_iNumTiles,
      tiles: p.m_Hand.m_Tiles.slice(0, p.m_Hand.m_iNumTiles).map((t) => ({
        kind: t.tile.GetKind(),
        flags: t.flags,
        tileset: t.tileset,
      })),
      numTileSets: p.m_Hand.m_iNumTileSets,
      tileSets: p.m_Hand.m_TileSets.slice(0, p.m_Hand.m_iNumTileSets).map((ts) => ({
        kind: ts.first.GetKind(),
        type: ts.type,
      })),
    }
  }

  private restorePlayer(p: CBasePlayer, data: any): void {
    p.NewRound()
    p.m_iScore = data.score ?? 10000
    p.m_iTurn = data.turn ?? TURN_EAST
    p.m_fReach = Boolean(data.reach)
    p.m_iState = data.state ?? 0
    p.m_iNumDiscarded = data.numDiscarded ?? 0
    for (let i = 0; i < p.m_iNumDiscarded && i < MAX_DISCARDED; i++) {
      p.m_Discarded[i] = {
        tile: new CTile(data.discarded[i].kind),
        flags: data.discarded[i].flags ?? 0,
      }
    }
    p.m_Hand.m_iNumTiles = data.numTiles ?? 0
    for (let i = 0; i < p.m_Hand.m_iNumTiles; i++) {
      p.m_Hand.m_Tiles[i] = {
        tile: new CTile(data.tiles[i].kind),
        flags: data.tiles[i].flags ?? 0,
        tileset: data.tiles[i].tileset ?? 0,
      }
    }
    p.m_Hand.m_iNumTileSets = data.numTileSets ?? 0
    for (let i = 0; i < p.m_Hand.m_iNumTileSets; i++) {
      p.m_Hand.m_TileSets[i] = {
        first: new CTile(data.tileSets[i].kind),
        type: data.tileSets[i].type ?? 0,
      }
    }
  }

  saveLocalSnapshot(nextTurnIsPlayer: boolean = true): void {
    if (this.isPvpMode || this.m_iCurGirl < 0) return
    try {
      const snap = {
        v: 1,
        ts: Date.now(),
        curGirl: this.m_iCurGirl,
        round: this.m_iRound,
        numDeal: this.m_iNumDeal,
        pendingPoint: this.m_iPendingPoint,
        turned: this.m_fTurned,
        donden: this.m_iDonDen,
        kongs: this.m_iKongs,
        dora: this.m_Dora.map((d) => d.GetKind()),
        remainTiles: CTile.ExportRemainTiles(),
        nextTurnIsPlayer,
        player: this.serializePlayer(this.m_pPlayer),
        bot: this.serializePlayer(this.m_pBot),
      }
      window.localStorage.setItem('weimzh_pve_snapshot_v1', JSON.stringify(snap))
    } catch {}
  }

  clearLocalSnapshot(): void {
    try {
      window.localStorage.removeItem('weimzh_pve_snapshot_v1')
    } catch {}
  }

  tryRestoreLocalSnapshot(): boolean {
    if (this.isPvpMode) return false
    try {
      const raw = window.localStorage.getItem('weimzh_pve_snapshot_v1')
      if (!raw) return false
      const snap = JSON.parse(raw)
      if (!snap || snap.v !== 1 || snap.curGirl < 0 || snap.curGirl > 3) return false
      // Expire snapshots older than 24 hours
      if (Date.now() - (snap.ts || 0) > 24 * 60 * 60 * 1000) {
        this.clearLocalSnapshot()
        return false
      }
      this.m_iCurGirl = snap.curGirl
      this.m_iRound = snap.round ?? TURN_EAST
      this.m_iNumDeal = snap.numDeal ?? 0
      this.m_iPendingPoint = snap.pendingPoint ?? 0
      this.m_fTurned = Boolean(snap.turned)
      this.m_iDonDen = snap.donden ?? 0
      this.m_iKongs = snap.kongs ?? 0
      if (Array.isArray(snap.dora) && snap.dora.length >= 6) {
        this.m_Dora = snap.dora.map((k: number) => new CTile(k))
      }
      if (snap.remainTiles) {
        CTile.ImportRemainTiles(snap.remainTiles)
      }
      this.restorePlayer(this.m_pPlayer, snap.player)
      this.restorePlayer(this.m_pBot, snap.bot)
      if (this.m_pPlayer.m_iScore <= 0 || this.m_pBot.m_iScore <= 0) {
        this.clearLocalSnapshot()
        return false
      }
      return true
    } catch {
      return false
    }
  }

  restartSinglePlayerMatch(): void {
    this.clearLocalSnapshot()
    this.isPvpMode = false
    this.m_iCurGirl = -1
    this.m_iDonDen = 0
    this.m_iTotalDonDen = 8
    this.abortCurrentRound = true
    this.gpGeneral.pushKey('__ABORT_ROUND__')
    this.notifyUI()
  }

  redrawRestoredTable(): void {
    this.gpGeneral.DrawBG(this.m_iCurGirl, 0)
    this.m_pPlayer.DrawHand()
    this.m_pPlayer.DrawDiscarded()
    this.m_pBot.DrawHand()
    this.m_pBot.DrawDiscarded()
    this.gpGeneral.DrawTiles(null, 7, 415, 215, TileDir.WALL_CONCEALED, 0)
    this.gpGeneral.DrawTiles(null, 7, 415, 200, TileDir.WALL_CONCEALED, 0)
    this.gpGeneral.DrawTiles(
      this.m_Dora,
      this.m_iKongs + 1,
      Math.floor(415 + TILE_WIDTH * 0.7 * 2),
      200,
      TileDir.WALL_SHOWN,
      0
    )
    this.gpGeneral.DrawTurn(this.m_iRound, 387, 202)
    this.DrawScore()
    this.DrawDonDen()
    this.gpGeneral.PlayBGMusic(0)
    this.notifyUI()
  }

  async RunGame(): Promise<void> {
    this.m_iTotalScore = 0
    const restoredOnBoot = !this.isPvpMode && this.m_iCurGirl === -1 && this.tryRestoreLocalSnapshot()
    let skipInitialSetup = restoredOnBoot

    while (true) {
      if (!skipInitialSetup) {
        if (this.m_iCurGirl === -1 && !this.isPvpMode) {
          await this.SelectCurGirl()
        }
        if (!this.isPvpMode) {
          this.m_iTotalDonDen = 8
          this.GameInit()
        }
      }
      while (true) {
        this.abortCurrentRound = false
        if (this.isPvpMode && this.pvpGameMode === '4P') {
          await this.NewRound4P()
          if (this.abortCurrentRound) continue
          await this.PlayRound4P()
          if (this.abortCurrentRound) continue

          const busted = this.seats4P.find((s) => s.playerObj.m_iScore <= 0)
          if (busted) {
            if (busted.seatIndex !== this.mySeatIndex) {
              await this.HighScore(3500)
            } else {
              await this.gpGeneral.GameOver(3500)
            }
            for (const s of this.seats4P) {
              s.playerObj.m_iScore = 25000
              s.score = 25000
            }
            break
          }
        } else {
          if (skipInitialSetup) {
            skipInitialSetup = false
            this.redrawRestoredTable()
          } else {
            await this.NewRound()
            if (this.abortCurrentRound) continue
            this.saveLocalSnapshot(true)
          }
          await this.PlayRound()
          if (this.abortCurrentRound) continue

          if (this.m_pPlayer.m_iScore <= 0) {
            this.clearLocalSnapshot()
            await this.gpGeneral.GameOver(this.isPvpMode ? 3500 : undefined)
            this.m_iTotalScore = 0
            if (this.isPvpMode) {
              this.m_pPlayer.m_iScore = 24000
              this.m_pBot.m_iScore = 24000
            }
            break
          } else if (this.m_pBot.m_iScore <= 0) {
            this.clearLocalSnapshot()
            this.m_iTotalScore += this.m_pPlayer.m_iScore
            if (this.isPvpMode) {
              await this.HighScore(3500)
              this.m_pPlayer.m_iScore = 24000
              this.m_pBot.m_iScore = 24000
            } else {
              await this.StageClear()
            }
            break
          }
        }
      }
    }
  }

  async SelectCurGirl(): Promise<void> {
    this.gpGeneral.DrawBG(4, 0)
    if (this.m_iLevelClearFlag === ((1 << 0) | (1 << 1) | (1 << 2) | (1 << 3))) {
      this.m_iLevelClearFlag = 0
    }

    this.gpGeneral.DrawGirl(20, 20, 280, 200, 0, this.m_iLevelClearFlag & (1 << 0) ? 0 : 1)
    this.gpGeneral.DrawGirl(340, 20, 280, 200, 1, this.m_iLevelClearFlag & (1 << 1) ? 0 : 1)
    this.gpGeneral.DrawGirl(20, 260, 280, 200, 2, this.m_iLevelClearFlag & (1 << 2) ? 0 : 1)
    this.gpGeneral.DrawGirl(340, 260, 280, 200, 3, this.m_iLevelClearFlag & (1 << 3) ? 0 : 1)

    this.gpGeneral.DrawText('A', 40, 30, 1)
    this.gpGeneral.DrawText('B', 360, 30, 1)
    this.gpGeneral.DrawText('C', 40, 270, 1)
    this.gpGeneral.DrawText('D', 360, 270, 1)
    this.gpGeneral.DrawUTF8Text(msg('girlselmsg'), 55, 225, 0, 255, 255, 0)

    this.gpGeneral.PlayBGMusic(4)
    this.notifyUI()

    while (true) {
      const key = (await this.gpGeneral.ReadKey()).toLowerCase()
      if (key === '__abort_round__') return
      if (key === 'a' && !(this.m_iLevelClearFlag & (1 << 0))) {
        this.gpGeneral.PlaySound(SoundId.SND_DING)
        this.gpGeneral.DrawGirl(20, 20, 280, 200, 0, 0)
        this.gpGeneral.DrawText('A', 40, 30, 1, 250, 250, 0)
        this.m_iCurGirl = 0
        await this.gpGeneral.UTIL_Delay(650)
        break
      } else if (key === 'b' && !(this.m_iLevelClearFlag & (1 << 1))) {
        this.gpGeneral.PlaySound(SoundId.SND_DING)
        this.gpGeneral.DrawGirl(340, 20, 280, 200, 1, 0)
        this.gpGeneral.DrawText('B', 360, 30, 1, 250, 250, 0)
        this.m_iCurGirl = 1
        await this.gpGeneral.UTIL_Delay(650)
        break
      } else if (key === 'c' && !(this.m_iLevelClearFlag & (1 << 2))) {
        this.gpGeneral.PlaySound(SoundId.SND_DING)
        this.gpGeneral.DrawGirl(20, 260, 280, 200, 2, 0)
        this.gpGeneral.DrawText('C', 40, 270, 1, 250, 250, 0)
        this.m_iCurGirl = 2
        await this.gpGeneral.UTIL_Delay(650)
        break
      } else if (key === 'd' && !(this.m_iLevelClearFlag & (1 << 3))) {
        this.gpGeneral.PlaySound(SoundId.SND_DING)
        this.gpGeneral.DrawGirl(340, 260, 280, 200, 3, 0)
        this.gpGeneral.DrawText('D', 360, 270, 1, 250, 250, 0)
        this.m_iCurGirl = 3
        await this.gpGeneral.UTIL_Delay(650)
        break
      }
    }

    this.GameInit()
    await this.gpGeneral.ScreenFade(200)
    this.notifyUI()
  }

  GameInit(): void {
    const scores = [16000, 24000, 48000, 100000]
    let cleared = 0
    for (let i = 0; i < 4; i++) {
      if (this.m_iLevelClearFlag & (1 << i)) cleared++
    }
    this.m_pPlayer.m_iScore = 10000
    this.m_pBot.m_iScore = scores[Math.min(3, cleared)]
    this.m_iRound = TURN_EAST
    this.m_iNumDeal = 0
    this.m_iPendingPoint = 0
    if (RandomLong(1, 100) > 50) {
      this.m_pPlayer.m_iTurn = TURN_EAST
      this.m_pBot.m_iTurn = TURN_SOUTH
    } else {
      this.m_pBot.m_iTurn = TURN_EAST
      this.m_pPlayer.m_iTurn = TURN_SOUTH
    }
    this.m_fTurned = false
  }

  async DonDen(): Promise<void> {
    if (
      this.m_iDonDen >= this.m_iTotalDonDen ||
      this.m_pBot.m_iNumDiscarded >= 20 ||
      this.m_pPlayer.m_iNumDiscarded >= 20
    ) {
      return
    }
    this.m_iDonDen++

    let justgot: CTile | null = null
    for (let i = 0; i < this.m_pPlayer.m_Hand.m_iNumTiles; i++) {
      if (this.m_pPlayer.m_Hand.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) {
        justgot = this.m_pPlayer.m_Hand.m_Tiles[i].tile.clone()
        this.m_pPlayer.m_Hand.RemoveTile(i)
        break
      }
    }

    const d: discarded_t[] = []
    const dis = this.m_pPlayer.m_iNumDiscarded
    for (let i = 0; i < dis; i++) {
      d[i] = { tile: this.m_pPlayer.m_Discarded[i].tile.clone(), flags: this.m_pPlayer.m_Discarded[i].flags }
    }
    this.m_pPlayer.m_iNumDiscarded = this.m_pBot.m_iNumDiscarded
    for (let i = 0; i < this.m_pBot.m_iNumDiscarded; i++) {
      this.m_pPlayer.m_Discarded[i] = {
        tile: this.m_pBot.m_Discarded[i].tile.clone(),
        flags: this.m_pBot.m_Discarded[i].flags,
      }
    }
    this.m_pBot.m_iNumDiscarded = dis
    for (let i = 0; i < dis; i++) {
      this.m_pBot.m_Discarded[i] = d[i]
    }

    const b = this.m_pPlayer.m_Hand.clone()
    this.m_pPlayer.m_Hand.copyFrom(this.m_pBot.m_Hand)
    this.m_pBot.m_Hand.copyFrom(b)

    if (justgot) {
      this.m_pPlayer.m_Hand.AddTile(justgot, handtile_flags.HT_JUSTGOT)
    }

    const r = this.m_pBot.m_fReach
    this.m_pBot.m_fReach = this.m_pPlayer.m_fReach
    this.m_pPlayer.m_fReach = r

    this.gpGeneral.EraseArea(0, 0, 640, 200)
    this.gpGeneral.EraseArea(0, 265, 640, 480 - 265)
    this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
    await this.gpGeneral.UTIL_Delay(250)

    this.gpGeneral.PlaySound(SoundId.SND_DISCARD2)
    this.m_pPlayer.DrawHand()
    this.m_pPlayer.DrawDiscarded()
    this.m_pBot.DrawHand()
    this.m_pBot.DrawDiscarded()
    this.DrawDonDen()
    this.notifyUI()
  }

  async NewRound(): Promise<void> {
    if (this.m_pBot.m_iScore < 0 || this.m_pPlayer.m_iScore < 0) {
      this.GameInit()
    }

    if (this.isPvpMode) {
      this.pvpRoundCounter++
      setGameSeed(this.pvpRoundSeed + this.pvpRoundCounter * 10007)
      const hostIsEast = this.pvpRoundCounter % 2 === 1
      this.m_pPlayer.m_iTurn = this.isPvpHost === hostIsEast ? TURN_EAST : TURN_SOUTH
      this.m_pBot.m_iTurn = this.isPvpHost === hostIsEast ? TURN_SOUTH : TURN_EAST
    } else {
      setGameSeed(null)
    }

    CTile.NewRound()
    this.m_fBonusGame = false
    if (!this.isPvpMode && (this.forceNextBonusGame || RandomLong(0, 100) < this.m_iBonusGamePercent)) {
      this.forceNextBonusGame = false
      await this.gpGeneral.BonusGame()
      this.m_fBonusGame = true
    }

    for (let i = 0; i < 6; i++) {
      this.m_Dora[i] = CTile.RandomTile()
    }
    this.m_pPlayer.NewRound()
    this.m_pBot.NewRound()

    this.m_fSanGenRush = false
    if (!this.isPvpMode && (this.forceNextSanGenRush || RandomLong(1, 100) < this.m_iSanGenRushPercent) && !this.m_fBonusGame) {
      this.forceNextSanGenRush = false
      this.m_fSanGenRush = true
      this.m_pPlayer.SanGenInit()
    }

    if (this.isPvpMode) {
      const eastPlayer = this.isPvpHost ? this.m_pPlayer : this.m_pBot
      const southPlayer = this.isPvpHost ? this.m_pBot : this.m_pPlayer
      eastPlayer.GetHand()
      southPlayer.GetHand()
      this.gpGeneral.PlayBGMusic(0)
    } else if (this.m_fBonusGame) {
      this.m_pPlayer.GetBonusHand()
      this.m_pBot.GetHand()
      this.gpGeneral.PlayBGMusic(6)
    } else {
      this.m_pPlayer.GetHand()
      this.m_pBot.GetHand()
      this.gpGeneral.PlayBGMusic(RandomLong(0, 1000) & 1)
    }

    await this.gpGeneral.DrawBGFade(this.m_iCurGirl, 1)
    if (this.abortCurrentRound) return
    await this.gpGeneral.UTIL_Delay(600)
    if (this.abortCurrentRound) return
    await this.DealTiles()
    if (this.abortCurrentRound) return

    this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
    this.m_pPlayer.m_Hand.Sort()
    this.m_pBot.m_Hand.Sort()

    this.gpGeneral.EraseArea(0, 0, 640, 18 + TILE_HEIGHT_CONCEALED)
    this.gpGeneral.EraseArea(0, 380, 640, TILE_HEIGHT_CONCEALED)
    this.gpGeneral.DrawTiles(null, 13, 72, 18, TileDir.WALL_CONCEALED)
    this.gpGeneral.DrawTiles(null, 13, 20, 396, TileDir.WALL_CONCEALED)
    await this.gpGeneral.UTIL_Delay(600)

    this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
    this.m_pPlayer.DrawHand()
    this.m_pBot.DrawHand()
    await this.gpGeneral.UTIL_Delay(600)

    this.gpGeneral.DrawBG(this.m_iCurGirl, 0)
    this.m_pPlayer.DrawHand()
    this.m_pBot.DrawHand()

    this.gpGeneral.DrawTiles(null, 7, 415, 215, TileDir.WALL_CONCEALED, 0)
    this.gpGeneral.DrawTiles(null, 7, 415, 200, TileDir.WALL_CONCEALED, 0)
    this.gpGeneral.DrawTile(this.m_Dora[0], Math.floor(415 + TILE_WIDTH * 0.7 * 2), 200, TileDir.WALL_SHOWN, 0)
    this.gpGeneral.DrawTurn(this.m_iRound, 387, 202)

    this.m_iDonDen = 0
    this.DrawScore()
    this.DrawDonDen()

    this.m_iKongs = 0
    this.m_fReachBonus = false

    if (
      !this.isPvpMode &&
      (this.forceNextReachBonus || RandomLong(0, 100) < this.m_iReachBonusPercent) &&
      !this.m_fBonusGame &&
      !this.m_fSanGenRush
    ) {
      this.forceNextReachBonus = false
      this.m_fReachBonus = true
      this.gpGeneral.DrawMessage(msg('hint_reachbonus'))
      await this.gpGeneral.WaitForAnyKey()
      this.gpGeneral.DrawMessage(null)
    }
    this.notifyUI()
  }

  async DealTiles(): Promise<void> {
    this.gpGeneral.DrawTiles(null, 10, 100, 145, TileDir.WALL_CONCEALED)
    this.gpGeneral.DrawTiles(null, 10, 100, 125, TileDir.WALL_CONCEALED)
    this.gpGeneral.DrawTiles(null, 10, 100, 250, TileDir.WALL_CONCEALED)
    this.gpGeneral.DrawTiles(null, 10, 100, 230, TileDir.WALL_CONCEALED)
    await this.gpGeneral.UTIL_Delay(350)

    let pCurrent: CBasePlayer = this.m_pPlayer.m_iTurn === TURN_EAST ? this.m_pPlayer : this.m_pBot
    for (let i = 0; i < 8; i++) {
      let t = (Math.floor(i / 2) + 1) * 4
      if (t > 13) t = 13

      if (i === 0) {
        this.gpGeneral.EraseArea(100 + TILE_WIDTH * 8, 230, TILE_WIDTH * 2, TILE_HEIGHT_WALL + 20)
      } else if (i === 1) {
        this.gpGeneral.EraseArea(100 + TILE_WIDTH * 8, 125, TILE_WIDTH * 2, TILE_HEIGHT_WALL + 20)
      } else if (i === 6) {
        this.gpGeneral.EraseArea(100 + TILE_WIDTH * 7, 125, TILE_WIDTH, TILE_HEIGHT_WALL + 20)
        this.gpGeneral.DrawTiles(null, 1, 100 + TILE_WIDTH * 7, 150, TileDir.WALL_CONCEALED)
      } else if (i === 7) {
        this.gpGeneral.EraseArea(100 + TILE_WIDTH * 7, 125, TILE_WIDTH, TILE_HEIGHT_WALL + 20)
      } else {
        this.gpGeneral.EraseArea(100 + TILE_WIDTH * (8 - i * 2 + 2), 230, TILE_WIDTH * 2, TILE_HEIGHT_WALL + 20)
      }

      pCurrent.m_Hand.m_iNumTiles = t
      pCurrent.DrawHand()
      pCurrent = pCurrent.m_pOpponent
      this.gpGeneral.PlaySound(SoundId.SND_BOOM)
      await this.gpGeneral.UTIL_Delay(160)
    }

    this.m_pBot.m_Hand.m_iNumTiles = 13
    this.m_pPlayer.m_Hand.m_iNumTiles = 13
    await this.gpGeneral.UTIL_Delay(450)

    this.gpGeneral.EraseArea(100, 125, TILE_WIDTH * 7, TILE_HEIGHT_WALL + 20)
    this.gpGeneral.DrawTiles(null, 7, 415, 215, TileDir.WALL_CONCEALED, 0)
    this.gpGeneral.DrawTiles(null, 7, 415, 200, TileDir.WALL_CONCEALED, 0)
    this.gpGeneral.PlaySound(SoundId.SND_BOOM)
    await this.gpGeneral.UTIL_Delay(450)
  }

  async PlayRound(): Promise<void> {
    let pWinner: CBasePlayer | null = null
    let pCurrent: CBasePlayer = this.m_pPlayer.m_iTurn === TURN_EAST ? this.m_pBot : this.m_pPlayer

    if (
      !this.isPvpMode &&
      (this.forceNextFirstChance || RandomLong(1, 100) < this.m_iFirstChancePercent) &&
      !this.m_fSanGenRush &&
      !this.m_fBonusGame
    ) {
      this.forceNextFirstChance = false
      await this.m_pPlayer.FirstChance()
    }

    while (pWinner === null) {
      if (this.abortCurrentRound) return
      pCurrent = pCurrent.m_pOpponent
      pCurrent.DrawHand()
      this.notifyUI()

      if (pCurrent.m_iNumDiscarded >= 20 || !this.CanDeclareKong()) {
        if ((await pCurrent.Action(actionstate.AS_DRAW)) === playeraction.PA_MAHJONG) {
          pWinner = pCurrent
          break
        }
        this.gpGeneral.PlayEndRoundMusic()
        break
      }

      while (true) {
        const act = await pCurrent.Action(actionstate.AS_DRAW)
        if (this.abortCurrentRound) return
        if (act === playeraction.PA_DRAW) {
          this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
          break
        } else if (act === playeraction.PA_KONG || act === playeraction.PA_PUNG || act === playeraction.PA_CHOW) {
          this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
          pCurrent.m_pOpponent.DrawDiscarded()
          if (act === playeraction.PA_KONG) {
            this.KongDeclared()
            continue
          }
          break
        } else if (act === playeraction.PA_MAHJONG) {
          pWinner = pCurrent
          break
        } else if (act === playeraction.PA_NONE) {
          break
        }
      }

      if (this.abortCurrentRound) return
      if (pWinner !== null) break
      pCurrent.DrawHand()
      this.notifyUI()

      while (true) {
        const act = await pCurrent.Action(actionstate.AS_DISCARD)
        if (this.abortCurrentRound) return
        if (act === playeraction.PA_DISCARD || act === playeraction.PA_REACH) {
          this.gpGeneral.PlaySound(SoundId.SND_DISCARD2)
          if (act === playeraction.PA_REACH) {
            if (pCurrent.IsBot()) {
              this.gpGeneral.PlayBGMusic(2)
            } else {
              pCurrent.DrawHand()
              pCurrent.DrawDiscarded()
              this.gpGeneral.PlayBGMusic(-1)
              await this.gpGeneral.Fire()
              this.gpGeneral.PlayBGMusic(3)
            }
            this.m_iPendingPoint += 1000
            pCurrent.m_iScore -= 1000
            this.DrawScore()
            pCurrent.m_pOpponent.DrawHand()
          }
          break
        } else if (act === playeraction.PA_KONG) {
          this.KongDeclared()
          this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
          await pCurrent.Action(actionstate.AS_DRAW)
          this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
          pCurrent.DrawHand()
        } else if (act === playeraction.PA_MAHJONG) {
          pWinner = pCurrent
          break
        }
      }

      pCurrent.DrawHand()
      pCurrent.DrawDiscarded()
      this.saveLocalSnapshot(pCurrent.IsBot())
      this.notifyUI()
    }

    if (pWinner === null && !this.isPvpMode && RandomLong(1, 100) < this.m_iLastChancePercent) {
      if (await this.m_pPlayer.LastChance()) {
        pWinner = this.m_pPlayer
      }
    }

    if (pWinner === null) {
      await this.gpGeneral.UTIL_Delay(800)
      this.m_pPlayer.DrawHand(true)
      this.m_pBot.DrawHand(true)
      this.gpGeneral.PlaySound(SoundId.SND_DISCARD2)

      const ready0 = this.m_pPlayer.m_Hand.IsReady()
      const ready1 = this.m_pBot.m_Hand.IsReady()

      this.gpGeneral.DrawUTF8Text(msg('round_draw'), 220, 190, 2, 255, 100, 255)
      await this.gpGeneral.UTIL_Delay(900)

      if (ready1) this.gpGeneral.DrawUTF8Text(msg('ready_hand'), 200, 105, 2, 255, 255, 0)
      else this.gpGeneral.DrawUTF8Text(msg('unready_hand'), 200, 105, 2, 0, 255, 255)

      if (ready0) this.gpGeneral.DrawUTF8Text(msg('ready_hand'), 200, 275, 2, 255, 255, 0)
      else this.gpGeneral.DrawUTF8Text(msg('unready_hand'), 200, 275, 2, 0, 255, 255)

      if (ready0 !== ready1 && this.CanDeclareKong()) {
        if (ready0) {
          this.m_pPlayer.m_iScore += 1000
          this.m_pBot.m_iScore -= 1000
        } else {
          this.m_pPlayer.m_iScore -= 1000
          this.m_pBot.m_iScore += 1000
        }
        await this.gpGeneral.UTIL_Delay(900)
        this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
        this.DrawScore()
      }

      if (this.m_pPlayer.m_iTurn === TURN_EAST && !ready0) {
        this.m_pPlayer.m_iTurn = TURN_SOUTH
        this.m_pBot.m_iTurn = TURN_EAST
        if (this.m_fTurned) {
          this.m_iRound ^= 1
          this.m_fTurned = false
        } else {
          this.m_fTurned = true
        }
      } else if (this.m_pBot.m_iTurn === TURN_EAST && !ready1) {
        this.m_pPlayer.m_iTurn = TURN_EAST
        this.m_pBot.m_iTurn = TURN_SOUTH
        if (this.m_fTurned) {
          this.m_iRound ^= 1
          this.m_fTurned = false
        } else {
          this.m_fTurned = true
        }
      }

      this.m_iNumDeal++
      await this.gpGeneral.UTIL_Delay(2200)
    } else {
      // Ensure winner result is calculated
      pWinner.m_Hand.GoMahjong()
      pWinner.CalcResult()

      // Play lightning win animation on both sides so both clients stay in exact lockstep timing!
      {
        const selfdrawn = pWinner.m_Result.selfdrawn
        const t = pWinner.m_Hand.m_Tiles[Math.max(0, pWinner.m_Hand.m_iNumTiles - 1)].tile.clone()
        if (!pWinner.IsBot()) {
          if (selfdrawn) {
            pWinner.m_Hand.m_iNumTiles--
            pWinner.DrawHand()
            await this.gpGeneral.AnimSelfDrawn(t)
            pWinner.m_Hand.m_iNumTiles++
          } else {
            await this.gpGeneral.AnimOut(t)
          }
        } else {
          await this.gpGeneral.AnimOut(t)
        }
        this.gpGeneral.PlayBGMusic(-1)
        await this.gpGeneral.UTIL_Delay(400)
        this.gpGeneral.PlayWinMusic()
        await this.gpGeneral.UTIL_Delay(300)
      }

      this.gpGeneral.PlaySound(SoundId.SND_DISCARD2)
      pWinner.DrawHand(true)
      if (pWinner.m_fReach) {
        this.gpGeneral.DrawTile(
          this.m_Dora[5],
          Math.floor(415 + TILE_WIDTH * 0.7 * 2),
          235,
          TileDir.WALL_SHOWN,
          0
        )
      }
      await this.gpGeneral.UTIL_Delay(2200)

      this.gpGeneral.DrawBG(this.m_iCurGirl, 1)
      pWinner.DrawHand(true)
      await this.gpGeneral.UTIL_Delay(450)
      this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
      pWinner.DrawResult()
      this.DrawScore(435, 300)
      await pWinner.AnnounceResultVoice()

      await this.gpGeneral.UTIL_Delay(1300)
      pWinner.m_iScore += pWinner.m_Result.score
      pWinner.m_pOpponent.m_iScore -= pWinner.m_Result.score
      if (this.isPvpMode) {
        const chipDelta = this.pvpBetChips * Math.max(1, pWinner.HasFan())
        if (!pWinner.IsBot()) {
          this.pvpPlayerChips += chipDelta
          this.pvpOpponentChips = Math.max(0, this.pvpOpponentChips - chipDelta)
        } else {
          this.pvpOpponentChips += chipDelta
          this.pvpPlayerChips = Math.max(0, this.pvpPlayerChips - chipDelta)
        }
      }
      this.gpGeneral.PlaySound(SoundId.SND_SOUND1)
      this.DrawScore(435, 300)
      this.notifyUI()
      await this.gpGeneral.UTIL_Delay(1300)

      if (this.m_iPendingPoint > 0) {
        pWinner.m_iScore += this.m_iPendingPoint
        this.gpGeneral.PlaySound(SoundId.SND_SOUND4)
        this.DrawScore(435, 300)
        this.m_iPendingPoint = 0
        this.notifyUI()
      }

      await this.gpGeneral.UTIL_Delay(3000)

      if (pWinner.m_iTurn !== TURN_EAST) {
        pWinner.m_iTurn = TURN_EAST
        pWinner.m_pOpponent.m_iTurn = TURN_SOUTH
        this.m_iNumDeal = 0
        if (this.m_fTurned) {
          this.m_fTurned = false
          this.m_iRound ^= 1
        } else {
          this.m_fTurned = true
        }
      } else {
        this.m_iNumDeal++
      }
    }

    await this.gpGeneral.ScreenFade(400)
  }

  async StageClear(): Promise<void> {
    this.m_iLevelClearFlag |= 1 << this.m_iCurGirl
    await this.HighScore()
    this.m_iCurGirl = -1
  }

  async HighScore(autoContinueMs?: number): Promise<void> {
    await this.gpGeneral.DrawBGFade(this.m_iCurGirl, 2)
    this.gpGeneral.PlayBGMusic(5)
    if (autoContinueMs && autoContinueMs > 0) {
      await this.gpGeneral.UTIL_Delay(autoContinueMs)
    } else {
      await this.gpGeneral.WaitForAnyKey(8000)
    }
    await this.gpGeneral.ScreenFade(400)
  }

  KongDeclared(): void {
    this.m_iKongs++
    if (this.m_iKongs > 4) this.m_iKongs = 4
    this.gpGeneral.DrawTiles(
      this.m_Dora,
      this.m_iKongs + 1,
      Math.floor(415 + TILE_WIDTH * 0.7 * 2),
      200,
      TileDir.WALL_SHOWN,
      0
    )
    const n = Math.floor((this.m_iKongs - 1) / 2) + 1
    this.gpGeneral.EraseArea(415, 200, Math.floor(TILE_WIDTH * 0.7 * n), 60)
    if (this.m_iKongs % 2) {
      this.gpGeneral.DrawTile(
        new CTile(0),
        Math.floor(415 + (n - 1) * TILE_WIDTH * 0.7),
        215,
        TileDir.WALL_CONCEALED,
        0
      )
    }
  }

  DrawScore(x: number = 10, y: number = 200): void {
    this.gpGeneral.EraseArea(x, y, 165, 52)
    this.gpGeneral.DrawUTF8Text(this.isPvpMode ? '对手' : msg('computer'), x, y, 0, 255, 255, 0)
    this.gpGeneral.DrawUTF8Text(this.m_pBot.m_iScore.toString().padStart(10, ' '), x + 20, y)
    this.gpGeneral.DrawUTF8Text(msg('player'), x, y + 24, 0, 255, 255, 0)
    this.gpGeneral.DrawUTF8Text(this.m_pPlayer.m_iScore.toString().padStart(10, ' '), x + 20, y + 24)
  }

  DrawDonDen(): void {
    this.gpGeneral.EraseArea(450, 270, 175, 55)
    if (this.m_iTotalDonDen - this.m_iDonDen <= 0) return
    this.gpGeneral.DrawText('DON', 470, 270, 0, 255, 255, 0)
    this.gpGeneral.DrawText('DEN', 480, 290, 0, 255, 255, 0)
    this.gpGeneral.DrawText(`${this.m_iTotalDonDen - this.m_iDonDen}`, 537, 275, 1, 255, 255, 255)
    this.gpGeneral.DrawUTF8Text('TIMES', 560, 290, 0, 255, 255, 0)
  }

  IsDora(t: CTile, reach: boolean = false): number {
    let d = 0
    for (let i = 0; i < this.m_iKongs + 1; i++) {
      if (this.m_Dora[i].Dora().equals(t)) d++
    }
    if (reach && this.m_Dora[5].Dora().equals(t)) d++
    return d
  }

  // =========================================================
  // 4-Player Ring Table Mahjong Engine (4P East/South/West/North)
  // =========================================================
  async NewRound4P(): Promise<void> {
    if (this.seats4P.length < 4) return
    this.pvpRoundCounter++
    setGameSeed(this.pvpRoundSeed + this.m_iNumDeal * 10007)
    CTile.NewRound()

    for (let i = 0; i < 6; i++) {
      this.m_Dora[i] = CTile.RandomTile()
    }

    const dealerSeat = this.m_iNumDeal % 4
    for (let i = 0; i < 4; i++) {
      const s = this.seats4P[i]
      s.playerObj.NewRound()
      s.playerObj.m_iTurn = i === dealerSeat ? TURN_EAST : TURN_SOUTH
      s.playerObj.GetHand()
      s.playerObj.m_Hand.Sort()
    }

    this.m_iDonDen = 0
    this.m_iKongs = 0
    this.m_fReachBonus = false
    this.activeTurnSeat = dealerSeat

    this.gpGeneral.PlayBGMusic(0)
    await this.gpGeneral.DrawBGFade(this.m_iCurGirl, 1)
    if (this.abortCurrentRound) return
    await this.gpGeneral.UTIL_Delay(350)
    if (this.abortCurrentRound) return

    this.gpGeneral.PlaySound(SoundId.SND_BOOM)
    this.DrawTable4P(dealerSeat, false)
    this.notifyUI()
  }

  DrawTable4P(activeSeat: number = 0, showAllHands: boolean = false): void {
    if (this.seats4P.length < 4) return
    this.gpGeneral.DrawBG(this.m_iCurGirl, 0)
    const ctx = this.gpGeneral.ctx

    // Relative seats from local player's perspective:
    // rel 0 = Bottom (Self), rel 1 = Right (下家), rel 2 = Top (对家), rel 3 = Left (上家)
    const seatBottom = this.seats4P[this.mySeatIndex]
    const seatRight = this.seats4P[(this.mySeatIndex + 1) % 4]
    const seatTop = this.seats4P[(this.mySeatIndex + 2) % 4]
    const seatLeft = this.seats4P[(this.mySeatIndex + 3) % 4]

    // 1. Draw Bottom (Local Player) Hand & Melds
    this.m_pPlayer.DrawHand(showAllHands)

    // Draw Bottom Discard River (centered x: 188..440, y: 282..354, 6 per row)
    for (let i = 0; i < seatBottom.playerObj.m_iNumDiscarded && i < 18; i++) {
      const col = i % 6
      const row = Math.floor(i / 6)
      const x = 194 + col * 38
      const y = 278 + row * 34
      this.gpGeneral.DrawTile(seatBottom.playerObj.m_Discarded[i].tile, x, y, TileDir.WALL_SHOWN, 0)
    }

    // 2. Draw Top (Opposite Player) Hand & Discard River
    const topP = seatTop.playerObj
    const topCount = Math.min(13, topP.m_Hand.m_iNumTiles)
    for (let i = 0; i < topCount; i++) {
      const x = 445 - i * 30
      this.gpGeneral.DrawTile(
        topP.m_Hand.m_Tiles[i].tile,
        x,
        8,
        showAllHands ? TileDir.WALL_SHOWN : TileDir.WALL_CONCEALED,
        0
      )
    }
    for (let i = 0; i < topP.m_iNumDiscarded && i < 18; i++) {
      const col = i % 6
      const row = Math.floor(i / 6)
      const x = 384 - col * 38
      const y = 112 - row * 32
      this.gpGeneral.DrawTile(topP.m_Discarded[i].tile, x, y, TileDir.WALL_SHOWN, 0)
    }

    // 3. Draw Left (上家) Vertical Hand & Discard River
    const leftP = seatLeft.playerObj
    const leftCount = Math.min(13, leftP.m_Hand.m_iNumTiles)
    for (let i = 0; i < leftCount; i++) {
      const y = 68 + i * 21
      if (showAllHands) {
        this.gpGeneral.DrawTile(leftP.m_Hand.m_Tiles[i].tile, 10, y, TileDir.WALL_SHOWN, 0)
      } else {
        this.gpGeneral.DrawTile(new CTile(0), 10, y, TileDir.WALL_CONCEALED, 0)
      }
    }
    for (let i = 0; i < leftP.m_iNumDiscarded && i < 18; i++) {
      const row = i % 6
      const col = Math.floor(i / 6)
      const x = 56 + col * 38
      const y = 115 + row * 34
      this.gpGeneral.DrawTile(leftP.m_Discarded[i].tile, x, y, TileDir.WALL_SHOWN, 0)
    }

    // 4. Draw Right (下家) Vertical Hand & Discard River
    const rightP = seatRight.playerObj
    const rightCount = Math.min(13, rightP.m_Hand.m_iNumTiles)
    for (let i = 0; i < rightCount; i++) {
      const y = 320 - i * 21
      if (showAllHands) {
        this.gpGeneral.DrawTile(rightP.m_Hand.m_Tiles[i].tile, 594, y, TileDir.WALL_SHOWN, 0)
      } else {
        this.gpGeneral.DrawTile(new CTile(0), 594, y, TileDir.WALL_CONCEALED, 0)
      }
    }
    for (let i = 0; i < rightP.m_iNumDiscarded && i < 18; i++) {
      const row = i % 6
      const col = Math.floor(i / 6)
      const x = 546 - col * 38
      const y = 285 - row * 34
      this.gpGeneral.DrawTile(rightP.m_Discarded[i].tile, x, y, TileDir.WALL_SHOWN, 0)
    }

    // 5. Draw Center 4P Compass & Scoreboard Box (x: 182, y: 152, w: 276, h: 120)
    ctx.save()
    ctx.fillStyle = 'rgba(8, 22, 18, 0.88)'
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.fillRect(182, 152, 276, 120)
    ctx.strokeRect(182, 152, 276, 120)

    const windNames = ['东', '南', '西', '北']
    const dealerSeat = this.m_iNumDeal % 4
    ctx.font = 'bold 13px "WeimzhKai", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = '#fde047'
    ctx.fillText(
      `🀄 四人麻将 · 东${(this.m_iNumDeal % 4) + 1}局 | 余牌: ${Math.max(0, CTile.TotalRemainingTiles() - 14)}`,
      192,
      171
    )

    // Draw Dora Indicator inside center box right
    ctx.fillStyle = '#94a3b8'
    ctx.font = '12px "Microsoft YaHei", sans-serif'
    ctx.fillText('宝牌:', 385, 192)
    this.gpGeneral.DrawTile(this.m_Dora[0], 418, 174, TileDir.WALL_SHOWN, 0)

    // Draw 4 Seats Status in Center Compass
    const seatCoords = [
      { seat: seatBottom, label: '下(我)', x: 192, y: 258 },
      { seat: seatRight, label: '右(下家)', x: 192, y: 238 },
      { seat: seatTop, label: '上(对家)', x: 192, y: 198 },
      { seat: seatLeft, label: '左(上家)', x: 192, y: 218 },
    ]

    for (const item of seatCoords) {
      const s = item.seat
      const isTurn = s.seatIndex === activeSeat
      const windChar = windNames[(s.seatIndex - dealerSeat + 4) % 4]
      ctx.font = isTurn ? 'bold 13px "Microsoft YaHei", sans-serif' : '12px "Microsoft YaHei", sans-serif'
      ctx.fillStyle = isTurn ? '#4ade80' : '#e2e8f0'
      const reachTag = s.playerObj.m_fReach ? ' [立直]' : ''
      const turnArrow = isTurn ? '▶ ' : '   '
      const shortName = s.name.length > 7 ? s.name.slice(0, 7) : s.name
      ctx.fillText(
        `${turnArrow}[${windChar}] ${shortName}: ${s.playerObj.m_iScore}点${reachTag}`,
        item.x,
        item.y
      )
    }
    ctx.restore()
  }

  async PlayRound4P(): Promise<void> {
    if (this.seats4P.length < 4) return
    let turnSeat = this.m_iNumDeal % 4
    let pWinnerSeat: FourPlayerSeatState | null = null
    let pLoserSeat: FourPlayerSeatState | null = null
    let isTsumo = false

    while (pWinnerSeat === null && CTile.TotalRemainingTiles() > 14) {
      if (this.abortCurrentRound) return
      const curSeatObj = this.seats4P[turnSeat]
      const curPlayer = curSeatObj.playerObj
      this.activeTurnSeat = turnSeat

      // 1. Draw Tile if not jumping from Pung/Chow
      if (!(curPlayer.m_iState & playerstate_flags.PS_ASKED)) {
        for (let i = 0; i < curPlayer.m_Hand.m_iNumTiles; i++) {
          curPlayer.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
        }
        curPlayer.m_Hand.AddRandomTile(handtile_flags.HT_JUSTGOT)
        this.gpGeneral.PlaySound(SoundId.SND_DISCARD1)
      }
      curPlayer.m_iState &= ~playerstate_flags.PS_ASKED

      this.DrawTable4P(turnSeat, false)
      this.notifyUI()

      // 2. Discard / Tsumo / Kong / Reach Decision
      let discardAct = playeraction.PA_DISCARD
      if (turnSeat === this.mySeatIndex) {
        discardAct = await this.m_pPlayer.Action(actionstate.AS_DISCARD)
        if (this.abortCurrentRound) return
      } else if (!curSeatObj.isBot && this.pvpManager) {
        const move = await this.pvpManager.waitForOpponentMove(45000, this.pvpRoundCounter)
        if (this.abortCurrentRound) return
        if (move.phase === 'TIMEOUT') {
          curSeatObj.isBot = true
          if (!curSeatObj.name.includes('AI')) curSeatObj.name = `${curSeatObj.name}(AI托管)`
          this.onAutoPlayTriggered?.(`⚠️ 玩家【${curSeatObj.name}】超时未操作，已由电脑 AI 自动接管继续对局！`)
          const bestIdx = curPlayer.pickBestDiscardIndexPublic()
          curPlayer.m_Discarded[curPlayer.m_iNumDiscarded] = {
            tile: curPlayer.m_Hand.m_Tiles[bestIdx].tile.clone(),
            flags: 0,
          }
          curPlayer.m_iNumDiscarded++
          curPlayer.m_Hand.RemoveTile(bestIdx)
          for (let i = 0; i < curPlayer.m_Hand.m_iNumTiles; i++) {
            curPlayer.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
          }
          curPlayer.m_Hand.Sort()
        } else if (move.act === playeraction.PA_MAHJONG) {
          discardAct = playeraction.PA_MAHJONG
        } else if (move.act === playeraction.PA_KONG) {
          const idx = move.index ?? 0
          if (curPlayer.m_Hand.Kong(curPlayer.m_Hand.m_Tiles[idx].tile, false)) {
            curPlayer.m_iState |= playerstate_flags.PS_KONGED
            discardAct = playeraction.PA_KONG
          }
        } else {
          const idx = Math.min(curPlayer.m_Hand.m_iNumTiles - 1, Math.max(0, move.index ?? curPlayer.m_Hand.m_iNumTiles - 1))
          discardAct = move.act === playeraction.PA_REACH ? playeraction.PA_REACH : playeraction.PA_DISCARD
          if (discardAct === playeraction.PA_REACH) {
            curPlayer.m_fReach = true
            curPlayer.m_iState = playerstate_flags.PS_CALLREACH
          }
          curPlayer.m_Discarded[curPlayer.m_iNumDiscarded] = {
            tile: curPlayer.m_Hand.m_Tiles[idx].tile.clone(),
            flags: discardAct === playeraction.PA_REACH ? discarded_flags.DT_REACH : 0,
          }
          curPlayer.m_iNumDiscarded++
          curPlayer.m_Hand.RemoveTile(idx)
          for (let i = 0; i < curPlayer.m_Hand.m_iNumTiles; i++) {
            curPlayer.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
          }
          curPlayer.m_Hand.Sort()
        }
      } else {
        // AI Bot Turn in 4P Mode (Deterministic on all clients via shared seed)
        await this.gpGeneral.UTIL_Delay(320)
        if (this.abortCurrentRound) return
        if (curPlayer.ActionIsValid(actionstate.AS_DISCARD, playeraction.PA_MAHJONG)) {
          discardAct = playeraction.PA_MAHJONG
        } else {
          const botObj = curPlayer as CBot
          const bestIdx = botObj.pickBestDiscardIndexPublic()
          if (!curPlayer.m_fReach && curPlayer.m_Hand.IsConcealed() && curPlayer.m_iNumDiscarded < 16) {
            const tmp = curPlayer.m_Hand.clone()
            tmp.RemoveTile(bestIdx)
            if (tmp.IsReady() && RandomLong(1, 100) < 65) {
              discardAct = playeraction.PA_REACH
              curPlayer.m_fReach = true
              curPlayer.m_iState = playerstate_flags.PS_CALLREACH
            }
          }
          curPlayer.m_Discarded[curPlayer.m_iNumDiscarded] = {
            tile: curPlayer.m_Hand.m_Tiles[bestIdx].tile.clone(),
            flags: discardAct === playeraction.PA_REACH ? discarded_flags.DT_REACH : 0,
          }
          curPlayer.m_iNumDiscarded++
          curPlayer.m_Hand.RemoveTile(bestIdx)
          for (let i = 0; i < curPlayer.m_Hand.m_iNumTiles; i++) {
            curPlayer.m_Hand.m_Tiles[i].flags &= ~handtile_flags.HT_JUSTGOT
          }
          curPlayer.m_Hand.Sort()
        }
      }

      if (discardAct === playeraction.PA_MAHJONG) {
        pWinnerSeat = curSeatObj
        isTsumo = true
        this.gpGeneral.PlayActionVoice('tsumo')
        break
      } else if (discardAct === playeraction.PA_KONG) {
        this.m_iKongs = Math.min(4, this.m_iKongs + 1)
        this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
        this.gpGeneral.PlayActionVoice('kong')
        continue
      } else if (discardAct === playeraction.PA_REACH) {
        this.gpGeneral.PlaySound(SoundId.SND_REACH)
        this.gpGeneral.PlayActionVoice('reach')
        curPlayer.m_iScore -= 1000
        curSeatObj.score = curPlayer.m_iScore
        this.m_iPendingPoint += 1000
      } else if (turnSeat !== this.mySeatIndex) {
        this.gpGeneral.PlayTileVoice(curPlayer.LastDiscardedTile().GetCode())
      }

      this.gpGeneral.PlaySound(SoundId.SND_DISCARD2)
      this.DrawTable4P(turnSeat, false)
      this.notifyUI()

      // 3. 4-Player Claim / Interception Window (Ron > Kong/Pung > Next-Seat Chow)
      let claimedBySeat = -1
      let claimedAct = playeraction.PA_NONE

      for (let offset = 1; offset <= 3; offset++) {
        const checkSeatIdx = (turnSeat + offset) % 4
        const checkSeatObj = this.seats4P[checkSeatIdx]
        const checkP = checkSeatObj.playerObj
        checkP.m_pOpponent = curPlayer

        const canRon = checkP.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_MAHJONG)
        const canKong = checkP.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_KONG)
        const canPung = checkP.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_PUNG)
        const canChow = offset === 1 && checkP.ActionIsValid(actionstate.AS_DRAW, playeraction.PA_CHOW)

        if (!canRon && !canKong && !canPung && !canChow) continue

        if (checkSeatIdx === this.mySeatIndex) {
          // Local player has a valid claim opportunity!
          const act = await this.m_pPlayer.Action(actionstate.AS_DRAW)
          if (this.abortCurrentRound) return
          if (act === playeraction.PA_MAHJONG || act === playeraction.PA_KONG || act === playeraction.PA_PUNG || act === playeraction.PA_CHOW) {
            claimedBySeat = checkSeatIdx
            claimedAct = act
            if (act === playeraction.PA_MAHJONG) break
          }
        } else if (checkSeatObj.isBot) {
          if (canRon) {
            checkP.m_Hand.AddTile(curPlayer.LastDiscardedTile())
            claimedBySeat = checkSeatIdx
            claimedAct = playeraction.PA_MAHJONG
            break
          }
        }
      }

      if (claimedBySeat >= 0 && claimedAct !== playeraction.PA_NONE) {
        if (claimedAct === playeraction.PA_MAHJONG) {
          pWinnerSeat = this.seats4P[claimedBySeat]
          pLoserSeat = curSeatObj
          isTsumo = false
          break
        } else if (claimedAct === playeraction.PA_KONG) {
          this.m_iKongs = Math.min(4, this.m_iKongs + 1)
          this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
          turnSeat = claimedBySeat
          continue
        } else if (claimedAct === playeraction.PA_PUNG || claimedAct === playeraction.PA_CHOW) {
          this.gpGeneral.PlaySound(SoundId.SND_SOUND3)
          turnSeat = claimedBySeat
          this.seats4P[claimedBySeat].playerObj.m_iState |= playerstate_flags.PS_ASKED
          continue
        }
      }

      turnSeat = (turnSeat + 1) % 4
    }

    // 4. 4-Player Settlement (Draw or Win)
    if (pWinnerSeat === null) {
      await this.gpGeneral.UTIL_Delay(600)
      this.DrawTable4P(turnSeat, true)
      this.gpGeneral.PlaySound(SoundId.SND_DISCARD2)
      this.gpGeneral.DrawUTF8Text(msg('round_draw'), 220, 190, 2, 255, 100, 255)
      this.m_iNumDeal++
      await this.gpGeneral.UTIL_Delay(2200)
    } else {
      const winP = pWinnerSeat.playerObj
      winP.m_Hand.GoMahjong()
      winP.CalcResult()

      if (pWinnerSeat.seatIndex === this.mySeatIndex) {
        const t = winP.m_Hand.m_Tiles[winP.m_Hand.m_iNumTiles - 1].tile.clone()
        if (isTsumo) {
          await this.gpGeneral.AnimSelfDrawn(t)
        } else {
          await this.gpGeneral.AnimOut(t)
        }
      }

      this.gpGeneral.PlayBGMusic(-1)
      this.gpGeneral.PlayWinMusic()
      this.DrawTable4P(pWinnerSeat.seatIndex, true)
      await this.gpGeneral.UTIL_Delay(2000)

      this.gpGeneral.DrawBG(pWinnerSeat.girl, 1)
      this.m_pPlayer.DrawHand(true)
      winP.DrawResult()
      winP.AnnounceResultVoice()

      const winScore = winP.m_Result.score
      const fanCount = Math.max(1, winP.HasFan())
      const chipDelta = this.pvpBetChips * fanCount

      if (isTsumo) {
        const eachPay = Math.floor(winScore / 3 / 100) * 100
        for (const s of this.seats4P) {
          if (s.seatIndex === pWinnerSeat.seatIndex) {
            s.playerObj.m_iScore += eachPay * 3 + this.m_iPendingPoint
            s.chips += chipDelta * 3
          } else {
            s.playerObj.m_iScore -= eachPay
            s.chips = Math.max(0, s.chips - chipDelta)
          }
          s.score = s.playerObj.m_iScore
        }
      } else if (pLoserSeat) {
        pWinnerSeat.playerObj.m_iScore += winScore + this.m_iPendingPoint
        pWinnerSeat.score = pWinnerSeat.playerObj.m_iScore
        pWinnerSeat.chips += chipDelta
        pLoserSeat.playerObj.m_iScore -= winScore
        pLoserSeat.score = pLoserSeat.playerObj.m_iScore
        pLoserSeat.chips = Math.max(0, pLoserSeat.chips - chipDelta)
      }

      this.m_iPendingPoint = 0
      this.pvpPlayerChips = this.seats4P[this.mySeatIndex]?.chips ?? 1000
      this.gpGeneral.PlaySound(SoundId.SND_SOUND1)
      this.notifyUI()
      await this.gpGeneral.UTIL_Delay(3200)
      this.m_iNumDeal++
    }

    await this.gpGeneral.ScreenFade(400)
  }
}
