// 1:1 Port of hand.h & hand.cpp from weimzh/mahjong
import { CTile, TileSuit } from './tile'

export enum handtile_flags {
  HT_NULL = 0,

  HT_OPENKONG = 1 << 0,
  HT_CLOSEDKONG = 1 << 1,
  HT_OPENPUNG = 1 << 2,
  HT_OPENCHOW = 1 << 3,

  HT_OPEN = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3),

  HT_CLOSEDPUNG = 1 << 4,
  HT_CLOSEDCHOW = 1 << 5,
  HT_PAIR = 1 << 6,

  HT_THIRTEENWONDERS = 1 << 7,

  HT_LOCKED = ((1 << 0) | (1 << 1) | (1 << 2) | (1 << 3)) | (1 << 4) | (1 << 5) | (1 << 6),

  HT_JUSTGOT = 1 << 8,
  HT_FROMOPPONENT = 1 << 9,
  HT_TUMO = 1 << 10,
  HT_RON = 1 << 11,

  HT_TOCHOWUPPER = 1 << 12,
  HT_TOCHOWMIDDLE = 1 << 13,
  HT_TOCHOWLOWER = 1 << 14,

  HT_TOCHOW = (1 << 12) | (1 << 13) | (1 << 14),
}

export enum chow_location {
  CHOW_LOWER = 0,
  CHOW_MIDDLE = 1,
  CHOW_UPPER = 2,
}

export interface handtile_t {
  tile: CTile
  flags: number
  tileset: number
}

export interface tileset_t {
  first: CTile
  type: number
}

export const MAX_HANDTILE = 18
export const MAX_TILESET = 7
export const MAX_CONCEALED = 14

const TTW_CODES = ['1C', '9C', '1D', '9D', '1B', '9B', 'EW', 'SW', 'WW', 'NW', 'RD', 'GD', 'WD']

export class CHand {
  public m_Tiles: handtile_t[] = []
  public m_iNumTiles: number = 0
  public m_TileSets: tileset_t[] = []
  public m_iNumTileSets: number = 0

  constructor() {
    this.NewHand()
  }

  NewHand(): void {
    this.m_iNumTiles = 0
    this.m_iNumTileSets = 0
    this.m_Tiles = Array.from({ length: MAX_HANDTILE }, () => ({
      tile: new CTile(),
      flags: 0,
      tileset: -1,
    }))
    this.m_TileSets = Array.from({ length: MAX_TILESET }, () => ({
      first: new CTile(),
      type: 0,
    }))
  }

  clone(): CHand {
    const c = new CHand()
    c.m_iNumTiles = this.m_iNumTiles
    c.m_iNumTileSets = this.m_iNumTileSets
    for (let i = 0; i < MAX_HANDTILE; i++) {
      c.m_Tiles[i] = {
        tile: this.m_Tiles[i].tile.clone(),
        flags: this.m_Tiles[i].flags,
        tileset: this.m_Tiles[i].tileset,
      }
    }
    for (let i = 0; i < MAX_TILESET; i++) {
      c.m_TileSets[i] = {
        first: this.m_TileSets[i].first.clone(),
        type: this.m_TileSets[i].type,
      }
    }
    return c
  }

  copyFrom(other: CHand): void {
    const c = other.clone()
    this.m_iNumTiles = c.m_iNumTiles
    this.m_iNumTileSets = c.m_iNumTileSets
    this.m_Tiles = c.m_Tiles
    this.m_TileSets = c.m_TileSets
  }

  Sort(): void {
    if (this.m_iNumTiles <= 1) return
    const active = this.m_Tiles.slice(0, this.m_iNumTiles)
    active.sort((a, b) => a.tile.GetKind() - b.tile.GetKind())
    for (let i = 0; i < this.m_iNumTiles; i++) {
      this.m_Tiles[i] = active[i]
    }
  }

  AddRandomTile(flag: number = 0): void {
    if (this.m_iNumTiles >= MAX_HANDTILE) return
    this.m_Tiles[this.m_iNumTiles] = {
      tile: CTile.RandomTile(),
      flags: flag,
      tileset: -1,
    }
    this.m_iNumTiles++
  }

  AddTile(t: CTile, flag: number = handtile_flags.HT_JUSTGOT, tileset: number = -1): void {
    if (this.m_iNumTiles >= MAX_HANDTILE) return
    this.m_Tiles[this.m_iNumTiles] = {
      tile: t.clone(),
      flags: flag,
      tileset,
    }
    this.m_iNumTiles++
  }

  RemoveTileByTile(t: CTile, filter: number = handtile_flags.HT_OPEN): boolean {
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & filter) continue
      if (this.m_Tiles[i].tile.equals(t)) {
        for (let j = i; j < this.m_iNumTiles - 1; j++) {
          this.m_Tiles[j] = this.m_Tiles[j + 1]
        }
        this.m_iNumTiles--
        return true
      }
    }
    return false
  }

  RemoveTile(index: number, filter: number = handtile_flags.HT_OPEN): boolean {
    if (index < 0 || index >= this.m_iNumTiles) return false
    if (this.m_Tiles[index].flags & filter) return false
    for (let j = index; j < this.m_iNumTiles - 1; j++) {
      this.m_Tiles[j] = this.m_Tiles[j + 1]
    }
    this.m_iNumTiles--
    return true
  }

  HasTile(t: CTile, filter: number = handtile_flags.HT_OPEN): boolean {
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & filter) continue
      if (this.m_Tiles[i].tile.equals(t)) return true
    }
    return false
  }

  Pung(t: CTile, open: boolean = true, flags: number = 0): boolean {
    const p: handtile_t[] = []
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue
      if (this.m_Tiles[i].tile.equals(t)) {
        p.push(this.m_Tiles[i])
        if (p.length >= (open ? 2 : 3)) break
      }
    }
    if (p.length < (open ? 2 : 3)) return false

    if (open) {
      this.m_Tiles[this.m_iNumTiles] = {
        tile: t.clone(),
        flags: handtile_flags.HT_OPENPUNG | handtile_flags.HT_FROMOPPONENT | flags,
        tileset: this.m_iNumTileSets,
      }
      this.m_iNumTiles++
    }

    p[0].flags |= (open ? handtile_flags.HT_OPENPUNG : handtile_flags.HT_CLOSEDPUNG) | flags
    p[1].flags |= (open ? handtile_flags.HT_OPENPUNG : handtile_flags.HT_CLOSEDPUNG) | flags
    p[0].tileset = p[1].tileset = this.m_iNumTileSets
    if (!open) {
      p[2].flags |= handtile_flags.HT_CLOSEDPUNG | flags
      p[2].tileset = this.m_iNumTileSets
    }

    this.m_TileSets[this.m_iNumTileSets] = {
      first: t.clone(),
      type: (open ? handtile_flags.HT_OPENPUNG : handtile_flags.HT_CLOSEDPUNG) | flags,
    }
    this.m_iNumTileSets++
    return true
  }

  Chow(t: CTile, location: number, open: boolean = true, flags: number = 0): boolean {
    if (t.GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) return false
    const to_find: number[] = [0, 0]
    switch (location) {
      case chow_location.CHOW_LOWER:
        if (t.GetValue() > 7) return false
        to_find[0] = t.GetKind() + 1
        to_find[1] = t.GetKind() + 2
        break
      case chow_location.CHOW_MIDDLE:
        if (t.GetValue() === 1 || t.GetValue() === 9) return false
        to_find[0] = t.GetKind() - 1
        to_find[1] = t.GetKind() + 1
        break
      case chow_location.CHOW_UPPER:
        if (t.GetValue() < 3) return false
        to_find[0] = t.GetKind() - 1
        to_find[1] = t.GetKind() - 2
        break
      default:
        return false
    }

    const p: (handtile_t | null)[] = [null, null, null]
    let found = 0

    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue
      for (let j = 0; j < 2; j++) {
        if (to_find[j] !== 0 && this.m_Tiles[i].tile.GetKind() === to_find[j]) {
          if (found < 2) p[found++] = this.m_Tiles[i]
          to_find[j] = 0
        }
      }
      if (!open && this.m_Tiles[i].tile.equals(t)) {
        p[2] = this.m_Tiles[i]
      }
    }

    if (found < 2 || (!open && p[2] === null)) return false

    if (open) {
      this.m_Tiles[this.m_iNumTiles] = {
        tile: t.clone(),
        tileset: this.m_iNumTileSets,
        flags: handtile_flags.HT_OPENCHOW | handtile_flags.HT_FROMOPPONENT | flags,
      }
      this.m_iNumTiles++
    }

    p[0]!.flags |= (open ? handtile_flags.HT_OPENCHOW : handtile_flags.HT_CLOSEDCHOW) | flags
    p[1]!.flags |= (open ? handtile_flags.HT_OPENCHOW : handtile_flags.HT_CLOSEDCHOW) | flags
    p[0]!.tileset = p[1]!.tileset = this.m_iNumTileSets
    if (!open && p[2]) {
      p[2].flags |= handtile_flags.HT_CLOSEDCHOW | flags
      p[2].tileset = this.m_iNumTileSets
    }

    let firstKind = t.GetKind()
    if (location === chow_location.CHOW_MIDDLE) firstKind = t.GetKind() - 1
    else if (location === chow_location.CHOW_UPPER) firstKind = t.GetKind() - 2

    this.m_TileSets[this.m_iNumTileSets] = {
      first: new CTile(firstKind),
      type: (open ? handtile_flags.HT_OPENCHOW : handtile_flags.HT_CLOSEDCHOW) | flags,
    }
    this.m_iNumTileSets++
    return true
  }

  Kong(t: CTile, open: boolean = true, flags: number = 0): boolean {
    const p: handtile_t[] = []
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue
      if (this.m_Tiles[i].tile.equals(t)) {
        p.push(this.m_Tiles[i])
        if (p.length >= (open ? 3 : 4)) break
      }
    }

    if (p.length < (open ? 3 : 4)) {
      if (!open && p.length > 0) {
        for (let i = 0; i < this.m_iNumTileSets; i++) {
          if (this.m_TileSets[i].first.equals(t) && (this.m_TileSets[i].type & handtile_flags.HT_OPENPUNG)) {
            this.m_TileSets[i].type = handtile_flags.HT_OPENKONG | flags
            p[0].flags |= handtile_flags.HT_OPENKONG | flags
            for (let k = 0; k < this.m_iNumTiles; k++) {
              if (!(this.m_Tiles[k].flags & handtile_flags.HT_OPENPUNG)) continue
              if (this.m_Tiles[k].tile.equals(t)) {
                this.m_Tiles[k].flags |= handtile_flags.HT_OPENKONG | flags
                this.m_Tiles[k].flags &= ~handtile_flags.HT_OPENPUNG
              }
            }
            return true
          }
        }
      }
      return false
    }

    if (open) {
      this.m_Tiles[this.m_iNumTiles] = {
        tile: t.clone(),
        flags: (open ? handtile_flags.HT_OPENKONG : handtile_flags.HT_CLOSEDKONG) | handtile_flags.HT_FROMOPPONENT | flags,
        tileset: this.m_iNumTileSets,
      }
      this.m_iNumTiles++
    }

    const kflag = (open ? handtile_flags.HT_OPENKONG : handtile_flags.HT_CLOSEDKONG) | flags
    p[0].flags |= kflag
    p[1].flags |= kflag
    p[2].flags |= kflag
    p[0].tileset = p[1].tileset = p[2].tileset = this.m_iNumTileSets
    if (!open) {
      p[3].flags |= handtile_flags.HT_CLOSEDKONG | flags
      p[3].tileset = this.m_iNumTileSets
    }

    this.m_TileSets[this.m_iNumTileSets] = {
      first: t.clone(),
      type: kflag,
    }
    this.m_iNumTileSets++
    return true
  }

  CanPung(t: CTile): boolean {
    let count = 0
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue
      if (this.m_Tiles[i].tile.equals(t)) count++
    }
    return count >= 2
  }

  CanChow(t: CTile, location: number): boolean {
    if (t.GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) return false
    let f0 = 0
    let f1 = 0
    switch (location) {
      case chow_location.CHOW_LOWER:
        if (t.GetValue() > 7) return false
        f0 = t.GetKind() + 1
        f1 = t.GetKind() + 2
        break
      case chow_location.CHOW_MIDDLE:
        if (t.GetValue() === 1 || t.GetValue() === 9) return false
        f0 = t.GetKind() - 1
        f1 = t.GetKind() + 1
        break
      case chow_location.CHOW_UPPER:
        if (t.GetValue() < 3) return false
        f0 = t.GetKind() - 1
        f1 = t.GetKind() - 2
        break
      default:
        return false
    }
    return this.HasTile(new CTile(f0)) && this.HasTile(new CTile(f1))
  }

  CanKong(t: CTile, open: boolean = true): boolean {
    let count = 0
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue
      if (this.m_Tiles[i].tile.equals(t)) count++
    }
    if (count >= (open ? 3 : 4)) return true
    if (!open) {
      for (let i = 0; i < this.m_iNumTileSets; i++) {
        if ((this.m_TileSets[i].type & handtile_flags.HT_OPENPUNG) && this.m_TileSets[i].first.equals(t)) {
          return true
        }
      }
    }
    return false
  }

  CanMahjong(t: CTile): boolean {
    const tmp = this.clone()
    tmp.AddTile(t)
    return tmp.GoMahjong_real()
  }

  GoMahjong(opponentTile?: CTile): boolean {
    if (opponentTile !== undefined) {
      return this.GoMahjongWithTile(opponentTile)
    }
    let i = this.m_iNumTiles - 1
    for (; i >= 0; i--) {
      if ((this.m_Tiles[i].flags & handtile_flags.HT_JUSTGOT) === 0) continue

      let tmp = this.clone()
      if (tmp.Pung(this.m_Tiles[i].tile, false, handtile_flags.HT_TUMO)) {
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
      }

      tmp = this.clone()
      if (tmp.Chow(this.m_Tiles[i].tile, chow_location.CHOW_LOWER, false, handtile_flags.HT_TUMO)) {
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
      }

      tmp = this.clone()
      if (tmp.Chow(this.m_Tiles[i].tile, chow_location.CHOW_UPPER, false, handtile_flags.HT_TUMO)) {
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
      }

      tmp = this.clone()
      if (tmp.Chow(this.m_Tiles[i].tile, chow_location.CHOW_MIDDLE, false, handtile_flags.HT_TUMO)) {
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
      }

      tmp = this.clone()
      for (let j = 0; j < this.m_iNumTiles; j++) {
        if (j === i) continue
        if (this.m_Tiles[j].tile.equals(this.m_Tiles[i].tile)) {
          tmp.m_Tiles[i].flags |= handtile_flags.HT_PAIR
          tmp.m_Tiles[j].flags |= handtile_flags.HT_PAIR
          tmp.m_Tiles[i].tileset = tmp.m_Tiles[j].tileset = tmp.m_iNumTileSets
          tmp.m_TileSets[tmp.m_iNumTileSets] = {
            first: tmp.m_Tiles[i].tile.clone(),
            type: handtile_flags.HT_PAIR | handtile_flags.HT_TUMO,
          }
          tmp.m_iNumTileSets++
          if (tmp.GoMahjong_real()) {
            this.copyFrom(tmp)
            return true
          }
          break
        }
      }
      break
    }

    if (i < 0) {
      return this.GoMahjong_real()
    }

    if (this.ThirteenWonders()) return true
    if (this.SevenPairs()) return true
    return false
  }

  private GoMahjongWithTile(t: CTile): boolean {
    let tmp = this.clone()
    if (tmp.Pung(t, true, handtile_flags.HT_RON)) {
      if (tmp.GoMahjong_real()) {
        this.copyFrom(tmp)
        return true
      }
    }

    tmp = this.clone()
    if (tmp.Chow(t, chow_location.CHOW_LOWER, true, handtile_flags.HT_RON)) {
      if (tmp.GoMahjong_real()) {
        this.copyFrom(tmp)
        return true
      }
    }

    tmp = this.clone()
    if (tmp.Chow(t, chow_location.CHOW_UPPER, true, handtile_flags.HT_RON)) {
      if (tmp.GoMahjong_real()) {
        this.copyFrom(tmp)
        return true
      }
    }

    tmp = this.clone()
    if (tmp.Chow(t, chow_location.CHOW_MIDDLE, true, handtile_flags.HT_RON)) {
      if (tmp.GoMahjong_real()) {
        this.copyFrom(tmp)
        return true
      }
    }

    tmp = this.clone()
    for (let j = 0; j < this.m_iNumTiles; j++) {
      if (this.m_Tiles[j].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue
      if (this.m_Tiles[j].tile.equals(t)) {
        tmp.AddTile(t, handtile_flags.HT_PAIR | handtile_flags.HT_RON | handtile_flags.HT_FROMOPPONENT, tmp.m_iNumTileSets)
        tmp.m_Tiles[j].flags |= handtile_flags.HT_PAIR | handtile_flags.HT_RON
        tmp.m_Tiles[j].tileset = tmp.m_iNumTileSets
        tmp.m_TileSets[tmp.m_iNumTileSets] = {
          first: tmp.m_Tiles[j].tile.clone(),
          type: handtile_flags.HT_PAIR | handtile_flags.HT_RON,
        }
        tmp.m_iNumTileSets++
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
        break
      }
    }

    tmp = this.clone()
    tmp.AddTile(t, handtile_flags.HT_FROMOPPONENT)
    if (tmp.ThirteenWonders()) {
      this.copyFrom(tmp)
      return true
    }
    if (tmp.SevenPairs()) {
      this.copyFrom(tmp)
      return true
    }
    return false
  }

  GoMahjong_real(): boolean {
    let concealed = 0
    const t: (handtile_t | null)[] = [null, null]

    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue

      let tmp = this.clone()
      if (tmp.Pung(this.m_Tiles[i].tile, false)) {
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
      }

      tmp = this.clone()
      if (tmp.Chow(this.m_Tiles[i].tile, chow_location.CHOW_LOWER, false)) {
        if (tmp.GoMahjong_real()) {
          this.copyFrom(tmp)
          return true
        }
      }

      if (concealed < 2) t[concealed] = this.m_Tiles[i]
      concealed++
    }

    if (concealed === 2 && t[0] && t[1] && t[0].tile.equals(t[1].tile)) {
      t[0].flags |= handtile_flags.HT_PAIR
      t[1].flags |= handtile_flags.HT_PAIR
      t[0].tileset = t[1].tileset = this.m_iNumTileSets
      this.m_TileSets[this.m_iNumTileSets] = {
        first: t[0].tile.clone(),
        type: handtile_flags.HT_PAIR,
      }
      this.m_iNumTileSets++
      return true
    } else if (concealed === 0) {
      return true
    }

    if (this.ThirteenWonders()) return true
    if (this.SevenPairs()) return true
    return false
  }

  ThirteenWonders(): boolean {
    let havetwo = false
    for (let j = 0; j < this.m_iNumTiles; j++) {
      if (!this.m_Tiles[j].tile.IsMajor()) return false
    }
    for (let i = 0; i < 13; i++) {
      let count = 0
      const target = new CTile(TTW_CODES[i])
      for (let j = 0; j < this.m_iNumTiles; j++) {
        if (this.m_Tiles[j].tile.equals(target)) count++
      }
      if (count <= 0 || count > 2) return false
      if (count === 2) {
        if (havetwo) return false
        havetwo = true
      }
    }
    if (havetwo) {
      for (let i = 0; i < this.m_iNumTiles; i++) {
        this.m_Tiles[i].flags |= handtile_flags.HT_THIRTEENWONDERS
      }
      return true
    }
    return false
  }

  SevenPairs(): boolean {
    if (this.m_iNumTiles <= 0) return true
    if (this.m_iNumTileSets > 0) return false

    const tmp = this.clone()
    const t = this.m_Tiles[0].tile.clone()
    if (tmp.Pung(t, false)) return false

    tmp.RemoveTileByTile(t)
    if (tmp.RemoveTileByTile(t)) {
      if (tmp.SevenPairs()) {
        for (let i = 0; i < this.m_iNumTiles; i++) {
          this.m_Tiles[i].flags |= handtile_flags.HT_PAIR
        }
        return true
      }
    }
    return false
  }

  IsReady(): boolean {
    let concealed = 0
    const t: CTile[] = []

    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue

      let tmp = this.clone()
      if (tmp.Pung(this.m_Tiles[i].tile, false)) {
        if (tmp.IsReady()) return true
      }

      tmp = this.clone()
      if (tmp.Chow(this.m_Tiles[i].tile, chow_location.CHOW_LOWER, false)) {
        if (tmp.IsReady()) return true
      }

      t[concealed++] = this.m_Tiles[i].tile.clone()
    }

    if (concealed === 1) {
      return true
    } else if (concealed === 4) {
      let m = 0
      let n = 0
      let foundPair = false
      for (m = 0; m < 4; m++) {
        for (n = m + 1; n < 4; n++) {
          if (t[m].equals(t[n])) {
            foundPair = true
            break
          }
        }
        if (foundPair) break
      }
      if (!foundPair) return false

      const other: number[] = []
      for (let i = 0; i < 4; i++) {
        if (i !== m && i !== n) other.push(i)
      }
      if (t[other[0]].GetSuit() !== t[other[1]].GetSuit()) return false
      const d = Math.abs(t[other[0]].GetValue() - t[other[1]].GetValue())
      if (d === 0) return true
      if (t[other[0]].GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) return false
      return d >= 0 && d < 3
    }

    if (this.IsThirteenWondersReady()) return true
    if (this.IsSevenPairsReady()) return true
    return false
  }

  IsThirteenWondersReady(): boolean {
    let havetwo = false
    for (let j = 0; j < this.m_iNumTiles; j++) {
      if (!this.m_Tiles[j].tile.IsMajor()) return false
    }
    for (let i = 0; i < 13; i++) {
      let count = 0
      const target = new CTile(TTW_CODES[i])
      for (let j = 0; j < this.m_iNumTiles; j++) {
        if (this.m_Tiles[j].tile.equals(target)) count++
      }
      if (count > 2) return false
      else if (count === 2) {
        if (havetwo) return false
        havetwo = true
      }
    }
    return true
  }

  IsSevenPairsReady(): boolean {
    if (this.m_iNumTiles <= 1) return true
    if (this.m_iNumTileSets > 0) return false

    let tmp = this.clone()
    let t = this.m_Tiles[0].tile.clone()
    tmp.RemoveTileByTile(t)
    if (tmp.RemoveTileByTile(t)) {
      if (tmp.RemoveTileByTile(t)) return false
    } else {
      t = this.m_Tiles[1].tile.clone()
      tmp = this.clone()
      tmp.RemoveTileByTile(t)
      if (tmp.RemoveTileByTile(t)) {
        if (tmp.RemoveTileByTile(t)) return false
      } else {
        return false
      }
    }
    return tmp.IsSevenPairsReady()
  }

  GetWaitingTile(tiles: CTile[], max: number = 13): number {
    const state = { current: 0 }
    return this.GetWaitingTile_real(tiles, max, state)
  }

  private addWaitingUnique(tiles: CTile[], max: number, state: { current: number }, tile: CTile): void {
    for (let j = 0; j < state.current; j++) {
      if (tiles[j].equals(tile)) return
    }
    if (state.current < max) {
      tiles[state.current++] = tile.clone()
    }
  }

  private GetWaitingTile_real(tiles: CTile[], max: number, state: { current: number }): number {
    let concealed = 0
    const t: CTile[] = []

    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (this.m_Tiles[i].flags & (handtile_flags.HT_LOCKED | handtile_flags.HT_TOCHOW)) continue

      let tmp = this.clone()
      if (tmp.Pung(this.m_Tiles[i].tile, false)) {
        tmp.GetWaitingTile_real(tiles, max, state)
      }

      tmp = this.clone()
      if (tmp.Chow(this.m_Tiles[i].tile, chow_location.CHOW_LOWER, false)) {
        tmp.GetWaitingTile_real(tiles, max, state)
      }

      t[concealed++] = this.m_Tiles[i].tile.clone()
    }

    if (concealed === 1) {
      this.addWaitingUnique(tiles, max, state, t[0])
    } else if (concealed === 4) {
      let m = 0
      let n = 0
      let foundPair = false
      for (m = 0; m < 4; m++) {
        for (n = m + 1; n < 4; n++) {
          if (t[m].equals(t[n])) {
            foundPair = true
            break
          }
        }
        if (foundPair) break
      }
      if (foundPair) {
        const other: number[] = []
        for (let i = 0; i < 4; i++) {
          if (i !== m && i !== n) other.push(i)
        }
        if (t[other[0]].GetSuit() === t[other[1]].GetSuit()) {
          if (t[other[0]].GetValue() > t[other[1]].GetValue()) {
            const temp = other[0]
            other[0] = other[1]
            other[1] = temp
          }
          const d = t[other[1]].GetValue() - t[other[0]].GetValue()
          if (d === 0) {
            this.addWaitingUnique(tiles, max, state, t[other[0]])
          } else if (d === 1) {
            if ((t[other[0]].GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) === 0) {
              if (t[other[0]].GetValue() > 1) {
                this.addWaitingUnique(tiles, max, state, new CTile(t[other[0]].GetKind() - 1))
              }
              if (t[other[1]].GetValue() < 9) {
                this.addWaitingUnique(tiles, max, state, new CTile(t[other[1]].GetKind() + 1))
              }
            }
          } else if (d === 2) {
            if ((t[other[0]].GetSuit() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) === 0) {
              this.addWaitingUnique(tiles, max, state, new CTile(t[other[0]].GetKind() + 1))
            }
          }
        }
      }
    }

    if (state.current <= 0) {
      this.GetThirteenWondersWaitingTile(tiles, max, state)
    }
    if (state.current <= 0) {
      this.GetSevenPairsWaitingTile(tiles, max, state)
    }
    return state.current
  }

  private GetThirteenWondersWaitingTile(tiles: CTile[], max: number, state: { current: number }): number {
    let zero = -1
    let havetwo = false
    for (let i = 0; i < this.m_iNumTiles; i++) {
      if (!this.m_Tiles[i].tile.IsMajor()) return state.current
    }
    for (let i = 0; i < 13; i++) {
      let count = 0
      const target = new CTile(TTW_CODES[i])
      for (let j = 0; j < this.m_iNumTiles; j++) {
        if (this.m_Tiles[j].tile.equals(target)) count++
      }
      if (count > 2) return state.current
      else if (count === 2) {
        if (havetwo) return state.current
        havetwo = true
      } else if (count === 0) {
        zero = i
      }
    }
    if (!havetwo) {
      for (let i = 0; i < 13; i++) {
        if (state.current < max) tiles[state.current++] = new CTile(TTW_CODES[i])
      }
    } else if (zero !== -1) {
      if (state.current < max) tiles[state.current++] = new CTile(TTW_CODES[zero])
    }
    return state.current
  }

  private GetSevenPairsWaitingTile(tiles: CTile[], max: number, state: { current: number }): number {
    if (this.m_iNumTiles < 1) return state.current
    if (this.m_iNumTiles === 1) {
      if (state.current < max) tiles[state.current++] = this.m_Tiles[0].tile.clone()
      return state.current
    }
    if (this.m_iNumTileSets > 0) return state.current

    let tmp = this.clone()
    let t = this.m_Tiles[0].tile.clone()
    tmp.RemoveTileByTile(t)
    if (tmp.RemoveTileByTile(t)) {
      if (tmp.RemoveTileByTile(t)) return state.current
    } else {
      t = this.m_Tiles[1].tile.clone()
      tmp = this.clone()
      tmp.RemoveTileByTile(t)
      if (tmp.RemoveTileByTile(t)) {
        if (tmp.RemoveTileByTile(t)) return state.current
      } else {
        return state.current
      }
    }
    return tmp.GetSevenPairsWaitingTile(tiles, max, state)
  }

  IsConcealed(): boolean {
    for (let i = 0; i < this.m_iNumTileSets; i++) {
      if (this.m_TileSets[i].type & (handtile_flags.HT_OPEN & ~handtile_flags.HT_CLOSEDKONG)) {
        if (this.m_TileSets[i].type & handtile_flags.HT_RON) continue
        return false
      }
    }
    return true
  }

  Restore(): void {
    let n = 0
    const flag =
      handtile_flags.HT_CLOSEDPUNG |
      handtile_flags.HT_CLOSEDCHOW |
      handtile_flags.HT_PAIR |
      handtile_flags.HT_THIRTEENWONDERS

    for (let i = 0; i < this.m_iNumTiles; i++) {
      this.m_Tiles[i].flags &= ~flag
    }
    for (let i = 0; i < this.m_iNumTileSets; i++) {
      if (this.m_TileSets[i].type & flag) continue
      this.m_TileSets[n++] = this.m_TileSets[i]
    }
    this.m_iNumTileSets = n
  }
}
