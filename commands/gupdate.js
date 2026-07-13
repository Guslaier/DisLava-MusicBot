const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'gupdate',
        description: 'โหลดคำสั่งใหม่และอัปเดต Slash Commands (เฉพาะ Admin)',
        default_member_permissions: '8' // 8 = Administrator
    },
    run: async (client, interaction, kazagumo) => {
        const embed = new EmbedBuilder().setColor('#FF69B4');

        // เช็คสิทธิ์ในกรณีที่ default_member_permissions ไม่ทำงาน
        if (!interaction.member.permissions.has('Administrator')) {
            embed.setDescription('❌ จุ๊ๆ! ตัวเธอไม่มีสิทธิ์ใช้คำสั่งนี้นะคะ (แอดมินเท่านั้นน้า) 🤫');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const commandsPath = path.join(__dirname, '../commands');
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            const newCommandsData = [];
            client.commands.clear();
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                delete require.cache[require.resolve(filePath)]; // ล้างแคชเพื่อให้ดึงโค้ดล่าสุด
                
                const command = require(filePath);
                if ('data' in command && 'run' in command) {
                    client.commands.set(command.data.name, command);
                    newCommandsData.push(command.data);
                }
            }

            // อัปเดต Slash Commands ไปยัง Discord
            await client.application.commands.set(newCommandsData);

            embed.setDescription('✅ รีเฟรชสเตทให้แล้วนะคะบอส! ระบบอัปเดตคำสั่งใหม่พร้อมลุยค่ะ ✨💋');
            return interaction.followUp({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            embed.setDescription('❌ ว้าย! เกิดข้อผิดพลาดตอนอัปเดตระบบ ลองเช็คดูที่ Console หน่อยนะคะบอส 🥺');
            return interaction.followUp({ embeds: [embed] });
        }
    }
};
