const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gautoplay')
        .setDescription('เปิดหรือปิดการเล่นเพลงต่อเนื่องอัตโนมัติเมื่อคิวหมด (Autoplay)'),

    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player) {
            embed.setDescription('❌ ยังไม่มีคิวเพลงที่กำลังเล่นอยู่ค่ะ! เปิดเพลงก่อนแล้วค่อยเปิด Autoplay น้า~ 🥺');
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        player.autoplay = !player.autoplay;
        const status = player.autoplay ? 'เปิดใช้งาน (Enabled) 🟢' : 'ปิดใช้งาน (Disabled) 🔴';

        embed.setDescription(`🎲 **ระบบเล่นเพลงต่อเนื่อง (Autoplay):** ${status}\n\n${player.autoplay ? 'เมื่อเพลงในคิวหมด ดีเจจะเลือกเพลงที่คล้ายกันมาเล่นต่อให้อัตโนมัติค่ะ ปาร์ตี้ไม่มีสะดุดแน่นอน! 💃✨' : 'เมื่อเพลงในคิวหมด บอทจะหยุดเล่นเพลงตามปกติค่ะ'}`);
        return interaction.reply({ embeds: [embed] });
    }
};

