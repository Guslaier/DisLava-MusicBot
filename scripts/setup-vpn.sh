#!/bin/bash
set -e

# DisLava MusicBot - Automated Isolated ProtonVPN Setup for Linux (Debian/Ubuntu)
echo "=== Setting up Isolated ProtonVPN for DisLava-MusicBot ==="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo bash setup-vpn.sh)"
  exit 1
fi

# 1. Install OpenVPN
apt-get update -y
apt-get install -y openvpn

# 2. Setup directory
mkdir -p /root/vpn
chmod 700 /root/vpn

# 3. Create route helper scripts
cat << 'EOF' > /root/vpn/vpn-up.sh
#!/bin/bash
ip route replace default dev "$dev" table 100
ip rule del table 100 2>/dev/null || true
ip rule add from "$ifconfig_local" table 100
echo "$ifconfig_local" > /root/vpn/vpn_ip.txt
chmod 644 /root/vpn/vpn_ip.txt
EOF
chmod +x /root/vpn/vpn-up.sh

cat << 'EOF' > /root/vpn/vpn-down.sh
#!/bin/bash
ip rule del table 100 2>/dev/null || true
ip route flush table 100 2>/dev/null || true
rm -f /root/vpn/vpn_ip.txt
EOF
chmod +x /root/vpn/vpn-down.sh

# 4. Create systemd service
cat << 'EOF' > /etc/systemd/system/protonvpn-isolated.service
[Unit]
Description=ProtonVPN Isolated Tunnel for DisLava Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/vpn
ExecStart=/usr/sbin/openvpn --config /root/vpn/proton.ovpn --script-security 2 --up /root/vpn/vpn-up.sh --down /root/vpn/vpn-down.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 5. Create self-healing watchdog
cat << 'EOF' > /root/vpn/vpn-watchdog.sh
#!/bin/bash
VPN_IP=$(cat /root/vpn/vpn_ip.txt 2>/dev/null)
if [ -n "$VPN_IP" ] && ip link show tun0 >/dev/null 2>&1; then
    if ! ip rule show | grep -q "lookup 100"; then
        echo "[Watchdog] Restoring missing ip rule for $VPN_IP..."
        ip rule add from "$VPN_IP" table 100 2>/dev/null || true
        ip route replace default dev tun0 table 100 2>/dev/null || true
    fi
    if ! curl -s -m 4 --interface "$VPN_IP" https://api.ipify.org >/dev/null 2>&1; then
        echo "[Watchdog] VPN egress dead! Restarting protonvpn-isolated..."
        systemctl restart protonvpn-isolated
    fi
fi
EOF
chmod +x /root/vpn/vpn-watchdog.sh

cat << 'EOF' > /etc/systemd/system/vpn-watchdog.service
[Unit]
Description=ProtonVPN Route and Connectivity Watchdog
After=network.target

[Service]
Type=oneshot
ExecStart=/root/vpn/vpn-watchdog.sh
EOF

cat << 'EOF' > /etc/systemd/system/vpn-watchdog.timer
[Unit]
Description=Run VPN Watchdog every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now vpn-watchdog.timer
echo "VPN service and self-healing watchdog timer created successfully."
echo "Place your proton.ovpn (with 'route-nopull') and auth.txt in /root/vpn/"
echo "Then enable and start with: systemctl enable --now protonvpn-isolated.service"

