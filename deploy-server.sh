#!/usr/bin/env bash
# 一键部署脚本：在服务器 173.231.53.226 (mj.eduready.ai) 上执行
set -e

echo "========================================================="
echo "🀄 开始部署《电子基盘》公网联机服务 (mj.eduready.ai)..."
echo "========================================================="

mkdir -p logs

# 1. 安装依赖并编译前端生产包
npm install
npm run build

# 2. 使用 PM2 守护运行一体化生产服务 server.mjs (端口 3030)
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete dianzijipan 2>/dev/null || true
  PORT=3030 PUBLIC_DOMAIN=mj.eduready.ai pm2 start server.mjs --name dianzijipan
  pm2 save
  echo "✅ PM2 守护进程 [dianzijipan] 已启动 (监听 127.0.0.1:3030)"
else
  echo "⚠️ 未检测到 pm2，正在全局安装 pm2..."
  npm install -g pm2
  PORT=3030 PUBLIC_DOMAIN=mj.eduready.ai pm2 start server.mjs --name dianzijipan
  pm2 save
fi

echo "========================================================="
echo "🎉 部署完成！访问地址: https://mj.eduready.ai"
echo "========================================================="
