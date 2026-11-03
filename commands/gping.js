const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gping')
        .setDescription('เช็คความหน่วงและการตอบสนองของบอท (Ping)'),

    run: async (client, interaction) => {
        const sent = await interaction.reply({ content: '🏓 กำลังวัดความเร็วปิงนะคะ...', fetchReply: true });
        const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const wsPing = client.ws.ping;

        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('🏓 ผลการทดสอบความหน่วง (Pong!)')
            .addFields(
                { name: '⚡ Roundtrip Latency', value: `\`${roundtripLatency}ms\``, inline: true },
                { name: '🌐 WebSocket Ping', value: `\`${wsPing}ms\``, inline: true }
            )
            .setFooter({ text: 'สัญญาณเสถียร พร้อมส่งเสียงเพลงสุดฟินค่ะ! 💋' });

        return interaction.editReply({ content: null, embeds: [embed] });
    }
};

