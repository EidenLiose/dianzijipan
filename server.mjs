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
const PORT = parseInt(process.env.PORT || '3000', 10)
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'mj.eduready.ai'

// In-memory room registry: Map<roomId, { peers: Map<peerId, RoomPeer>, activeMatch: any, moves: any[], cleanupTimer: any }>
const rooms = new Map()

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      peers: new Map(),
      activeMatch: null,
      moves: [],
      recentEvents: [],
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
    ['START_PVP_MATCH', 'PVP_MOVE', 'CHAT_EMOTE', 'VOICE_AUDIO_CHUNK', 'UPDATE_META', 'BC_HELLO', 'BC_HELLO_ACK'].includes(
      msg.type
    )
  ) {
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

  // 1. Room Info API
  if (req.url.startsWith('/api/room/info')) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(
      JSON.stringify({
        domain: PUBLIC_DOMAIN,
        serverIp: '173.231.53.226',
        lanIps: getLanIps(),
        port: PORT,
        activeRooms: rooms.size,
      })
    )
    return
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

        if (data.type === 'UPDATE_META') {
          const p = rm?.peers.get(senderId)
          if (p) {
            if (data.girl !== undefined) p.girl = data.girl
            if (data.bet !== undefined) p.bet = data.bet
            if (data.name !== undefined) p.name = data.name
          }
          broadcastToRoom(roomId, data, senderId)
        } else {
          broadcastToRoom(roomId, data, senderId)
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(
          JSON.stringify({
            ok: true,
            events: rm.recentEvents.filter((e) => e.senderId !== senderId).slice(-25),
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
      ext === '.html' ? 'no-cache' : 'public, max-age=86400'
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
