const fs = require('fs');
const path = require('path');
const { EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: {
        name: 'gupdate',
        description: 'โหลดคำสั่งใหม่และอัปเดต Slash Commands ทั้งหมด'
    },
    run: async (client, interaction, kazagumo) => {
        const embed = new EmbedBuilder().setColor('#FF69B4');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
                    newCommandsData.push(typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data);
                }
            }

            // อัปเดต Slash Commands ไปยัง Discord
            await client.application.commands.set(newCommandsData);

            embed.setDescription('✅ รีเฟรชคำสั่งให้เรียบร้อยแล้วค่ะ! สมาชิกทุกคนสามารถใช้งานคำสั่งล่าสุดได้ทันที ✨💋');
            return interaction.followUp({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            embed.setDescription('❌ ว้าย! เกิดข้อผิดพลาดตอนอัปเดตระบบ ลองตรวจสอบ Console หน่อยนะคะ 🥺');
            return interaction.followUp({ embeds: [embed] });
        }
    }
};
