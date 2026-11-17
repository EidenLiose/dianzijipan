import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import os from 'os'

interface RoomPeer {
  peerId: string
  name: string
  girl: number
  bet: number
  res: any
  leaveTimer?: any
}

function pvpRoomServerPlugin(): Plugin {
  const rooms = new Map<string, Map<string, RoomPeer>>()

  const getLanIps = (): string[] => {
    const nets = os.networkInterfaces()
    const ips: string[] = []
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address)
        }
      }
    }
    return ips
  }

  const broadcastToRoom = (roomId: string, msg: any, excludePeerId?: string) => {
    const rm = rooms.get(roomId)
    if (!rm) return
    const payload = `data: ${JSON.stringify(msg)}\n\n`
    for (const [pid, peer] of rm.entries()) {
      if (pid !== excludePeerId) {
        try {
          peer.res.write(payload)
        } catch {}
      }
    }
  }

  const getPeerSummaries = (roomId: string) => {
    const rm = rooms.get(roomId)
    if (!rm) return []
    return Array.from(rm.values()).map((p) => ({
      peerId: p.peerId,
      name: p.name,
      girl: p.girl,
      bet: p.bet,
    }))
  }

  return {
    name: 'weimzh-pvp-room-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()

        if (req.url.startsWith('/api/room/info') || req.url.startsWith('/api/room/list')) {
          const publicRooms: any[] = []
          let totalPeers = 0
          for (const [rId, rm] of rooms.entries()) {
            totalPeers += rm.size
            if (rm.size > 0) {
              const first = Array.from(rm.values())[0]
              publicRooms.push({
                roomId: rId,
                hostName: first?.name || '街机雀神',
                hostGirl: first?.girl ?? 2,
                peerCount: rm.size,
                maxPeers: 2,
                gameMode: '2P',
                betAmount: first?.bet || 20,
                allowDonden: false,
                inGame: rm.size >= 2,
              })
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              lanIps: getLanIps(),
              port: 3000,
              activeRooms: rooms.size,
              onlinePlayers: Math.max(1, totalPeers),
              rooms: publicRooms,
              notices: ['🎉 欢迎来到《电子基盘·商业旗舰版》！支持台湾甜美女声唱番、听牌助手与每日金豆福利！'],
            })
          )
          return
        }

        if (req.url.startsWith('/api/leaderboard')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: true,
              list: [
                { peerId: 'npc_masako', name: '雅子·街机魔王', chips: 88000, wins: 42, games: 55, maxFan: 13, rankTitle: '👑 电子雀神' },
                { peerId: 'npc_yui', name: '结衣·清一色女王', chips: 52000, wins: 28, games: 40, maxFan: 8, rankTitle: '💎 钻石雀圣' },
                { peerId: 'npc_rumi', name: '留美·立直快枪手', chips: 31000, wins: 19, games: 31, maxFan: 6, rankTitle: '🥇 黄金雀豪' },
                { peerId: 'npc_miki', name: '美纪·雀庄看板娘', chips: 18500, wins: 12, games: 24, maxFan: 5, rankTitle: '🥈 白银雀杰' },
              ],
            })
          )
          return
        }

        if (req.url.startsWith('/api/room/events')) {
          const u = new URL(req.url, 'http://localhost:3000')
          const roomId = u.searchParams.get('room') || '884821'
          const peerId = u.searchParams.get('peerId') || 'p_' + Math.random().toString(36).slice(2, 8)
          const name = u.searchParams.get('name') || '街机雀士'
          const girl = parseInt(u.searchParams.get('girl') || '0', 10)
          const bet = parseInt(u.searchParams.get('bet') || '20', 10)

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          })

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Map())
          }
          const rm = rooms.get(roomId)!
          const existingPeer = rm.get(peerId)
          if (existingPeer?.leaveTimer) {
            clearTimeout(existingPeer.leaveTimer)
            existingPeer.leaveTimer = undefined
          }
          rm.set(peerId, { peerId, name, girl, bet, res })

          // Notify all peers in room of updated roster
          const peers = getPeerSummaries(roomId)
          broadcastToRoom(roomId, {
            type: 'ROOM_ROSTER',
            roomId,
            peers,
            joinedPeerId: existingPeer ? undefined : peerId,
          })

          req.on('close', () => {
            const currentRm = rooms.get(roomId)
            if (currentRm) {
              const curP = currentRm.get(peerId)
              if (curP && curP.res === res) {
                curP.leaveTimer = setTimeout(() => {
                  const rmNow = rooms.get(roomId)
                  if (!rmNow) return
                  const pNow = rmNow.get(peerId)
                  if (pNow && pNow.res === res) {
                    rmNow.delete(peerId)
                    if (rmNow.size === 0) {
                      rooms.delete(roomId)
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
              }
            }
          })
          return
        }

        if (req.url.startsWith('/api/room/send') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              const roomId = data.roomId || '884821'
              const senderId = data.senderId
              if (data.type === 'UPDATE_META') {
                const rm = rooms.get(roomId)
                const p = rm?.get(senderId)
                if (p) {
                  if (data.girl !== undefined) p.girl = data.girl
                  if (data.bet !== undefined) p.bet = data.bet
                  if (data.name !== undefined) p.name = data.name
                  broadcastToRoom(roomId, {
                    type: 'ROOM_ROSTER',
                    roomId,
                    peers: getPeerSummaries(roomId),
                  })
                }
              } else {
                broadcastToRoom(roomId, data, senderId)
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true }))
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), pvpRoomServerPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['mj.eduready.ai', '173.231.53.226', true],
  },
})
