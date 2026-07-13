const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gseek',
        description: 'กรอเพลงไปยังเวลาที่กำหนด (เช่น 01:30 หรือ 90)',
        options: [
            {
                name: 'time',
                type: 3, // STRING
                description: 'เวลาที่ต้องการกรอไป (เช่น 01:30 หรือระบุเป็นวินาที)',
                required: true,
            },
        ],
    },
    run: async (client, interaction, kazagumo) => {
        const timeInput = interaction.options.getString('time');
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || !player.playing) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ! จะให้ดีเจกรอความเหงาเหรอคะ? 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let timeMs = 0;
        if (timeInput.includes(':')) {
            const parts = timeInput.split(':').map(Number);
            if (parts.length === 2) {
                // MM:SS
                timeMs = (parts[0] * 60 + parts[1]) * 1000;
            } else if (parts.length === 3) {
                // HH:MM:SS
                timeMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
            }
        } else {
            // ถือว่าเป็นวินาที
            timeMs = Number(timeInput) * 1000;
        }

        if (isNaN(timeMs) || timeMs < 0) {
            embed.setDescription('❌ อ๊ะ! รูปแบบเวลาไม่ถูกต้องค่ะ ลองพิมพ์แบบ 01:30 หรือใส่เป็นวินาทีดูนะคะ 🧐');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (timeMs > player.queue.current.length) {
            embed.setDescription('❌ เวลาเกินความยาวเพลงค่ะ! กรอซะทะลุเพลงเลยนะตัวเธอ 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.seek(timeMs);
        embed.setDescription(`⏩ วาร์ปให้แล้วค่ะ! กรอเพลงไปยังเวลา **${timeInput}** ตามคำขอเป๊ะๆ ✨`);
        return interaction.reply({ embeds: [embed] });
    }
};
