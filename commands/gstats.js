const { EmbedBuilder, SlashCommandBuilder, version: djsVersion } = require('discord.js');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gstats')
        .setDescription('ดูข้อมูลสถิติและการทำงานของระบบบอท'),

    run: async (client, interaction, kazagumo) => {
        const mem = process.memoryUsage();
        const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
        const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);

        const totalSeconds = Math.floor(process.uptime());
        const days = Math.floor(totalSeconds / (3600 * 24));
        const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        const activePlayers = kazagumo?.players?.size || 0;
        const totalGuilds = client.guilds.cache.size;

        const proxyManager = require('../src/helpers/proxyManager');
        const proxyStatus = proxyManager.getStatus();
        const proxyBadge = proxyStatus.configured
            ? (proxyStatus.isOnline ? `🟢 Smart Pool (${proxyStatus.activeCount} Live | ${proxyStatus.bestLatency})` : '🔴 Pool Exhausted (Retrying)')
            : '⚪ Direct (Bypass Mode)';

        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('📊 ข้อมูลสถิติและสถานะระบบ DisLava')
            .addFields(
                { name: '⏱️ Uptime', value: `\`${uptimeStr}\``, inline: true },
                { name: '🧠 RAM (RSS / Heap)', value: `\`${rssMB} MB / ${heapUsedMB} MB\``, inline: true },
                { name: '🛡️ Proxy Egress', value: `\`${proxyBadge}\``, inline: true },
                { name: '🎧 Active Players', value: `\`${activePlayers} ห้อง\``, inline: true },
                { name: '🏰 Servers', value: `\`${totalGuilds} เซิร์ฟเวอร์\``, inline: true },
                { name: '⚙️ Node.js / D.js', value: `\`${process.version} / v${djsVersion}\``, inline: true },
                { name: '⚡ Audio Engine', value: '`Ultra-Light Direct OggOpus`', inline: true }
            )
            .setFooter({ text: 'ทำงานเบาสบาย กินแรมน้อย ไม่เปลืองเครื่องค่ะ! 💃✨' });

        return interaction.reply({ embeds: [embed] });
    }
};

