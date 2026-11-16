@echo off
chcp 65001 >nul
title 麻雀電子基盤 (Weimzh Arcade Edition) 本地离线启动器
cd /d "%~dp0"
echo ========================================================
echo   正在启动《麻雀電子基盤》(weimzh/mahjong 1:1 豪华离线版)
echo   浏览器将自动打开 http://localhost:3000
echo ========================================================
start "" "http://localhost:3000"
call npm run dev
