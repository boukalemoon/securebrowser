#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SecureBrowser — WireGuard Sunucu Kurulum Scripti
# Oracle Cloud Free Tier / Ubuntu 22.04 LTS
#
# Kullanım: sudo bash wireguard-setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Hata olursa dur

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[UYARI]${NC} $1"; }
error()   { echo -e "${RED}[HATA]${NC}  $1"; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║      SecureBrowser — WireGuard Sunucu Kurulumu       ║"
echo "║         Oracle Cloud Free Tier / Ubuntu 22.04        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Root Kontrolü ────────────────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && error "Bu scripti root olarak çalıştırın: sudo bash wireguard-setup.sh"

# ─── Sistem Güncelle ──────────────────────────────────────────────────────────
info "Sistem güncelleniyor..."
apt-get update -qq
apt-get upgrade -y -qq
success "Sistem güncellendi"

# ─── WireGuard Kur ────────────────────────────────────────────────────────────
info "WireGuard kuruluyor..."
apt-get install -y -qq wireguard wireguard-tools iptables resolvconf qrencode
success "WireGuard kuruldu: $(wg --version)"

# ─── IP Forwarding Aktif Et ───────────────────────────────────────────────────
info "IP Forwarding aktif ediliyor..."
echo "net.ipv4.ip_forward=1"  >> /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
sysctl -p -q
success "IP Forwarding aktif"

# ─── Anahtarlar Oluştur ───────────────────────────────────────────────────────
info "Kriptografik anahtarlar oluşturuluyor..."
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

SERVER_PRIVATE=$(wg genkey)
SERVER_PUBLIC=$(echo "$SERVER_PRIVATE" | wg pubkey)
CLIENT1_PRIVATE=$(wg genkey)
CLIENT1_PUBLIC=$(echo "$CLIENT1_PRIVATE" | wg pubkey)
CLIENT1_PSK=$(wg genpsk)  # Ekstra güvenlik: Pre-Shared Key

echo "$SERVER_PRIVATE"  | install -m 600 /dev/stdin /etc/wireguard/server_private.key
echo "$SERVER_PUBLIC"   | install -m 644 /dev/stdin /etc/wireguard/server_public.key
echo "$CLIENT1_PRIVATE" | install -m 600 /dev/stdin /etc/wireguard/client1_private.key
echo "$CLIENT1_PUBLIC"  | install -m 644 /dev/stdin /etc/wireguard/client1_public.key
echo "$CLIENT1_PSK"     | install -m 600 /dev/stdin /etc/wireguard/client1_psk.key

success "Anahtarlar oluşturuldu ve güvenli şekilde kaydedildi"

# ─── Ağ Arayüzü Tespiti ──────────────────────────────────────────────────────
NET_IFACE=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
info "Ağ arayüzü: $NET_IFACE | Sunucu IP: $SERVER_IP"

# ─── WireGuard Sunucu Config ─────────────────────────────────────────────────
info "WireGuard sunucu konfigürasyonu yazılıyor..."
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address    = 10.0.0.1/24
ListenPort = 51820
PrivateKey = $SERVER_PRIVATE

# NAT: VPN istemcilerinden gelen trafiği internete yönlendir
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $NET_IFACE -j MASQUERADE
PreDown  = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $NET_IFACE -j MASQUERADE

# IPv6 NAT (varsa)
PostUp   = ip6tables -A FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o $NET_IFACE -j MASQUERADE 2>/dev/null || true
PreDown  = ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o $NET_IFACE -j MASQUERADE 2>/dev/null || true

# İstemci 1: SecureBrowser
[Peer]
PublicKey    = $CLIENT1_PUBLIC
PresharedKey = $CLIENT1_PSK
AllowedIPs   = 10.0.0.2/32
EOF

chmod 600 /etc/wireguard/wg0.conf
success "Sunucu konfigürasyonu yazıldı"

# ─── DNS Sunucusu (Unbound) ───────────────────────────────────────────────────
info "Unbound DNS sunucusu kuruluyor..."
apt-get install -y -qq unbound

cat > /etc/unbound/unbound.conf.d/securebrowser.conf << 'EOF'
server:
    # Sadece VPN tünelinden gelen sorguları yanıtla
    interface: 10.0.0.1
    access-control: 10.0.0.0/24 allow
    access-control: 0.0.0.0/0 refuse

    # DNSSEC doğrulama
    auto-trust-anchor-file: "/var/lib/unbound/root.key"

    # Gizlilik ayarları
    hide-identity: yes
    hide-version: yes
    qname-minimisation: yes

    # Önbellek
    cache-max-ttl: 86400
    cache-min-ttl: 300
    prefetch: yes

    # Performans
    num-threads: 2
    so-reuseport: yes
EOF

systemctl enable  unbound -q
systemctl restart unbound
success "Unbound DNS sunucusu başlatıldı (10.0.0.1)"

# ─── WireGuard Başlat ─────────────────────────────────────────────────────────
info "WireGuard başlatılıyor..."
systemctl enable  wg-quick@wg0
systemctl start   wg-quick@wg0
sleep 2

if wg show wg0 &>/dev/null; then
  success "WireGuard aktif: $(wg show wg0 | head -1)"
else
  error "WireGuard başlatılamadı! 'journalctl -u wg-quick@wg0' ile kontrol edin."
fi

# ─── Oracle Cloud Firewall (iptables kalıcı) ──────────────────────────────────
info "Güvenlik duvarı kuralları ayarlanıyor..."
apt-get install -y -qq iptables-persistent

# Mevcut kuralları kaydet
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6
success "Güvenlik duvarı kuralları kalıcı hale getirildi"

# ─── Fail2Ban (Brute Force Koruması) ─────────────────────────────────────────
info "Fail2Ban kuruluyor..."
apt-get install -y -qq fail2ban
systemctl enable fail2ban -q
systemctl start  fail2ban
success "Fail2Ban aktif"

# ─── İstemci Konfigürasyonu Oluştur ──────────────────────────────────────────
info "İstemci konfigürasyonu oluşturuluyor..."

CLIENT1_CONF="/etc/wireguard/client1.conf"
cat > "$CLIENT1_CONF" << EOF
[Interface]
PrivateKey = $CLIENT1_PRIVATE
Address    = 10.0.0.2/32
DNS        = 10.0.0.1

[Peer]
PublicKey    = $SERVER_PUBLIC
PresharedKey = $CLIENT1_PSK
Endpoint     = $SERVER_IP:51820
AllowedIPs   = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF

chmod 600 "$CLIENT1_CONF"

# ─── Özet ve Çıktı ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    KURULUM TAMAMLANDI ✓                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BOLD}SecureBrowser'a Ekleyeceğin Bilgiler:${NC}"
echo "────────────────────────────────────────"
echo -e "  Sunucu Adı  : ${CYAN}Oracle Cloud EU${NC}"
echo -e "  Konum       : ${CYAN}🇩🇪 Frankfurt (veya seçtiğin bölge)${NC}"
echo -e "  Endpoint    : ${CYAN}${SERVER_IP}:51820${NC}"
echo -e "  Public Key  : ${CYAN}${SERVER_PUBLIC}${NC}"
echo -e "  Private Key : ${CYAN}${CLIENT1_PRIVATE}${NC}"
echo -e "  İstemci IP  : ${CYAN}10.0.0.2/32${NC}"
echo -e "  DNS         : ${CYAN}10.0.0.1${NC}"
echo "────────────────────────────────────────"
echo ""
echo -e "${YELLOW}ÖNEMLİ: Bu bilgileri güvenli bir yere kaydet!${NC}"
echo -e "${YELLOW}Private Key'i kimseyle paylaşma!${NC}"
echo ""

# QR Kod (mobil için)
echo -e "${BOLD}Mobil için QR Kod:${NC}"
qrencode -t ansiutf8 < "$CLIENT1_CONF"

echo ""
echo -e "${BOLD}Ek İstemci Eklemek İçin:${NC}"
echo "  sudo bash /etc/wireguard/add-client.sh <istemci-adi>"
echo ""
echo -e "${BOLD}Durum Kontrolü:${NC}"
echo "  sudo wg show"
echo "  sudo systemctl status wg-quick@wg0"
echo ""

# Add-client scripti oluştur
cat > /etc/wireguard/add-client.sh << 'ADDCLIENT'
#!/bin/bash
# Yeni istemci ekle
NAME="${1:-client$(date +%s)}"
PRIV=$(wg genkey)
PUB=$(echo "$PRIV" | wg pubkey)
PSK=$(wg genpsk)
SERVER_PUB=$(cat /etc/wireguard/server_public.key)
SERVER_IP=$(curl -s https://api.ipify.org)

# Mevcut istemci sayısına göre IP ata
LAST_IP=$(grep -o '10\.0\.0\.[0-9]*' /etc/wireguard/wg0.conf | sort -t. -k4 -n | tail -1 | cut -d. -f4)
NEW_IP="10.0.0.$((LAST_IP + 1))"

echo "" >> /etc/wireguard/wg0.conf
echo "# İstemci: $NAME" >> /etc/wireguard/wg0.conf
echo "[Peer]" >> /etc/wireguard/wg0.conf
echo "PublicKey    = $PUB" >> /etc/wireguard/wg0.conf
echo "PresharedKey = $PSK" >> /etc/wireguard/wg0.conf
echo "AllowedIPs   = $NEW_IP/32" >> /etc/wireguard/wg0.conf

wg addconf wg0 <(echo "[Peer]
PublicKey    = $PUB
PresharedKey = $PSK
AllowedIPs   = $NEW_IP/32")

echo "╔══════════════════════════════════╗"
echo "║   Yeni İstemci: $NAME"
echo "╚══════════════════════════════════╝"
echo "Endpoint   : $SERVER_IP:51820"
echo "Public Key : $SERVER_PUB"
echo "Private Key: $PRIV"
echo "İstemci IP : $NEW_IP/32"
echo "DNS        : 10.0.0.1"
ADDCLIENT

chmod +x /etc/wireguard/add-client.sh
success "add-client.sh hazır: sudo bash /etc/wireguard/add-client.sh <isim>"
