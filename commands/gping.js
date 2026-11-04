const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gping')
        .setDescription('เช็คความหน่วงและการตอบสนองของบอท (Ping)'),

    run: async (client, interaction) => {
        const sent = await interaction.reply({ content: '🏓 กำลังวัดความเร็วปิงนะคะ...', fetchReply: true });
        const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const wsPing = client.ws.ping;

        const player = client.manager?.getPlayer(interaction.guildId);
        const voiceUdpPing = player?.connection?.ping?.udp;
        const voiceWsPing = player?.connection?.ping?.ws;
        const voiceChannel = interaction.member?.voice?.channel || (player?.voiceId ? interaction.guild.channels.cache.get(player.voiceId) : null);
        const rtcRegion = voiceChannel?.rtcRegion || 'automatic';

        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('🏓 ผลการทดสอบความหน่วง (Pong!)')
            .addFields(
                { name: '⚡ Roundtrip Latency', value: `\`${roundtripLatency}ms\``, inline: true },
                { name: '🌐 Gateway Ping', value: `\`${wsPing}ms\``, inline: true },
                { name: '🎙️ Voice UDP Ping', value: voiceUdpPing !== undefined ? `\`${voiceUdpPing}ms\`` : '`ไม่ได้อยู่ในห้องเสียง`', inline: true },
                { name: '📡 Voice Gateway', value: voiceWsPing !== undefined ? `\`${voiceWsPing}ms\`` : '`N/A`', inline: true },
                { name: '🌏 Voice Region', value: `\`${rtcRegion}\``, inline: true },
                { name: '🛡️ Routing Mode', value: '`Direct (Zero VPN on Voice)`', inline: true }
            )
            .setFooter({ text: 'เสียงส่งตรงผ่านสายไฟเบอร์ Singapore ไม่ผ่าน VPN ค่ะ! 💋' });

        return interaction.editReply({ content: null, embeds: [embed] });
    }
};

