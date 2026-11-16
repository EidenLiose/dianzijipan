// Two-Player Riichi Mahjong Engine for Denshi Kiban Reborn
export interface Tile {
  id: string   // e.g. '1m', '9p', '1s', '7z'
  type: 'm' | 'p' | 's' | 'z'
  value: number
}

export class MahjongEngine {
  public wall: Tile[] = []
  public playerHand: Tile[] = []
  public opponentHandCount: number = 13
  public discards: Tile[] = []
  public opponentDiscards: Tile[] = []
  public doraIndicator: Tile = { id: '2p', type: 'p', value: 2 }
  public drawnTile: Tile | null = null
  public isPlayerTurn: boolean = true

  constructor() {
    this.initGame()
  }

  initGame() {
    this.wall = this.generateDeck()
    this.shuffle(this.wall)
    this.playerHand = this.wall.splice(0, 13)
    this.sortHand(this.playerHand)
    this.opponentHandCount = 13
    this.doraIndicator = this.wall.pop() || { id: '2p', type: 'p', value: 2 }
    
    // Seed initial river discards for authentic Denshi Kiban look
    this.discards = [
      { id: '4z', type: 'z', value: 4 }, // North
      { id: '3z', type: 'z', value: 3 }, // West
      { id: '3m', type: 'm', value: 3 }, // 3 Man
      { id: '3p', type: 'p', value: 3 }, // 3 Pin
      { id: '4m', type: 'm', value: 4 }, // 4 Man
      { id: '8p', type: 'p', value: 8 }, // 8 Pin
    ]
    this.opponentDiscards = [
      { id: '7p', type: 'p', value: 7 }, // 7 Pin
      { id: '6s', type: 's', value: 6 }, // 6 Sou
      { id: '3s', type: 's', value: 3 }, // 3 Sou
      { id: '8s', type: 's', value: 8 }, // 8 Sou
      { id: '2p', type: 'p', value: 2 }, // 2 Pin
      { id: '1p', type: 'p', value: 1 }, // 1 Pin
    ]
    this.drawTile()
  }

  generateDeck(): Tile[] {
    const deck: Tile[] = []
    // 1-9m, 1-9p, 1-9s, 1-7z, 4 copies each
    for (const t of ['m', 'p', 's'] as const) {
      for (let v = 1; v <= 9; v++) {
        for (let c = 0; c < 4; c++) {
          deck.push({ id: `${v}${t}`, type: t, value: v })
        }
      }
    }
    for (let v = 1; v <= 7; v++) {
      for (let c = 0; c < 4; c++) {
        deck.push({ id: `${v}z`, type: 'z', value: v })
      }
    }
    return deck
  }

  shuffle(arr: Tile[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }

  sortHand(hand: Tile[]) {
    const order = { 'm': 0, 'p': 1, 's': 2, 'z': 3 }
    hand.sort((a, b) => {
      if (a.type !== b.type) return order[a.type] - order[b.type]
      return a.value - b.value
    })
  }

  drawTile(): Tile | null {
    if (this.wall.length === 0) return null
    this.drawnTile = this.wall.pop() || null
    return this.drawnTile
  }

  discard(index: number): Tile | null {
    let tile: Tile | null = null
    if (index === 13 && this.drawnTile) {
      tile = this.drawnTile
      this.drawnTile = null
    } else if (index >= 0 && index < this.playerHand.length) {
      tile = this.playerHand.splice(index, 1)[0]
      if (this.drawnTile) {
        this.playerHand.push(this.drawnTile)
        this.drawnTile = null
        this.sortHand(this.playerHand)
      }
    }
    if (tile) {
      this.discards.push(tile)
      this.isPlayerTurn = false
      // Simulate CPU turn after 600ms
      setTimeout(() => this.cpuTurn(), 600)
    }
    return tile
  }

  cpuTurn() {
    if (this.wall.length > 0) {
      const cpuTile = this.wall.pop()!
      this.opponentDiscards.push(cpuTile)
    }
    this.drawTile()
    this.isPlayerTurn = true
  }

  // Denshi Kiban Special Edition: Unlimited DonDen (Three Tile / Hand Exchange)
  dondenExchange() {
    if (!this.drawnTile && this.playerHand.length === 13) {
      this.drawTile()
    }
    if (this.wall.length >= 3) {
      // Exchange 3 tiles with high-value or honor tiles
      for (let i = 0; i < 3 && this.playerHand.length > 0; i++) {
        this.playerHand.pop()
        const newTile = this.wall.pop()!
        this.playerHand.push(newTile)
      }
      this.sortHand(this.playerHand)
    }
  }
}
