const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gplay',
        description: 'เล่นเพลงจาก YouTube หรือชื่อเพลง',
        options: [
            {
                name: 'query',
                type: 3, // STRING
                description: 'ชื่อเพลง หรือ ลิ้งก์ YouTube',
                required: true,
            },
            {
                name: 'top',
                type: 5, // BOOLEAN
                description: 'เล่นเพลงนี้เป็นคิวต่อไป (แซงคิว)',
                required: false,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const voiceChannel = interaction.member?.voice?.channel;
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!voiceChannel) {
            embed.setDescription('❌ อ๊ะๆ! ตัวเธอต้องเข้าห้องเสียงก่อนนะคะ เดี๋ยวดีเจเหงาแย่เลย~ 🥺');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const query = interaction.options.getString('query');
        const top = interaction.options.getBoolean('top');
        await interaction.deferReply();

        let player = kazagumo.players.get(interaction.guild.id);
        if (!player) {
            player = await kazagumo.createPlayer({
                guildId: interaction.guild.id,
                textId: interaction.channel.id,
                voiceId: voiceChannel.id,
                volume: 100
            });
        }

        // Fast Single-Pass Search with built-in YouTube Anti-Ban and SoundCloud Fallback
        const result = await kazagumo.search(query, {
            requester: interaction.user
        });

        if (!result.tracks.length) {
            embed.setDescription('❌ หาเพลงไม่เจอค่ะ! (ลองลบคำว่า Official/MV ออก หรือพิมพ์แค่ชื่อเพลงสั้นๆ ดูนะคะ) 😿');
            return interaction.followUp({ embeds: [embed] });
        }

        if (result.type === 'PLAYLIST') {
            for (const track of result.tracks) {
                player.queue.add(track);
            }
            embed.setDescription(`✅ จัดไปชุดใหญ่ไฟกระพริบ! เพิ่มเพลย์ลิสต์ **${result.playlistName}** (${result.tracks.length} เพลง) ลงในคิวแล้วค่ะ 💃✨`);
            await interaction.followUp({ embeds: [embed] });
        } else {
            const track = result.tracks[0];
            if (top && player.queue.length > 0) {
                player.queue.unshift(track);
            } else {
                player.queue.add(track);
            }
            embed.setDescription(`**${track.title}**\n\n${(player.playing || player._starting) ? (top ? `⬆️ วีไอพีสุดๆ! แซงคิวเป็นเพลงต่อไปให้แล้วค่ะ 💅` : `✅ รับแซ่บค่ะ! ดีเจสาวจับยัดลงคิวให้แล้วนะคะ เตรียมตัวโยกได้เลย 📝💋`) : `▶️ ดีเจจัดให้! เริ่มเล่นเพลงแล้วค่ะ 🎧✨`}`);
            await interaction.followUp({ embeds: [embed] });
        }

        if (!player.playing && !player._starting && !player.paused) {
            try {
                await player.play();
            } catch (error) {
                console.error('[gplay] Play error:', error.message);
                return interaction.followUp({ content: '❌ เกิดข้อผิดพลาดในการเริ่มเล่นเพลงค่ะ', flags: 64 });
            }
        }
    }
};
