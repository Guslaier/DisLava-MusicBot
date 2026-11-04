<div align="center">
  <h1>GOOLIX MusicBot</h1>
  <p><strong>Ultra-Light High-Performance Standalone Discord Music Bot</strong></p>
  
  [![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue?logo=discord&logoColor=white)](https://discord.js.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-18.x+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Audio Engine](https://img.shields.io/badge/Audio%20Engine-yt--dlp%20%2B%20FFmpeg%20%2B%20Opus-red)](https://github.com/yt-dlp/yt-dlp)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

<br />

**GOOLIX** is a modern, high-performance Discord Music Bot powered directly by **Discord.js v14**, **@discordjs/voice**, embedded **yt-dlp**, and **FFmpeg**. It runs as an ultra-light, self-contained standalone Node.js service without needing Java, Lavalink, or external server daemons.

It features local NVMe caching, direct Opus stream encoding, YouTube Radio Mix Autoplay with artist diversity, an interactive 3-row player card, LRCLIB + YouTube description lyrics search, favorites management, and automatic dead card self-cleaning.

> **Note for general users:** This project is Open Source and designed to be self-hosted on your own servers or Cloud VPS.

---

## Key Features

- **Standalone Architecture**: 100% pure Node.js runtime. No Java runtime or Lavalink server required.
- **Ultra-Light Footprint**: Optimized memory consumption (~15–30 MB RAM baseline) with V8 GC tuning.
- **Instant Playback & Pre-Caching**: Background pre-fetches and pre-caches upcoming songs to disk for 0s instantaneous skips (~160ms dispatch).
- **Smart Autoplay (YouTube Radio Mix)**: Continuous playback powered by YouTube's official Radio Mix (`list=RD`) featuring **Artist Diversity Filtering** to maintain musical tone without repeating the same artist consecutively.
- **Interactive 3-Row Player Card**: Beautiful Hot Pink Discord Embed with interactive buttons:
  - Row 1: `[ ⏮️ Prev ] [ ⏪ -10s ] [ ⏯️ Play/Pause ] [ ⏩ +10s ] [ ⏭️ Skip ]`
  - Row 2: `[ 🔀 Shuffle ] [ 🔁 Loop ] [ 📋 Queue ] [ 📄 Lyrics ] [ 💖 Favorites ]`
  - Row 3: `[ 🔊 Volume ] [ 📻 Autoplay ] [ 🛑 Stop/Leave ]`
- **Dead Card Auto-Cleaner**: Stale cards from previous tracks or bot restarts automatically delete themselves on interaction, plus on-demand `/gcleancard` channel sweep.
- **Guild Settings Persistence**: Server volume and autoplay states are automatically saved per-guild in `data/guildSettings.json`, persisting across restarts and bot leaves.
- **Hybrid Lyrics Engine**: Dual-tier lyrics provider querying LRCLIB first, with automatic YouTube Video Description regex fallback for Thai indie and rap releases.
- **Isolated VPN Tunnel Egress**: Supports ProtonVPN/OpenVPN isolated policy routing (`--source-address`) for full YouTube access without altering host default routing or endangering SSH access.
- **Dynamic Free Proxy Pool & Circuit Breaker**: Auto-benchmarks proxies with 6-hour anti-bot quarantine and transparent SoundCloud bypass when YouTube restricts datacenter IPs.
- **Favorites System**: Personal bookmarking (`/gfav`) to store and playback your favorite tracks anytime.

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
| `STREAM_MODE` | `auto` | Streaming mode: `auto` (hybrid disk cache for <=6m songs, pipe for long mixes), `pipe` (live stream), or `cache`. |
| `DEFAULT_VOLUME` | `100` | Default playback volume (0-150) for newly joined servers. |

---

## Prerequisites

- [Node.js](https://nodejs.org/) (Version 18.0.0 or higher recommended)
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
   *(Note: FFmpeg is automatically discovered from `/usr/bin/ffmpeg` or bundled in `bin/`!)*

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

   - **Scenario 3: Running on a Cloud VPS with Isolated VPN (Recommended for Full YouTube Access)**
     - Automated isolated VPN installer:
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
pm2 start ecosystem.config.cjs
# or
pm2 start index.js --name "goolix-bot"
```
Check logs and status:
```bash
pm2 logs
pm2 status
```

---

## Slash Commands

### 🎵 Playback & Autoplay
- `/gplay <query> [top] [playlist]` - Play a song or search query (optional `top` to jump queue)
- `/gplaylist <query> [limit]` - Enqueue full playlists or albums (5-100 tracks)
- `/gautoplay` - Toggle intelligent continuous playback when queue is empty (saved per server)
- `/gpause` - Pause the current playback
- `/gresume` - Resume paused playback
- `/gstop` - Stop playback, clear queue, and leave voice channel
- `/gfav <add|list|play|remove>` - Manage and play your personal favorite songs

### 📑 Queue Control
- `/gqueue` - View current playback queue and pagination
- `/gskip` - Skip current song (triggers instant Autoplay if queue empty)
- `/gskipplay <query>` - Skip current song and immediately play the new query
- `/gprevious` - Replay the previous song
- `/gshuffle` - Shuffle tracks in queue
- `/gloop <mode>` - Set loop mode (`Off`, `Track`, `Queue`)
- `/gclear` - Clear all pending tracks from queue
- `/gjump <position>` - Jump a specific queued song to play next
- `/gmove <from> <to>` - Move a track position in queue
- `/gremove <position>` - Remove a specific track from queue

### 🎛️ Audio & Seek
- `/gvolume [amount]` - View or adjust bot volume 0-150% (saved permanently per server)
- `/gseek <time>` - Seek to timestamp (e.g. `01:30` or `90`)
- `/gforward [seconds]` - Fast-forward playback (default: 10s)
- `/gbackward [seconds]` - Rewind playback (default: 10s)

### 🛡️ Info, Lyrics & Maintenance
- `/gnowplaying` - View interactive player card with real-time progress bar
- `/glyrics [query]` - View synchronized or plain lyrics (LRCLIB + YouTube fallback)
- `/gcleancard` - Sweep and delete old/stale player cards from the current channel
- `/gstats` - Real-time statistics: RAM RSS/Heap, Uptime, VPN Egress, Circuit Breaker state
- `/gproxy <status|test|blacklist|clear>` - Manage smart proxy pool & benchmark egress
- `/gping` - Check Discord API latency and WebSocket heartbeat
- `/gupdate` - Hot-reload commands and register Slash Commands without rebooting
- `/ghelp` - Show all commands and user guide

---

## License
This project is Open Source and licensed under the [MIT License](LICENSE).
