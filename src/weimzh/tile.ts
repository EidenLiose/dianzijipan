// 1:1 Port of tile.h & tile.cpp from weimzh/mahjong
import { RandomLong, log2Int } from './titles'

export enum TileSuit {
  TILESUIT_CHAR = 1 << 4,
  TILESUIT_CIRCLE = 1 << 5,
  TILESUIT_BAMBOO = 1 << 6,
  TILESUIT_WIND = 1 << 7,
  TILESUIT_DRAGON = 1 << 8,
}

export enum Winds {
  EASTWIND = 1,
  SOUTHWIND = 2,
  WESTWIND = 3,
  NORTHWIND = 4,
}

export enum Dragons {
  WHITEDRAGON = 1,
  GREENDRAGON = 2,
  REDDRAGON = 3,
}

const RemainTiles: number[][] = Array.from({ length: 5 }, () => Array(9).fill(0))

const chartiles = ['1C', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C']
const dottiles = ['1D', '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D']
const bamtiles = ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B']

export class CTile {
  public m_iKind: number = -1

  constructor(arg1?: number | string | CTile, arg2?: number) {
    if (arg1 === undefined) {
      this.m_iKind = -1
    } else if (arg1 instanceof CTile) {
      this.m_iKind = arg1.m_iKind
    } else if (typeof arg1 === 'number' && arg2 !== undefined) {
      this.m_iKind = arg1 | arg2
    } else if (typeof arg1 === 'number') {
      this.m_iKind = arg1
    } else if (typeof arg1 === 'string') {
      this.SetKind(arg1)
    }
  }

  clone(): CTile {
    return new CTile(this.m_iKind)
  }

  GetKind(): number {
    return this.m_iKind
  }

  GetSuit(): number {
    let suit = this.GetKind()
    for (let i = 0; i < 4; i++) {
      suit &= ~(1 << i)
    }
    return suit
  }

  GetValue(): number {
    return this.m_iKind & 0x0f
  }

  GetCode(): string {
    const suit = this.GetSuit()
    const val = this.GetValue()
    if (suit === TileSuit.TILESUIT_CHAR) {
      return chartiles[val - 1] || '1C'
    } else if (suit === TileSuit.TILESUIT_BAMBOO) {
      return bamtiles[val - 1] || '1B'
    } else if (suit === TileSuit.TILESUIT_CIRCLE) {
      return dottiles[val - 1] || '1D'
    } else if (suit === TileSuit.TILESUIT_WIND) {
      switch (val) {
        case Winds.EASTWIND: return 'EW'
        case Winds.SOUTHWIND: return 'SW'
        case Winds.WESTWIND: return 'WW'
        case Winds.NORTHWIND: return 'NW'
      }
    } else if (suit === TileSuit.TILESUIT_DRAGON) {
      switch (val) {
        case Dragons.REDDRAGON: return 'RD'
        case Dragons.GREENDRAGON: return 'GD'
        case Dragons.WHITEDRAGON: return 'WD'
      }
    }
    return 'XX'
  }

  SetKind(code: string): void {
    const c0 = code.charAt(0)
    const c1 = code.charAt(1).toUpperCase()
    if (c0 >= '0' && c0 <= '9') {
      this.m_iKind = parseInt(c0, 10)
      if (c1 === 'B') this.m_iKind |= TileSuit.TILESUIT_BAMBOO
      else if (c1 === 'C') this.m_iKind |= TileSuit.TILESUIT_CHAR
      else if (c1 === 'D') this.m_iKind |= TileSuit.TILESUIT_CIRCLE
    } else {
      const u0 = c0.toUpperCase()
      if (c1 === 'W') {
        if (u0 === 'E') this.m_iKind = Winds.EASTWIND
        else if (u0 === 'S') this.m_iKind = Winds.SOUTHWIND
        else if (u0 === 'W') this.m_iKind = Winds.WESTWIND
        else if (u0 === 'N') this.m_iKind = Winds.NORTHWIND
        this.m_iKind |= TileSuit.TILESUIT_WIND
      } else if (c1 === 'D') {
        if (u0 === 'R') this.m_iKind = Dragons.REDDRAGON
        else if (u0 === 'G') this.m_iKind = Dragons.GREENDRAGON
        else if (u0 === 'W') this.m_iKind = Dragons.WHITEDRAGON
        this.m_iKind |= TileSuit.TILESUIT_DRAGON
      }
    }
  }

  equals(a: CTile | number | string): boolean {
    if (typeof a === 'number') return this.m_iKind === a
    if (typeof a === 'string') return this.m_iKind === new CTile(a).m_iKind
    return this.m_iKind === a.m_iKind
  }

  IsMajor(): boolean {
    return (
      (this.GetKind() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) !== 0 ||
      this.GetValue() === 1 ||
      this.GetValue() === 9
    )
  }

  IsNumMajor(): boolean {
    return (
      (this.GetKind() & (TileSuit.TILESUIT_WIND | TileSuit.TILESUIT_DRAGON)) === 0 &&
      (this.GetValue() === 1 || this.GetValue() === 9)
    )
  }

  IsMinor(): boolean {
    return !this.IsMajor()
  }

  Dora(): CTile {
    if (this.GetSuit() === TileSuit.TILESUIT_DRAGON) {
      switch (this.GetValue()) {
        case Dragons.REDDRAGON:
          return new CTile(this.GetSuit() | Dragons.WHITEDRAGON)
        case Dragons.WHITEDRAGON:
          return new CTile(this.GetSuit() | Dragons.GREENDRAGON)
        case Dragons.GREENDRAGON:
          return new CTile(this.GetSuit() | Dragons.REDDRAGON)
      }
    } else {
      let v = this.GetValue() + 1
      if (v > 9 || (this.GetSuit() === TileSuit.TILESUIT_WIND && v > 4)) {
        v = 1
      }
      return new CTile(this.GetSuit() | v)
    }
    return new CTile('1C')
  }

  index1(): number {
    return log2Int(this.GetSuit() >> 4)
  }

  index2(): number {
    return this.GetValue() - 1
  }

  static NewRound(): void {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 9; j++) {
        RemainTiles[i][j] = 4
      }
    }
    for (let i = 4; i < 9; i++) {
      RemainTiles[3][i] = 0
    }
    for (let i = 3; i < 9; i++) {
      RemainTiles[4][i] = 0
    }
  }

  static RandomTile(): CTile {
    const wall: CTile[] = []
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 9; j++) {
        for (let k = 0; k < RemainTiles[i][j]; k++) {
          const suit = (1 << 4) << i
          const value = j + 1
          wall.push(new CTile(suit | value))
        }
      }
    }
    if (wall.length <= 0) {
      return new CTile('1C')
    }
    const idx = RandomLong(0, wall.length - 1)
    const got = wall[idx]
    RemainTiles[got.index1()][got.index2()] -= 1
    return got.clone()
  }

  static RemainingTile(t: CTile): number {
    const i1 = t.index1()
    const i2 = t.index2()
    if (i1 < 0 || i1 >= 5 || i2 < 0 || i2 >= 9) return 0
    return RemainTiles[i1][i2]
  }

  static FetchTile(t: CTile): boolean {
    const i1 = t.index1()
    const i2 = t.index2()
    if (i1 < 0 || i1 >= 5 || i2 < 0 || i2 >= 9) return false
    if (RemainTiles[i1][i2] <= 0) return false
    RemainTiles[i1][i2] -= 1
    return true
  }

  static ReturnTile(t: CTile): void {
    const i1 = t.index1()
    const i2 = t.index2()
    if (i1 >= 0 && i1 < 5 && i2 >= 0 && i2 < 9) {
      RemainTiles[i1][i2] += 1
    }
  }
}
