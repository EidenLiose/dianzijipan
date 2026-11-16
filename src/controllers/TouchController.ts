// TouchController: Implements Tencent-style Tap to select, Swipe up 30px to discard
export interface TouchHandlers {
  onSelect: (index: number) => void
  onDiscard: (index: number) => void
}

export class TouchController {
  private selectedIndex: number = -1
  private startX: number = 0
  private startY: number = 0
  private handlers: TouchHandlers

  constructor(handlers: TouchHandlers) {
    this.handlers = handlers
  }

  handleTouchStart(e: TouchEvent, index: number) {
    const t = e.touches[0]
    this.startX = t.clientX
    this.startY = t.clientY
    this.selectedIndex = index
    this.handlers.onSelect(index)
    if (navigator.vibrate) navigator.vibrate(10)
  }

  handleTouchEnd(e: TouchEvent, index: number) {
    const t = e.changedTouches[0]
    const deltaY = this.startY - t.clientY
    // Swipe up > 25px -> Discard
    if (deltaY > 25 || index === this.selectedIndex) {
      this.handlers.onDiscard(index)
      this.selectedIndex = -1
    }
  }

  handleClick(index: number) {
    if (this.selectedIndex === index) {
      this.handlers.onDiscard(index)
      this.selectedIndex = -1
    } else {
      this.selectedIndex = index
      this.handlers.onSelect(index)
    }
  }
}
