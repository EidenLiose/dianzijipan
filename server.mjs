// Production All-in-One Server for mj.eduready.ai (173.231.53.226)
// Serves static assets from ./dist AND provides real-time /api/room/* SSE & REST multiplayer signaling
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIST_DIR = path.join(__dirname, 'dist')
const DATA_DIR = path.join(__dirname, 'data')
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json')
const PORT = parseInt(process.env.PORT || '3000', 10)
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'mj.eduready.ai'
const APP_VERSION = '4.1.0'

// In-memory room registry
const rooms = new Map()

// Global marquee notices (Big Wins & System Broadcasts)
const globalNotices = [
  '🎉 欢迎来到《电子基盘·街机商业旗舰版》！支持台湾甜美女声唱番、公网大厅秒匹与每日金豆福利！',
]

// Persistent Leaderboard Registry: Map<peerId, PlayerRankRecord>
const leaderboard = new Map()

function loadLeaderboard() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const arr = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'))
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && item.peerId) leaderboard.set(item.peerId, item)
        }
      }
    }
  } catch {}
  if (leaderboard.size === 0) {
    // Seed classic arcade challengers so leaderboard is lively out of the box
    const seeds = [
      { peerId: 'npc_masako', name: '雅子·街机魔王', chips: 88000, wins: 42, games: 55, maxFan: 13, rankTitle: '👑 电子雀神', updatedAt: Date.now() },
      { peerId: 'npc_yui', name: '结衣·清一色女王', chips: 52000, wins: 28, games: 40, maxFan: 8, rankTitle: '💎 钻石雀圣', updatedAt: Date.now() },
      { peerId: 'npc_rumi', name: '留美·立直快枪手', chips: 31000, wins: 19, games: 31, maxFan: 6, rankTitle: '🥇 黄金雀豪', updatedAt: Date.now() },
      { peerId: 'npc_miki', name: '美纪·雀庄看板娘', chips: 18500, wins: 12, games: 24, maxFan: 5, rankTitle: '🥈 白银雀杰', updatedAt: Date.now() },
    ]
    for (const s of seeds) leaderboard.set(s.peerId, s)
  }
}

let saveTimer = null
function scheduleSaveLeaderboard() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
      const sorted = getSortedLeaderboard()
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(sorted.slice(0, 100), null, 2), 'utf-8')
    } catch {}
  }, 2000)
}

function getSortedLeaderboard() {
  return Array.from(leaderboard.values())
    .sort((a, b) => (b.chips || 0) - (a.chips || 0) || (b.wins || 0) - (a.wins || 0))
    .slice(0, 30)
}

loadLeaderboard()

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      peers: new Map(),
      gameMode: '2P',
      betAmount: 20,
      allowDonden: false,
      isPrivate: false,
      activeMatch: null,
      moves: [],
      recentEvents: [],
      eventSeq: 0,
      staleWarnedPeers: new Set(),
      createdAt: Date.now(),
      cleanupTimer: null,
    })
  }
  const rm = rooms.get(roomId)
  if (rm.cleanupTimer) {
    clearTimeout(rm.cleanupTimer)
    rm.cleanupTimer = null
  }
  return rm
}

function getLanIps() {
  const nets = os.networkInterfaces()
  const ips = [PUBLIC_DOMAIN, '173.231.53.226']
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !ips.includes(net.address)) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

function broadcastToRoom(roomId, msg, excludePeerId) {
  const rm = rooms.get(roomId)
  if (!rm) return
  if (
    msg &&
    msg.msgId &&
    ['START_PVP_MATCH', 'PVP_MOVE', 'CHAT_EMOTE', 'UPDATE_META', 'BC_HELLO', 'BC_HELLO_ACK'].includes(
      msg.type
    )
  ) {
    msg.seq = ++rm.eventSeq
    rm.recentEvents.push(msg)
    if (rm.recentEvents.length > 80) {
      rm.recentEvents.splice(0, rm.recentEvents.length - 80)
    }
  }
  const payload = `data: ${JSON.stringify(msg)}\n\n`
  for (const [pid, peer] of rm.peers.entries()) {
    if (pid !== excludePeerId && peer.res) {
      try {
        peer.res.write(payload)
      } catch {}
    }
  }
}

function getPeerSummaries(roomId) {
  const rm = rooms.get(roomId)
  if (!rm) return []
  return Array.from(rm.peers.values()).map((p) => ({
    peerId: p.peerId,
    name: p.name,
    girl: p.girl,
    bet: p.bet,
  }))
}

// Keep SSE connections alive through Nginx / Cloudflare proxies
setInterval(() => {
  for (const rm of rooms.values()) {
    for (const peer of rm.peers.values()) {
      try {
        peer.res.write(': heartbeat\n\n')
      } catch {}
    }
  }
}, 15000)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400)
    res.end('Bad Request')
    return
  }

  // CORS preflight support
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // 1. Room Info & Public Lobby List API
  if (req.url.startsWith('/api/room/info') || req.url.startsWith('/api/room/list')) {
    let totalPeers = 0
    const publicRooms = []
    for (const [rId, rm] of rooms.entries()) {
      const pCount = rm.peers.size
      totalPeers += pCount
      if (pCount > 0 && !rm.isPrivate) {
        const firstPeer = Array.from(rm.peers.values())[0]
        const mode = rm.activeMatch?.gameMode || rm.gameMode || '2P'
        const maxPeers = mode === '4P' ? 4 : 2
        publicRooms.push({
          roomId: rId,
          hostName: firstPeer?.name || '街机雀神',
          hostGirl: firstPeer?.girl ?? 2,
          peerCount: pCount,
          maxPeers,
          gameMode: mode,
          betAmount: rm.activeMatch?.betAmount || rm.betAmount || firstPeer?.bet || 20,
          allowDonden: Boolean(rm.activeMatch ? rm.activeMatch.allowDonden : rm.allowDonden),
          inGame: Boolean(rm.activeMatch && pCount >= maxPeers),
        })
      }
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(
      JSON.stringify({
        serverVersion: APP_VERSION,
        domain: PUBLIC_DOMAIN,
        serverIp: '173.231.53.226',
        lanIps: getLanIps(),
        port: PORT,
        activeRooms: rooms.size,
        onlinePlayers: Math.max(1, totalPeers),
        rooms: publicRooms,
        notices: globalNotices.slice(-8),
      })
    )
    return
  }

  // 1b. Leaderboard API (GET & POST)
  if (req.url.startsWith('/api/leaderboard')) {
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify({ ok: true, list: getSortedLeaderboard(), notices: globalNotices.slice(-8) }))
      return
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => {
        body += c
        if (body.length > 1e5) req.socket.destroy()
      })
      req.on('end', () => {
        try {
          const d = JSON.parse(body)
          if (d && d.peerId && d.name) {
            const prev = leaderboard.get(d.peerId) || {}
            leaderboard.set(d.peerId, {
              peerId: String(d.peerId).slice(0, 32),
              name: String(d.name).slice(0, 18),
              chips: Math.max(0, Number(d.chips ?? prev.chips ?? 10000)),
              wins: Math.max(Number(prev.wins || 0), Number(d.wins || 0)),
              games: Math.max(Number(prev.games || 0), Number(d.games || 0)),
              maxFan: Math.max(Number(prev.maxFan || 0), Number(d.maxFan || 0)),
              rankTitle: String(d.rankTitle || prev.rankTitle || '🥉 青铜雀士').slice(0, 16),
              updatedAt: Date.now(),
            })
            if (d.bigWinNotice && typeof d.bigWinNotice === 'string') {
              globalNotices.push(d.bigWinNotice.slice(0, 120))
              if (globalNotices.length > 20) globalNotices.splice(0, globalNotices.length - 20)
            }
            scheduleSaveLeaderboard()
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ ok: true, list: getSortedLeaderboard() }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ ok: false }))
        }
      })
      return
    }
  }

  // 2. Real-time SSE Room Stream API
  if (req.url.startsWith('/api/room/events')) {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const roomId = u.searchParams.get('room') || '884821'
    const peerId = u.searchParams.get('peerId') || 'p_' + Math.random().toString(36).slice(2, 8)
    const name = u.searchParams.get('name') || '街机雀士'
    const girl = parseInt(u.searchParams.get('girl') || '0', 10)
    const bet = parseInt(u.searchParams.get('bet') || '20', 10)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx proxy buffering for instant SSE
      'Access-Control-Allow-Origin': '*',
    })

    const rm = getOrCreateRoom(roomId)
    const oldPeer = rm.peers.get(peerId)
    if (oldPeer && oldPeer.leaveTimer) {
      clearTimeout(oldPeer.leaveTimer)
    }
    const peerRecord = { peerId, name, girl, bet, res, leaveTimer: null }
    rm.peers.set(peerId, peerRecord)

    const peers = getPeerSummaries(roomId)
    // Send initial roster to the newly connected peer immediately
    try {
      res.write(
        `data: ${JSON.stringify({
          type: 'ROOM_ROSTER',
          roomId,
          peers,
          joinedPeerId: oldPeer ? undefined : peerId,
        })}\n\n`
      )
      // If a match is already active in this room and this is a fresh join/page refresh, push ROOM_SYNC
      if (rm.activeMatch && !oldPeer) {
        res.write(
          `data: ${JSON.stringify({
            type: 'ROOM_SYNC',
            roomId,
            match: rm.activeMatch,
            moves: rm.moves,
          })}\n\n`
        )
      }
      // Also flush recent events on SSE reconnect so no move sent during reconnect window is missed
      if (oldPeer && rm.recentEvents.length > 0) {
        for (const ev of rm.recentEvents.slice(-20)) {
          if (ev.senderId !== peerId) {
            res.write(`data: ${JSON.stringify(ev)}\n\n`)
          }
        }
      }
    } catch {}

    // Broadcast updated roster to everyone else in the room
    broadcastToRoom(
      roomId,
      {
        type: 'ROOM_ROSTER',
        roomId,
        peers,
        joinedPeerId: oldPeer ? undefined : peerId,
      },
      peerId
    )

    req.on('close', () => {
      const currentRm = rooms.get(roomId)
      if (!currentRm) return
      const curP = currentRm.peers.get(peerId)
      if (!curP || curP.res !== res) return

      // Wait 8s grace period before declaring PEER_LEFT (prevents false disconnects on SSE auto-reconnect!)
      curP.leaveTimer = setTimeout(() => {
        const checkRm = rooms.get(roomId)
        if (!checkRm) return
        const checkP = checkRm.peers.get(peerId)
        if (checkP && checkP.res === res) {
          checkRm.peers.delete(peerId)
          if (checkRm.peers.size === 0) {
            checkRm.cleanupTimer = setTimeout(() => {
              const finalRm = rooms.get(roomId)
              if (finalRm && finalRm.peers.size === 0) {
                rooms.delete(roomId)
              }
            }, 120000)
          } else {
            broadcastToRoom(roomId, {
              type: 'PEER_LEFT',
              roomId,
              leftPeerId: peerId,
              peers: getPeerSummaries(roomId),
            })
          }
        }
      }, 8000)
    })
    return
  }

  // 3. Room Action & WebRTC Signaling Broadcast API
  if (req.url.startsWith('/api/room/send') && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1e6) req.socket.destroy()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const roomId = data.roomId || '884821'
        const senderId = data.senderId
        const rm = getOrCreateRoom(roomId)

        // Keep sender alive in room roster even if Cloudflare temporarily resets their SSE stream
        if ((data.type === 'BC_HEARTBEAT' || data.type === 'BC_HELLO') && data.peer && senderId) {
          const existingP = rm.peers.get(senderId)
          if (existingP) {
            if (existingP.leaveTimer) {
              clearTimeout(existingP.leaveTimer)
              existingP.leaveTimer = null
            }
            existingP.name = data.peer.name || existingP.name
            existingP.girl = data.peer.girl ?? existingP.girl
            existingP.bet = data.peer.bet ?? existingP.bet
          } else {
            rm.peers.set(senderId, {
              peerId: senderId,
              name: data.peer.name || '街机雀士',
              girl: data.peer.girl ?? 0,
              bet: data.peer.bet ?? 20,
              res: null,
              leaveTimer: null,
            })
          }
        }

        if (data.type === 'START_PVP_MATCH' && data.payload && rm) {
          rm.activeMatch = data.payload
          rm.moves = []
          rm.recentEvents = []
        } else if (data.type === 'PVP_MOVE' && data.move && rm) {
          rm.moves.push(data.move)
        }

        // Warn once if an un-refreshed legacy browser tab is still connected to this room
        if (rm && senderId && !data.clientVersion && !rm.staleWarnedPeers.has(senderId)) {
          rm.staleWarnedPeers.add(senderId)
          broadcastToRoom(roomId, {
            msgId: 'sys_ver_' + Date.now(),
            type: 'CHAT_EMOTE',
            roomId,
            senderId: 'SYSTEM',
            senderName: '系统提示',
            text: '检测到房间内有未刷新的旧版网页，请双方按 F5 刷新同步至最新版，避免卡牌！',
          })
        }

        if (data.type === 'UPDATE_META') {
          const p = rm?.peers.get(senderId)
          if (p) {
            if (data.girl !== undefined) p.girl = data.girl
            if (data.bet !== undefined) p.bet = data.bet
            if (data.name !== undefined) p.name = data.name
          }
          if (rm) {
            if (data.gameMode !== undefined) rm.gameMode = data.gameMode
            if (data.bet !== undefined) rm.betAmount = data.bet
            if (data.allowDonden !== undefined) rm.allowDonden = Boolean(data.allowDonden)
            if (data.isPrivate !== undefined) rm.isPrivate = Boolean(data.isPrivate)
          }
          broadcastToRoom(roomId, data, senderId)
        } else {
          broadcastToRoom(roomId, data, senderId)
        }
        const sinceSeq = typeof data.sinceSeq === 'number' ? data.sinceSeq : 0
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(
          JSON.stringify({
            ok: true,
            serverVersion: APP_VERSION,
            latestSeq: rm.eventSeq,
            events: rm.recentEvents.filter((e) => e.senderId !== senderId && (e.seq || 0) > sinceSeq).slice(-25),
          })
        )
      } catch {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ ok: false }))
      }
    })
    return
  }

  // 4. Static Asset & SPA Serving from ./dist
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  let safePath = path.normalize(decodeURIComponent(parsedUrl.pathname)).replace(/^(\.\.[\/\\])+/, '')
  if (safePath === '/' || safePath === '\\') safePath = '/index.html'

  let filePath = path.join(DIST_DIR, safePath)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found - Please run "npm run build" first.')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const cacheControl =
      ext === '.html' ? 'no-store, no-cache, must-revalidate' : 'public, max-age=86400'
    const acceptEncoding = req.headers['accept-encoding'] || ''
    const compressible = ['.html', '.js', '.mjs', '.css', '.json', '.ttf', '.svg', '.txt', '.ini'].includes(ext)

    if (compressible && acceptEncoding.includes('gzip') && content.length > 1024) {
      zlib.gzip(content, (gzErr, gzData) => {
        if (gzErr) {
          res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl })
          res.end(content)
          return
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Encoding': 'gzip',
          'Cache-Control': cacheControl,
        })
        res.end(gzData)
      })
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      })
      res.end(content)
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================================`)
  console.log(`🀄 电子基盘 (Electron Base) 生产级联机服务器已启动!`)
  console.log(`🌐 绑定域名: https://${PUBLIC_DOMAIN}`)
  console.log(`🖥️ 监听地址: http://0.0.0.0:${PORT} (服务器 IP: 173.231.53.226)`)
  console.log(`=========================================================`)
})
