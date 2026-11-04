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
        )
        .addSubcommand(sub =>
            sub.setName('switch')
                .setDescription('สลับไปใช้เซิร์ฟเวอร์ VPN SG ตัวถัดไปใน Pool (Auto-Failover / Manual Switch)')
                .addStringOption(opt =>
                    opt.setName('server')
                        .setDescription('ชื่อเซิร์ฟเวอร์ที่ต้องการ (เช่น sg-free-15 หรือปล่อยว่างเพื่อไปตัวถัดไป)')
                        .setRequired(false)
                )
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
            const targetArg = proxyManager.getNetworkArgString();
            if (!targetArg) {
                embed.setDescription('❌ ไม่มี VPN หรือ Proxy ที่พร้อมใช้งานในขณะนี้ค่ะ (บอทใช้ Direct/Bypass แทน)');
                return interaction.followUp({ embeds: [embed] });
            }

            const res = await proxyManager.testYouTube(targetArg);

            if (res.ok) {
                embed.setColor('#00FF00');
                embed.setTitle('✅ ผลการทดสอบ: ผ่านฉลุย!');
                const targetName = proxyManager.isVpnActive() ? `ProtonVPN (${proxyManager.getVpnSourceIp()})` : targetArg;
                embed.setDescription(`เครือข่าย \`${targetName}\` ใช้งานดึงสตรีม YouTube ได้ปกติ\n⏱️ Latency: \`${res.latency}ms\``);
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

        if (subcommand === 'switch') {
            await interaction.deferReply();
            if (!proxyManager.vpnEnabled) {
                embed.setDescription('❌ ระบบ VPN ถูกปิดใช้งานอยู่ค่ะ (ENABLE_VPN=false)');
                return interaction.followUp({ embeds: [embed] });
            }

            const targetServer = interaction.options.getString('server') || 'next';
            const res = await proxyManager.switchVpnServer(targetServer);

            if (res.ok) {
                embed.setColor('#00FF00');
                embed.setTitle('🔄 สลับเซิร์ฟเวอร์ VPN สำเร็จแล้วค่ะ!');
                embed.setDescription(`บอทเชื่อมต่อไปยังเซิร์ฟเวอร์ใหม่เรียบร้อยแล้วค่ะ\n\n🇸🇬 **เซิร์ฟเวอร์:** \`${res.server}\`\n📍 **Interface IP:** \`${res.ip || 'Detecting...'}\``);
            } else {
                embed.setColor('#FF0000');
                embed.setTitle('❌ ไม่สามารถสลับเซิร์ฟเวอร์ VPN ได้');
                embed.setDescription(`เกิดข้อผิดพลาด: \`${res.reason}\``);
            }
            return interaction.followUp({ embeds: [embed] });
        }
    }
};

