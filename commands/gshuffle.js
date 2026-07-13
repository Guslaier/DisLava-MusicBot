const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gshuffle',
        description: 'สุ่มลำดับคิวเพลง',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ไม่มีคิวเพลงค่ะ! จะให้สุ่มอะไรดีน้าาา 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (player.queue.length <= 1) {
            embed.setDescription('⚠️ แหม! ต้องมีเพลงในคิวมากกว่า 1 เพลงถึงจะให้สุ่มได้นะคะที่รัก 🤭');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        player.queue.shuffle();
        embed.setDescription('🔀 เขย่าคิวให้ใหม่แล้วค่ะ! สุ่มลำดับคิวเพลงเรียบร้อย ลุ้นๆ ว่าเพลงต่อไปคืออะไรน้าา 🎲✨');
        return interaction.reply({ embeds: [embed] });
    }
};
