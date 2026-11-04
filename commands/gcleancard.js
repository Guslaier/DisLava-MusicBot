const { MessageFlags } = require('discord.js');

module.exports = {
    data: {
        name: 'gcleancard',
        description: 'กวาดล้างการ์ดเพลงเก่าหรือการ์ดที่ค้างอยู่ในห้องนี้',
    },
    run: async (client, interaction, kazagumo) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channel = interaction.channel;
        if (!channel || !channel.messages) {
            return interaction.followUp({
                content: '❌ ไม่สามารถเข้าถึงข้อความในห้องนี้ได้ค่ะ 🥺',
                flags: MessageFlags.Ephemeral
            });
        }

        const player = kazagumo.players.get(interaction.guild.id);
        const activeCardId = player?.nowPlayingMessage?.id;

        try {
            const fetched = await channel.messages.fetch({ limit: 50 });
            const deadCards = fetched.filter(msg => {
                if (msg.author.id !== client.user.id) return false;
                if (activeCardId && msg.id === activeCardId) return false;

                const hasMusicButtons = msg.components?.some(row =>
                    row.components?.some(btn => btn.customId?.startsWith('music_'))
                );
                const hasMusicEmbed = msg.embeds?.some(e =>
                    e.author?.name?.includes('Now Playing') || e.title?.includes('Now Playing')
                );
                return hasMusicButtons || hasMusicEmbed;
            });

            if (deadCards.size === 0) {
                return interaction.followUp({
                    content: '✨ ไม่พบการ์ดเพลงที่ค้างอยู่เลยค่ะ ห้องแชทสะอาดเรียบร้อยดีแล้วน้า 💕',
                    flags: MessageFlags.Ephemeral
                });
            }

            let deletedCount = 0;
            for (const msg of deadCards.values()) {
                try {
                    await msg.delete();
                    deletedCount++;
                } catch {
                    try {
                        await msg.edit({ components: [] });
                        deletedCount++;
                    } catch {}
                }
            }

            return interaction.followUp({
                content: `🧹 กวาดล้างเรียบร้อย! ลบการ์ดเพลงเก่าที่ค้างอยู่จำนวน **${deletedCount}** ใบแล้วค่ะ ✨`,
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            return interaction.followUp({
                content: `❌ เกิดข้อผิดพลาดขณะลบการ์ด: ${err.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
