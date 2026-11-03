<div align="center">
  <h1>DisLava-MusicBot</h1>
  <p><strong>High-Performance Standalone Discord Music Bot</strong></p>
  
  [![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue?logo=discord&logoColor=white)](https://discord.js.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-16.11.0+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![yt-dlp](https://img.shields.io/badge/Audio%20Engine-yt--dlp%20%2B%20FFmpeg-red)](https://github.com/yt-dlp/yt-dlp)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

<br />

**DisLava-MusicBot** is an Open Source Discord Music Bot powered directly by **Discord.js v14**, **@discordjs/voice**, embedded **yt-dlp**, and **FFmpeg**. It runs as a self-contained, standalone Node.js service without needing Java, Lavalink, or external server daemons.

It features local audio caching, direct Opus stream encoding, smart search, playlist support, an advanced queue management system, and stylish Hot Pink embed interfaces.

> **Note for general users:** This project is Open Source and designed to be self-hosted on your own servers.

---

## Key Features

- **Standalone Architecture**: 100% pure Node.js runtime. No Java runtime or Lavalink server required.
- **Ultra-Light Footprint**: Optimized memory consumption (<30-50MB RAM baseline) with zero memory leaks.
- **Fast Playback & Caching**: Streams audio directly via `yt-dlp` and `ffmpeg-static` (Ogg Opus) with local disk caching for instant replays and loops.
- **Auto Cache Management**: Automatically purges old cached tracks to optimize disk storage.
- **Isolated VPN Tunnel Egress**: Supports ProtonVPN/OpenVPN isolated policy routing (`--source-address`) for full YouTube access without altering the host default gateway or endangering SSH access.
- **Dynamic Free Proxy Pool**: Auto-scrapes and benchmarks public regional proxies (TH/SG/MY/JP/HK) with automated 6-hour blacklists on anti-bot detection.
- **Circuit Breaker & SoundCloud Bypass**: Features an automatic YouTube circuit breaker that transparently falls back to SoundCloud streaming when datacenter IPs are blocked.
- **Search & Playlist Support**: Supports direct YouTube URLs, search queries, and playlists (up to 25 items queued seamlessly).
- **Advanced Queue System**: Supports queue insertion (`/gplay top`), queue jumping (`/gjump`), immediate skip-play (`/gskipplay`), and previous track recall (`/gprevious`).
- **Comprehensive Playback Controls**: Pause, resume, seek, volume adjust, loop (single track / entire queue), and shuffle.
- **Startup Diagnostics**: Automatically runs a pre-flight checklist on boot to verify tokens, binaries, and network configuration.
- **Auto Disconnect**: Automatically disconnects from voice channels when idle or when all members leave.
- **Hot-Reload Commands**: Admins can use `/gupdate` to reload all Slash commands instantly without restarting the bot process.
- **Aesthetic UI**: Formatted with clean Hot Pink (`#FF69B4`) Discord Embeds.

---

## Environment Configuration (.env)

All bot behavior, network egress, and VPN options are controlled via `.env`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | *Required* | Your Discord Bot Token from Discord Developer Portal. |
| `ENABLE_VPN` | `true` | Enable isolated VPN tunnel egress via `tun0` interface. |
| `VPN_SOURCE_IP` | *Auto* | Manual override for VPN source IP. If blank, auto-detected from `tun0` or `/root/vpn/vpn_ip.txt`. |
| `VPN_USERNAME` | *Optional* | OpenVPN credentials for auto-provisioning `/root/vpn/auth.txt`. |
| `VPN_PASSWORD` | *Optional* | OpenVPN password for auto-provisioning `/root/vpn/auth.txt`. |
| `ENABLE_FREE_PROXY` | `false` | Enable background discovery and benchmark of public regional proxies. |
| `PROXY_URL` | *Optional* | Static VIP proxy URL (e.g. `http://user:pass@host:port`). |
| `USE_IPV6` | `true` | Force IPv6 egress when no VPN or proxy is present. |

---

## Prerequisites

- [Node.js](https://nodejs.org/) (Version 16.11.0 or higher)
- [PM2](https://pm2.keymetrics.io/) (Recommended for 24/7 background process management: `npm install pm2 -g`)
- Discord Bot Token (Obtain from the [Discord Developer Portal](https://discord.com/developers/applications))

---

## Installation & Setup

1. **Clone the repository and install dependencies**
   ```bash
   git clone https://github.com/Guslaier/DisLava-MusicBot.git
   cd DisLava-MusicBot
   npm install
   ```

2. **Environment Variables Configuration**
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Insert your bot token inside `.env`:
     ```env
     DISCORD_TOKEN=your_discord_bot_token_here
     ```

3. **yt-dlp Binary Setup**
   Ensure the `yt-dlp` binary located in `bin/` has execution permissions:
   ```bash
   chmod +x bin/yt-dlp
   ```
   *(Note: `ffmpeg` and `ffprobe` binaries are automatically downloaded to `bin/ffmpeg-bundle/` dynamically upon first startup!)*

4. **Network & Anti-Ban Options (Do I need OpenVPN?)**

   OpenVPN is **completely optional**. Choose your setup based on your hosting environment:

   - **Scenario 1: Running on a Home PC / Residential IP**
     - You **do NOT need OpenVPN**. Residential IPs are not blocked by YouTube.
     - In `.env`, set:
       ```env
       ENABLE_VPN=false
       ```
     - Run `node index.js` and play music directly.

   - **Scenario 2: Running on a Cloud VPS without VPN (Zero-Config Fallback)**
     - If your VPS IP is blocked by YouTube and you do not want to setup a VPN:
       ```env
       ENABLE_VPN=false
       ```
     - The bot's built-in **YouTube Circuit Breaker** will automatically detect datacenter restrictions and seamlessly stream tracks through high-bitrate SoundCloud bypass without any extra setup.

   - **Scenario 3: Running on a Cloud VPS with Isolated VPN (Recommended for Maximum Speed)**
     - If you want 100% native YouTube audio streams at full download speeds (16+ MB/s) on a datacenter VPS, use our automated 1-command isolated VPN installer:
       ```bash
       sudo bash scripts/setup-vpn.sh
       ```
     - Place your `proton.ovpn` (with `route-nopull` enabled) and `auth.txt` inside `/root/vpn/`.
     - In `.env`, set:
       ```env
       ENABLE_VPN=true
       ```
     - **Safety Guarantee:** The setup script utilizes Linux Policy Routing (Table 100) and binds traffic solely to `tun0`. It **never alters the host default gateway**, meaning your active SSH session will **never disconnect or be locked out**.

---

## Running the Bot

### Normal Start
```bash
node index.js
```

### Running with PM2 (24/7 Background)
```bash
pm2 start index.js --name "dislava-bot"
```
Check logs and status:
```bash
pm2 logs dislava-bot
pm2 status
```

---

## Slash Commands

### Playback
- `/gplay <query> [top]` - Play a song from title or URL (optional `top` to queue as next song)
- `/gpause` - Pause the current playback
- `/gresume` - Resume paused playback
- `/gstop` - Stop playback, clear queue, and leave voice channel

### Queue Management
- `/gqueue` - View current playback queue and pagination
- `/gskip` - Skip current song
- `/gskipplay <query>` - Skip current song and immediately play the new song
- `/gprevious` - Replay the previous song
- `/gshuffle` - Shuffle tracks in queue
- `/gloop <mode>` - Set loop mode (`Off`, `Track`, `Queue`)
- `/gclear` - Clear all pending tracks from the queue

### Advanced Control
- `/gseek <time>` - Seek to timestamp (e.g. `01:30` or `90`)
- `/gjump <position>` - Jump a specific queued song to play next
- `/gremove <position>` - Remove a specific track from queue

### System & Diagnostics
- `/gstats` - Real-time statistics: RAM RSS/Heap, Uptime, VPN/Proxy Egress status, Circuit Breaker state
- `/gproxy status` - View proxy pool metrics, active count, and latency
- `/gproxy test` - Benchmark current egress against YouTube anti-bot immediately
- `/gproxy blacklist` - List currently blacklisted proxies
- `/gproxy clear` - Clear proxy blacklist

### Info & Utility
- `/gnowplaying` - View song progress and detailed track info
- `/glyrics` - Search lyrics for the playing track
- `/ghelp` - Show all commands and help guide

### Admin Only
- `/gvolume <amount>` - Adjust bot playback volume (0-150%)
- `/gupdate` - Reload all command files and register Slash Commands without restarting

---

## License
This project is Open Source and licensed under the [MIT License](LICENSE).
