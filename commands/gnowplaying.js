const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gnowplaying',
        description: 'ดูข้อมูลเพลงที่กำลังเล่นอยู่',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ อ๊ะ! ตอนนี้ไม่ได้เปิดเพลงอะไรอยู่เลยค่ะ สเตจเงียบกริบ 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const track = player.queue.current;
        if (!track) {
            embed.setDescription('❌ ไม่พบข้อมูลเพลงค่ะ! ผีหลอกดีเจรึเปล่าเนี่ย 😱');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const formatTime = (ms) => {
            if (!ms) return '00:00';
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
            if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        const currentPosition = formatTime(player.position);
        const totalLength = track.isStream ? '🔴 LIVE' : formatTime(track.length);
        
        // จำลองแถบเวลาเล่นเพลง (Progress Bar)
        const progressBarLength = 15;
        let progress = 0;
        if (!track.isStream && track.length > 0) {
            progress = Math.round((player.position / track.length) * progressBarLength);
        }
        const progressBar = '▬'.repeat(progress) + '🔘' + '▬'.repeat(progressBarLength - progress);

        const currentTitle = track.title ? track.title.replace(/\[/g, '(').replace(/\]/g, ')') : "Unknown";
        embed.setTitle('🎧 กำลังเล่นเพลงนี้อยู่ค่ะ')
             .setDescription(`**[${currentTitle}](${track.uri})**\n\n\`${currentPosition}\` ${progressBar} \`${totalLength}\``)
             .addFields(
                 { name: '👤 ขอโดย', value: `<@${track.requester.id}>`, inline: true },
                 { name: '🎤 ศิลปิน', value: track.author || 'ไม่ทราบ', inline: true },
                 { name: '🔂 โหมดลูป', value: player.loop === 'none' ? 'ปิด' : player.loop === 'track' ? 'เพลงเดียว' : 'ทั้งคิว', inline: true }
             )
             .setFooter({ text: 'โยกหัวตามจังหวะได้เลยน้า~ 💋' });

        if (track.thumbnail) {
            embed.setThumbnail(track.thumbnail);
        }

        return interaction.reply({ embeds: [embed] });
    }
};
