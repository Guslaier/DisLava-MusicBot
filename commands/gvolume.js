const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gvolume',
        description: 'ปรับระดับเสียง',
        default_member_permissions: '8',
        options: [
            {
                name: 'amount',
                type: 4, // INTEGER
                description: 'ระดับเสียง 1 - 100',
                required: true,
            }
        ]
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ไม่มีคิวเพลงค่ะ! จะให้ดีเจปรับเสียงอะไรเอ่ย 😅');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        let volume = interaction.options.getInteger('amount');
        if (volume < 0) volume = 0;
        if (volume > 150) volume = 150; // กันคนปรับเสียงดังเกินไปจนลำโพงแตก

        player.setVolume(volume);

        if (volume > 100) {
            embed.setDescription(`🔊 อื้อหือ! จัดหนักจัดเต็ม ปรับระดับเสียงทะลุหลอดเป็น **${volume}%** แล้วค่ะ หูดับแน่นอน 🔥💋`);
        } else if (volume === 0) {
            embed.setDescription(`🔇 จุ๊ๆ! ปิดเสียงเป็น **0%** แล้วค่ะ แอบฟังอะไรกันอยู่เนี่ย 🤭`);
        } else {
            embed.setDescription(`🔊 รับทราบค่ะ! ดีเจปรับระดับเสียงเป็น **${volume}%** ให้พอดีหูแล้วน้า 🎧💕`);
        }

        return interaction.reply({ embeds: [embed] });
    }
};
