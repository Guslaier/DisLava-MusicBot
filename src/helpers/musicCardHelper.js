const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function formatDuration(ms) {
    if (!ms || ms < 0 || isNaN(ms)) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor((totalSeconds / 60) % 60);
    const hours = Math.floor(totalSeconds / 3600);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function createProgressBar(currentMs, totalMs, barLength = 15) {
    if (!totalMs || totalMs <= 0 || isNaN(totalMs)) {
        return '━━━━━━━━━━━━━━━';
    }

    const ratio = Math.min(1, Math.max(0, currentMs / totalMs));
    const activeIndex = Math.round(ratio * barLength);

    let bar = '';
    for (let i = 0; i < barLength; i++) {
        if (i === activeIndex) {
            bar += '🔘';
        } else if (i < activeIndex) {
            bar += '━';
        } else {
            bar += '─';
        }
    }
    return bar;
}

function createNowPlayingCard(player, track) {
    const isPaused = !!player.paused;
    const currentPosition = player.position || 0;
    const totalDuration = track.length || 0;
    const isStream = track.isStream || false;

    const timeCurrent = formatDuration(currentPosition);
    const timeTotal = isStream ? '🔴 LIVE' : formatDuration(totalDuration);
    const progressVisual = isStream ? '🔴 ━━━━━━━━━━━━━━' : createProgressBar(currentPosition, totalDuration);

    const voiceChannel = player.manager.client.channels.cache.get(player.voiceId);
    const channelName = voiceChannel ? voiceChannel.name : 'Voice Channel';
    const membersCount = voiceChannel ? voiceChannel.members.filter(m => !m.user.bot).size : 1;

    let sourceBadge = '🔴 YouTube';
    if (track.realSource) {
        if (track.realSource.includes('Bypass')) {
            sourceBadge = '🟠 SoundCloud (Bypass)';
        } else if (track.realSource.includes('SoundCloud')) {
            sourceBadge = '🟠 SoundCloud';
        } else {
            sourceBadge = '🔴 YouTube';
        }
    } else if (track.uri && track.uri.includes('soundcloud.com')) {
        sourceBadge = '🟠 SoundCloud';
    }

    let loopBadge = '🔁 Off';
    if (player.loop === 'track') loopBadge = '🔂 Track';
    else if (player.loop === 'queue') loopBadge = '🔁 Queue';

    const volBadge = `🔊 ${player.volume || 100}%`;
    const requesterTag = track.requester ? `  •  👤 <@${track.requester.id || track.requester}>` : '';
    const safeTitle = track.title || 'Unknown Title';
    const safeAuthor = track.author || 'Unknown Artist';

    const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setAuthor({
            name: `${player.manager.client.user.username}  •  Now Playing`,
            iconURL: player.manager.client.user.displayAvatarURL()
        })
        .setTitle(safeTitle)
        .setURL(track.uri || 'https://discord.com')
        .setDescription(
            `**${safeAuthor}**${requesterTag}\n\n` +
            `\`${sourceBadge}\`  \`⚡ 320kbps\`  \`${loopBadge}\`  \`${volBadge}\`\n\n` +
            `\`${timeCurrent}\`  ${progressVisual}  \`${timeTotal}\``
        )
        .setFooter({
            text: `🔊 #${channelName}  •  👥 ${membersCount} listening`
        });

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    // Row 1: Playback Controls (Shuffle, Previous, Play/Pause, Skip, Loop)
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_shuffle')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_previous')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!player.queue.previous),
        new ButtonBuilder()
            .setCustomId('music_pause_resume')
            .setEmoji(isPaused ? '▶️' : '⏸️')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_loop')
            .setEmoji('🔁')
            .setStyle(player.loop !== 'none' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    // Row 2: Secondary Utilities (Queue, Lyrics, Favorites, Volume)
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_queue')
            .setEmoji('📋')
            .setLabel('Queue')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_lyrics')
            .setEmoji('📄')
            .setLabel('Lyrics')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_favorite')
            .setEmoji('💖')
            .setLabel('Favorites')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_volume')
            .setEmoji('🔊')
            .setLabel('Volume')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('🛑')
            .setLabel('ปิดแอป')
            .setStyle(ButtonStyle.Danger)
    );

    return {
        embeds: [embed],
        components: [row1, row2]
    };
}

module.exports = {
    createNowPlayingCard,
    formatDuration,
    createProgressBar
};

