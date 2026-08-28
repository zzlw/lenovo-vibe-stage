#!/usr/bin/env bash
# Lenovo Vibe Stage · 一键启动脚本（自动探测 LAN_IP 让二维码可被手机扫到）
# 用法:  ./start.sh

set -euo pipefail

cd "$(dirname "$0")"

echo "▶ Lenovo Vibe Stage · 启动中..."

if [ ! -f .env ]; then
  echo "  · 首次启动，自动从 .env.example 创建 .env"
  cp .env.example .env
fi

# 探测局域网 IP（mac / linux 通用）
detect_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1 en2 wlan0 eth0; do
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
      [ -n "$ip" ] && echo "$ip" && return
    done
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}' | head -n1
    return
  fi
  echo ""
}

LAN_IP_DETECTED=$(detect_lan_ip)
if [ -z "$LAN_IP_DETECTED" ]; then
  echo "  ⚠️  未能自动探测到 LAN IP，二维码将回退到 localhost。手机扫码前请检查 .env"
else
  echo "  · 探测到本机局域网 IP: $LAN_IP_DETECTED"
  if grep -q '^LAN_IP=' .env; then
    sed -i.bak "s|^LAN_IP=.*|LAN_IP=$LAN_IP_DETECTED|" .env && rm -f .env.bak
  else
    echo "LAN_IP=$LAN_IP_DETECTED" >> .env
  fi
fi

echo ""
echo "▶ docker compose up -d ..."
docker compose up -d

echo ""
echo "  · 等容器 healthy（最多 60 秒）..."
for i in $(seq 1 30); do
  if docker compose ps --format json 2>/dev/null | grep -q '"Health":"healthy"' && \
     [ "$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"')" -ge 3 ]; then
    break
  fi
  sleep 2
done

echo ""
docker compose ps --format 'table {{.Name}}\t{{.Status}}'

PUBLIC_PORT=$(grep -E '^PUBLIC_PORT=' .env 2>/dev/null | cut -d= -f2 || echo "8080")
PUBLIC_PORT=${PUBLIC_PORT:-8080}

HOST_FOR_URL="${LAN_IP_DETECTED:-127.0.0.1}"
echo ""
echo "✅ 已启动。直接访问（讲师 + 学员都用这套 LAN URL，PPT 投影也用这个，避免再出现 localhost）："
echo ""
echo "   📺  讲师投影:   http://${HOST_FOR_URL}:${PUBLIC_PORT}"
echo "   📝  学员录入:   http://${HOST_FOR_URL}:${PUBLIC_PORT}/#enroll"
echo "   🎯  讲师抽人:   http://${HOST_FOR_URL}:${PUBLIC_PORT}/#pick"
echo "   🤝  承诺墙:     http://${HOST_FOR_URL}:${PUBLIC_PORT}/#commit"
echo "   ✅  健康检查:   http://${HOST_FOR_URL}:${PUBLIC_PORT}/readyz"
echo ""
if [ -z "$LAN_IP_DETECTED" ]; then
  echo "⚠️  未探测到 LAN IP，已回退 127.0.0.1。手机要扫码请手动设 .env 的 LAN_IP。"
  echo ""
fi
echo "💡 想关掉:  docker compose down"
echo "   清空数据: docker compose down -v"
