<div align="center">
  <h1>DisLava-MusicBot</h1>
  <p><strong>Discord Music Bot for your server</strong></p>
  
  [![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue?logo=discord&logoColor=white)](https://discord.js.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-16.11.0+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Lavalink](https://img.shields.io/badge/Lavalink-Supported-red?logo=java&logoColor=white)](https://github.com/lavalink-devs/Lavalink)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

<br />

**DisLava-MusicBot** is an Open Source Discord Music Bot integrated with **Lavalink, Shoukaku, and Kazagumo**. Designed to bypass YouTube's strict bot blocking, it features a smart link parser that allows users to paste YouTube Links and Playlists seamlessly by intelligently routing the audio through **SoundCloud**. It includes an advanced queue management system and a visually pleasing Hot Pink UI (Embed) design.

> **Note for general users:** This project is Open Source and designed to be self-hosted on your own servers. It is not provided as a public or commercial bot to comply with streaming service Terms of Service (ToS).

---

## Features
- **Smart YouTube Bypass**: Since Lavalink often blocks YouTube directly, the bot intelligently parses YouTube Links and Playlists (via oEmbed and `youtube-sr`) and automatically fetches the exact tracks from **SoundCloud** behind the scenes.
- **YouTube Playlist Support**: Paste any YouTube playlist link, and the bot will smoothly queue up to 30 songs asynchronously without stuttering or blocking the audio stream.
- **Auto Title Cleaner**: Strips unnecessary tags (like `[Official MV]`, `(Audio)`) from video titles to guarantee a high match rate when falling back to SoundCloud searches.
- **Advanced Queue System**: Supports queue insertion (`/gplay top`), queue jumping (`/gjump`), and skip-play (`/gskipplay`).
- **Full Playback Control**: Pause, resume, seek, volume control, loop, and shuffle.
- **Hot-Reload Commands**: Admins can use `/gupdate` to reload all commands instantly without restarting the bot.
- **Clean Design**: All alerts and messages use a Hot Pink (`#FF69B4`) EmbedBuilder for a clean and readable aesthetic.

---

## Prerequisites
Before installation, ensure you have the following installed on your system:
- [Node.js](https://nodejs.org/) (Version 16.11.0 or higher for Discord.js v14)
- [Java 17](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html) or higher (Required for Lavalink Server)
- [PM2](https://pm2.keymetrics.io/) to keep the bot and Lavalink running 24/7 (`npm install pm2 -g`)
- Discord Bot Token (Create one at the [Discord Developer Portal](https://discord.com/developers/applications))

---

## Installation & Setup

1. **Clone the repository and install dependencies**
   ```bash
   git clone https://github.com/Guslaier/DisLava-MusicBot.git
   cd DisLava-MusicBot
   npm install
   ```

2. **Environment Variables Configuration**
   - Copy or rename `.env.example` to `.env`
   - Insert your bot token inside the `.env` file
     ```env
     DISCORD_TOKEN=your_discord_bot_token_here
     ```

3. **Lavalink Server Setup**
   - Download `Lavalink.jar` (Version 4.0.0 or higher) from [Lavalink Releases](https://github.com/lavalink-devs/Lavalink/releases)
   - Place the downloaded file into the `LavalinkServer` folder
   - *Note: The YouTube music plugin will be automatically downloaded and installed into the `plugins` folder by Lavalink upon its first run (configured in `application.yml`).*

---

## Usage

You need to run two processes simultaneously: Lavalink Server and the Discord Bot.

### 1. Running Lavalink Server (using PM2)
```bash
cd LavalinkServer
pm2 start "java -jar Lavalink.jar" --name LAVALINK
cd ..
```

### 2. Running the Discord Bot (using PM2)
```bash
pm2 start index.js --name BOT_LAVA
```
*You can check the running status and logs via `pm2 list`, `pm2 monit`, and `pm2 log`.*

---

## Slash Commands

### Basic Playback
- `/gplay <query> [top]` - Search and play a song by name or URL (set `top` to play it next)
- `/gpause` - Pause the current playback
- `/gresume` - Resume the paused playback
- `/gstop` - Stop the music, clear the queue, and disconnect from the voice channel

### Queue Control
- `/gqueue` - Display the current music queue
- `/gskip` - Skip the currently playing song
- `/gskipplay <query>` - Play this song immediately (skips current song and inserts into queue)
- `/gprevious` - Play the previously played song
- `/gshuffle` - Shuffle the music queue
- `/gloop <mode>` - Toggle loop mode (Off / Single Track / Entire Queue)
- `/gclear` - Clear all pending songs in the queue

### Advanced Options
- `/gseek <time>` - Seek to a specific timestamp in the current song (e.g., 01:30 or 90)
- `/gjump <position>` - Jump a specific song in the queue to be played next
- `/gremove <position>` - Remove a specific song from the queue by its position

### Information
- `/gnowplaying` - Show details of the currently playing song with a progress bar
- `/glyrics` - Search for lyrics of the currently playing song
- `/ghelp` - View the bot's manual and all available commands

### Admin Only
- `/gvolume <amount>` - Adjust the bot's volume (0-150%)
- `/gupdate` - (Admin only) Reload all command files and update Slash Commands without restarting the bot

---

## Contributing
All developers are welcome to contribute to DisLava-MusicBot. If you find any bugs or have interesting feature requests, feel free to open **Issues** or submit **Pull Requests**.

## License
This project is Open Source and licensed under the [MIT License](LICENSE) - You are free to use, modify, and distribute it.
