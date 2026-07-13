const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: {
        name: 'gqueue',
        description: 'ดูคิวเพลงที่กำลังรอเล่น',
    },
    run: async (client, interaction, kazagumo) => {
        const player = kazagumo.players.get(interaction.guild.id);
        const embed = new EmbedBuilder().setColor('#FF69B4');

        if (!player || (!player.playing && player.queue.length === 0)) {
            embed.setDescription('❌ ไม่มีเพลงที่กำลังเล่นหรือรอคิวอยู่ค่ะ สเตจเงียบเหงามากตอนนี้ 🥺');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const queue = player.queue;
        if (queue.length === 0) {
            embed.setTitle('📋 คิวเพลงของค่ำคืนนี้');
            const currentTitle = queue.current.title ? queue.current.title.replace(/\[/g, '(').replace(/\]/g, ')') : "Unknown";
            embed.setDescription(`**กำลังเล่น:**\n[${currentTitle}](${queue.current.uri}) - ขอโดย: <@${queue.current.requester.id}>\n\nไม่มีเพลงในคิวแล้วค่ะ สั่งดีเจมาได้เลยน้า~ 💋`);
            return interaction.reply({ embeds: [embed] });
        }

        const tracksPerPage = 10;
        const totalPages = Math.ceil(queue.length / tracksPerPage);
        let currentPage = 0;

        const generateEmbed = (page) => {
            const start = page * tracksPerPage;
            const end = start + tracksPerPage;
            const currentTracks = queue.slice(start, end);

            const currentTitle = queue.current.title ? queue.current.title.replace(/\[/g, '(').replace(/\]/g, ')') : "Unknown";
            let description = `**กำลังเล่น:**\n[${currentTitle}](${queue.current.uri}) - ขอโดย: <@${queue.current.requester.id}>\n\n**รอคิว (หน้า ${page + 1}/${totalPages}):**\n`;

            currentTracks.forEach((track, index) => {
                // ตัดชื่อเพลงถ้ายาวเกินไป กันคำอธิบายทะลุ 4096 ตัวอักษร
                let title = track.title ? track.title.replace(/\[/g, '(').replace(/\]/g, ')') : "Unknown";
                if (title.length > 40) title = title.substring(0, 40) + '...';
                description += `**${start + index + 1}.** [${title}](${track.uri}) - ขอโดย: <@${track.requester.id}>\n`;
            });

            const newEmbed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle(`📋 คิวเพลงทั้งหมดของค่ำคืนนี้ (${queue.length} เพลง)`)
                .setDescription(description)
                .setFooter({ text: 'ปาร์ตี้นี้ยาวไปปป! 💃✨' });

            return newEmbed;
        };

        const getButtons = (page) => {
            const row = new ActionRowBuilder();

            const btnPrev = new ButtonBuilder()
                .setCustomId('queue_prev')
                .setLabel('⬅️ หน้าก่อน')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0);

            const btnNext = new ButtonBuilder()
                .setCustomId('queue_next')
                .setLabel('หน้าถัดไป ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages - 1);

            row.addComponents(btnPrev, btnNext);
            return row;
        };

        const initialEmbed = generateEmbed(currentPage);

        // ถ้ามีหน้าเดียว ไม่ต้องแสดงปุ่ม
        if (totalPages === 1) {
            return interaction.reply({ embeds: [initialEmbed] });
        }

        const response = await interaction.reply({
            embeds: [initialEmbed],
            components: [getButtons(currentPage)],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000 // ปุ่มเปิดให้กดได้ 2 นาที
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ คุณไม่ใช่คนเรียกดูคิวนะคะ ห้ามแย่งกด!', ephemeral: true });
            }

            if (i.customId === 'queue_prev') {
                currentPage--;
            } else if (i.customId === 'queue_next') {
                currentPage++;
            }

            await i.update({
                embeds: [generateEmbed(currentPage)],
                components: [getButtons(currentPage)]
            });
        });

        collector.on('end', () => {
            // ลบปุ่มออกเมื่อหมดเวลา
            interaction.editReply({ components: [] }).catch(() => { });
        });
    }
};
