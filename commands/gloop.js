const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gloop',
        description: 'วนลูปเพลง',
        options: [
            {
                name: 'mode',
                type: 3, // STRING
                description: 'เลือกโหมดการวนลูป',
                required: true,
                choices: [
                    { name: 'ปิดลูป (Off)', value: 'none' },
                    { name: 'วนเพลงนี้ (Track)', value: 'track' },
                    { name: 'วนทั้งคิว (Queue)', value: 'queue' }
                ]
            }
        ]
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ไม่มีคิวเพลงค่ะ! จะให้ดีเจวนลูปความเหงาเหรอคะ? 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const mode = interaction.options.getString('mode');
        player.setLoop(mode);

        let modeText = '❌ ปิดการวนลูปแล้วค่ะ ฟังไปเรื่อยๆ ชิลๆ นะคะ';
        if (mode === 'track') modeText = '🔂 วนเพลงปัจจุบันซ้ำๆ ฟังกันให้หูแฉะไปเลยค่า!';
        if (mode === 'queue') modeText = '🔁 วนทั้งคิว ปาร์ตี้นี้ไม่มีจบค่ะ!';

        embed.setDescription(`**${modeText}** 🎧💋`);
        return interaction.reply({ embeds: [embed] });
    }
};
