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

systemctl daemon-reload
echo "VPN service created successfully."
echo "Place your proton.ovpn (with 'route-nopull') and auth.txt in /root/vpn/"
echo "Then enable and start with: systemctl enable --now protonvpn-isolated.service"
