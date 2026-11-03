const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const favoriteManager = require('../src/helpers/favoriteManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gfav')
        .setDescription('จัดการเพลงโปรดของคุณ (Favorites)')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('บันทึกเพลงที่กำลังเล่นอยู่ลงในรายการโปรด')
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('ดูรายการเพลงโปรดทั้งหมดของคุณ')
        )
        .addSubcommand(sub =>
            sub.setName('play')
                .setDescription('เปิดเล่นเพลงโปรดทั้งหมดของคุณเข้าคิว')
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('ลบเพลงออกจากรายการเพลงโปรด')
                .addIntegerOption(opt =>
                    opt.setName('number')
                        .setDescription('ลำดับเพลงในรายการโปรดที่ต้องการลบ')
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),

    run: async (client, interaction, kazagumo) => {
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (sub === 'add') {
            const player = kazagumo.players.get(interaction.guild.id);
            if (!player || !player.playing || !player.queue.current) {
                embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ตอนนี้ค่ะ! เล่นเพลงก่อนแล้วค่อยกดใจน้า~ 🥺');
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            const track = player.queue.current;
            const added = favoriteManager.addFavorite(userId, track);
            if (added) {
                embed.setDescription(`💖 ว้าว! บันทึกเพลง **${track.title}** ลงในรายการเพลงโปรดของคุณเรียบร้อยแล้วค่ะ! ✨`);
            } else {
                embed.setDescription(`ℹ️ เพลง **${track.title}** มีอยู่ในรายการโปรดของคุณอยู่แล้วนะคะที่รัก 💕`);
            }
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'list') {
            const favorites = favoriteManager.getFavorites(userId);
            if (!favorites || favorites.length === 0) {
                embed.setDescription('❌ คุณยังไม่มีเพลงโปรดเลยค่ะ! ลองฟังเพลงแล้วกดปุ่ม 💖 หรือใช้ `/gfav add` ดูนะคะ 🥺');
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            embed.setTitle(`💖 รายการเพลงโปรดของคุณ (${favorites.length} เพลง)`);
            let desc = '';
            favorites.slice(0, 15).forEach((item, index) => {
                desc += `**${index + 1}.** [${item.title}](${item.uri}) - *${item.author}*\n`;
            });
            if (favorites.length > 15) {
                desc += `\n*...และอีก ${favorites.length - 15} เพลง*`;
            }
            desc += '\n\n💡 *พิมพ์ `/gfav play` เพื่อเล่นเพลงโปรดทั้งหมดเข้าคิวได้เลยนะคะ!*';
            embed.setDescription(desc);
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'remove') {
            const index = interaction.options.getInteger('number');
            const favorites = favoriteManager.getFavorites(userId);
            if (!favorites || favorites.length === 0) {
                embed.setDescription('❌ คุณยังไม่มีรายการเพลงโปรดเลยค่ะ');
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (index < 1 || index > favorites.length) {
                embed.setDescription(`❌ ลำดับไม่ถูกต้องค่ะ! คุณมีเพลงโปรดทั้งหมด **${favorites.length}** เพลง`);
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            const target = favorites[index - 1];
            favoriteManager.removeFavorite(userId, target.identifier || target.uri);
            embed.setDescription(`🗑️ ลบเพลง **${target.title}** ออกจากรายการเพลงโปรดเรียบร้อยแล้วค่ะ!`);
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'play') {
            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                embed.setDescription('❌ อ๊ะๆ! ตัวเธอต้องเข้าห้องเสียงก่อนนะคะ เดี๋ยวดีเจเหงาแย่เลย~ 🥺');
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            const favorites = favoriteManager.getFavorites(userId);
            if (!favorites || favorites.length === 0) {
                embed.setDescription('❌ ยังไม่มีเพลงในรายการโปรดให้เปิดเลยค่ะ ลองเพิ่มเพลงก่อนน้า~ 💖');
                return interaction.reply({ embeds: [embed], flags: 64 });
            }

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

            let loadedCount = 0;
            for (const fav of favorites) {
                const searchRes = await kazagumo.search(fav.uri || `${fav.title} ${fav.author}`, {
                    requester: interaction.user
                });
                if (searchRes && searchRes.tracks.length > 0) {
                    player.queue.add(searchRes.tracks[0]);
                    loadedCount++;
                }
            }

            embed.setDescription(`💖 ขนมาให้ทั้งใจ! เพิ่มเพลงโปรด **${loadedCount}** เพลงลงในคิวเรียบร้อยแล้วค่ะ ปาร์ตี้เริ่มได้เลย! 💃✨`);
            await interaction.followUp({ embeds: [embed] });

            if (!player.playing && !player._starting && !player.paused) {
                try {
                    await player.play();
                } catch (err) {
                    console.error('[gfav play] Play error:', err.message);
                }
            }
        }
    }
};

