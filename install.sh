#!/bin/bash

# ============================================
#  CRM - Установка одной командой
#  curl -sSL https://raw.githubusercontent.com/inersu-msk/crm-repair/main/install.sh | sudo bash
# ============================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}🔧 CRM - Установка системы управления заказами${NC}"
echo "================================================"
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Запустите с sudo${NC}"
    exit 1
fi

# Переменные
REPO_URL="https://github.com/inersu-msk/crm-repair/archive/refs/heads/main.zip"
INSTALL_DIR="/var/www/crm"
TMP_DIR="/tmp/crm-install"

# Запрос домена
read -p "Введите домен (или Enter для доступа по IP): " DOMAIN
read -p "Введите порт Nginx (по умолчанию 80): " NGINX_PORT
NGINX_PORT=${NGINX_PORT:-80}

echo ""
echo -e "${YELLOW}📦 [1/5] Установка системных пакетов...${NC}"
apt update
apt install -y curl unzip nginx

# Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}📦 Установка Node.js 20...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

echo ""
echo -e "${YELLOW}📥 [2/5] Скачивание CRM...${NC}"
rm -rf $TMP_DIR
mkdir -p $TMP_DIR
cd $TMP_DIR

curl -sSL "$REPO_URL" -o crm.zip
unzip -q crm.zip
mv crm-repair-main/* .

echo ""
echo -e "${YELLOW}📁 [3/5] Установка в $INSTALL_DIR...${NC}"
mkdir -p $INSTALL_DIR
mkdir -p $INSTALL_DIR/data
cp -r ./* $INSTALL_DIR/
cd $INSTALL_DIR
npm install --production

# Создаём .env
JWT_SECRET=$(openssl rand -hex 32)
cat > "$INSTALL_DIR/.env" << EOF
PORT=3000
JWT_SECRET=$JWT_SECRET
DATABASE_PATH=./data/crm.db
EOF

chown -R www-data:www-data $INSTALL_DIR

echo ""
echo -e "${YELLOW}⚙️ [4/5] Настройка systemd...${NC}"
cat > /etc/systemd/system/crm.service << EOF
[Unit]
Description=CRM Repair Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/crm
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable crm
systemctl start crm

echo ""
echo -e "${YELLOW}🌐 [5/5] Настройка Nginx...${NC}"

if [ -n "$DOMAIN" ]; then
    SERVER_NAME="$DOMAIN"
else
    SERVER_NAME="_"
fi

cat > /etc/nginx/sites-available/crm << EOF
server {
    listen $NGINX_PORT;
    server_name $SERVER_NAME;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Очистка
rm -rf $TMP_DIR

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ CRM успешно установлена!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
if [ -n "$DOMAIN" ]; then
    if [ "$NGINX_PORT" != "80" ]; then
        echo -e "🌐 Откройте: ${YELLOW}http://$DOMAIN:$NGINX_PORT${NC}"
    else
        echo -e "🌐 Откройте: ${YELLOW}http://$DOMAIN${NC}"
        echo ""
        echo -e "Для SSL выполните:"
        echo -e "  ${YELLOW}apt install -y certbot python3-certbot-nginx${NC}"
        echo -e "  ${YELLOW}certbot --nginx -d $DOMAIN${NC}"
    fi
else
    if [ "$NGINX_PORT" != "80" ]; then
        echo -e "🌐 Откройте: ${YELLOW}http://IP-СЕРВЕРА:$NGINX_PORT${NC}"
    else
        echo -e "🌐 Откройте: ${YELLOW}http://IP-СЕРВЕРА${NC}"
    fi
fi
echo ""
echo -e "📊 Управление:"
echo -e "  ${YELLOW}systemctl status crm${NC}  - статус"
echo -e "  ${YELLOW}systemctl restart crm${NC} - перезапуск"
echo -e "  ${YELLOW}journalctl -u crm -f${NC}  - логи"
echo ""
