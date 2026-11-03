const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const proxyManager = require('../src/helpers/proxyManager');
const youtubeCircuit = require('../src/helpers/youtubeCircuit');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gproxy')
        .setDescription('จัดการและตรวจสอบระบบ Smart Proxy Pool & Blacklist')
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('ดูสถานะ Smart Proxy Pool และ Blacklist')
        )
        .addSubcommand(sub =>
            sub.setName('test')
                .setDescription('ทดสอบ Proxy ปัจจุบันกับ YouTube Anti-Bot ทันที')
        )
        .addSubcommand(sub =>
            sub.setName('blacklist')
                .setDescription('ดูรายชื่อ Proxy ที่ติด Blacklist')
        )
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('ล้าง Blacklist ทั้งหมด')
        ),

    run: async (client, interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (subcommand === 'status') {
            const status = proxyManager.getStatus();
            const circuit = youtubeCircuit.getStatus();
            embed.setTitle('🛡️ สถานะระบบ Smart Proxy Pool');
            embed.addFields(
                { name: 'สถานะ', value: status.isOnline ? '🟢 ใช้งานได้ (Online)' : '🔴 สแตนด์บาย (Direct/Bypass)', inline: true },
                { name: 'YouTube Circuit', value: `\`${circuit.status}\``, inline: true },
                { name: 'Proxy ที่ดีที่สุด', value: `\`${status.url}\``, inline: true },
                { name: 'Latency', value: `\`${status.bestLatency}\``, inline: true },
                { name: 'คะแนน (Score)', value: `\`${status.bestScore}/100\``, inline: true },
                { name: 'จำนวน Proxy ใน Pool', value: `\`${status.poolSize} ตัว (${status.activeCount} พร้อมใช้)\``, inline: true },
                { name: '🚫 ติด Blacklist', value: `\`${status.blacklistCount} ตัว\``, inline: true },
                { name: 'YouTube Verified', value: status.isYoutubeVerified ? '✅ ผ่านการทดสอบแล้ว' : '⏳ รอการยืนยัน', inline: true }
            );
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'test') {
            await interaction.deferReply();
            const bestProxy = proxyManager.getProxyUrl();
            if (!bestProxy) {
                embed.setDescription('❌ ไม่มี Proxy ที่พร้อมใช้งานใน Pool ขณะนี้ค่ะ (บอทใช้ Direct/Bypass แทน)');
                return interaction.followUp({ embeds: [embed] });
            }

            const res = await proxyManager.testYouTube(bestProxy);

            if (res.ok) {
                embed.setColor('#00FF00');
                embed.setTitle('✅ ผลการทดสอบ: ผ่านฉลุย!');
                embed.setDescription(`Proxy \`${bestProxy}\` ใช้งานดึงสตรีม YouTube ได้ปกติ\n⏱️ Latency: \`${res.latency}ms\``);
            } else if (res.isBotBlock) {
                embed.setColor('#FF0000');
                embed.setTitle('🚫 ผลการทดสอบ: ติด YouTube Anti-Bot!');
                embed.setDescription(`Proxy \`${bestProxy}\` โดน YouTube บล็อก (${res.reason})\nระบบทำการ **ย้ายเข้า Blacklist อัตโนมัติ (6 ชม.)** เรียบร้อยแล้วค่ะ!`);
            } else {
                embed.setColor('#FFA500');
                embed.setTitle('⚠️ ผลการทดสอบ: เกิดข้อผิดพลาดทางเน็ตเวิร์ก');
                embed.setDescription(`Proxy \`${bestProxy}\` เชื่อมต่อไม่สำเร็จ: \`${res.reason}\``);
            }
            return interaction.followUp({ embeds: [embed] });
        }

        if (subcommand === 'blacklist') {
            const status = proxyManager.getStatus();
            embed.setTitle(`🚫 รายชื่อ Proxy ที่ติด Blacklist (${status.blacklistCount} ตัว)`);
            if (status.blacklisted.length === 0) {
                embed.setDescription('✨ ไม่มี Proxy ใดติด Blacklist ในขณะนี้ค่ะ!');
            } else {
                const list = status.blacklisted.slice(0, 10).map((b, idx) => {
                    const remainingMin = Math.max(0, Math.round((b.expiresAt - Date.now()) / 60000));
                    return `**${idx + 1}.** \`${b.url}\`\n┗ เหตุผล: *${b.reason}* (ปลดแบนในอีก ${remainingMin} นาที)`;
                }).join('\n\n');
                embed.setDescription(list);
            }
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'clear') {
            const clearedCount = proxyManager.clearBlacklist();
            embed.setTitle('🧹 ล้าง Blacklist เรียบร้อยแล้ว');
            embed.setDescription(`ปลดแบน Proxy ทั้งหมดจำนวน **${clearedCount}** ตัวออกจาก Blacklist แล้วค่ะ!`);
            return interaction.reply({ embeds: [embed] });
        }
    }
};

