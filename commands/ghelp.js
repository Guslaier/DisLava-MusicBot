const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'ghelp',
        description: '📖 ดูคู่มือและคำสั่งทั้งหมดของบอท',
    },
    run: async (client, interaction) => {
        const embed = new EmbedBuilder()
            .setColor('#FF007F')
            .setTitle('🎵 คู่มือการใช้งาน ดีเจบอทสุดคิ้วท์')
            .setDescription('สวัสดีค่ะ! นี่คือคู่มือและรวมคำสั่งทั้งหมดของบอทนะคะ 💖\nคุณสามารถพิมพ์ `/` แล้วตามด้วยชื่อคำสั่งเพื่อเรียกใช้งานได้เลยค่ะ!')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                {
                    name: 'หมวดเล่นเพลง (Basic)',
                    value: '\t`/gplay` - ค้นหาหรือใส่ลิ้งก์เพลงจาก YouTube/SoundCloud\n\t`/gpause` - หยุดเพลงชั่วคราว\n\t`/gresume` - เล่นเพลงต่อ\n\t`/gstop` - หยุดเล่นและล้างคิวทั้งหมด (บอทออกห้อง)\n\t`/gfav` - จัดการเพลงโปรดของคุณ (add, list, play, remove)',
                    inline: false
                },
                {
                    name: 'หมวดจัดการคิว (Queue Control)',
                    value: '\t`/gqueue` - ดูคิวเพลงทั้งหมดที่กำลังรอเล่น\n\t`/gskip` - ข้ามเพลงปัจจุบัน\n\t`/gskipplay` - ข้ามเพลงปัจจุบันแล้วเล่นเพลงใหม่ที่ใส่มาทันที\n\t`/gprevious` - กลับไปเล่นเพลงที่แล้ว\n\t`/gshuffle` - สลับคิวเพลงแบบสุ่ม\n\t`/gmove` - สลับย้ายตำแหน่งเพลงในคิว\n\t`/gloop` - วนลูปเพลง (เพลงเดียว หรือทั้งคิว)\n\t`/gclear` - ล้างคิวเพลงทั้งหมดที่รออยู่',
                    inline: false
                },
                {
                    name: 'หมวดปรับแต่งขั้นสูง (Advanced)',
                    value: '\t`/gforward` - กรอเพลงเดินหน้าตามวินาทีที่ระบุ\n\t`/gbackward` - กรอย้อนกลับตามวินาทีที่ระบุ\n\t`/gseek` - กรอไปยังตำแหน่งเวลาที่ต้องการ\n\t`/gjump` - แซงคิว! ดึงเพลงที่รออยู่ขึ้นมาเล่นเป็นเพลงต่อไป\n\t`/gremove` - ลบเพลงที่เจาะจงออกจากคิว\n\t`/gautoplay` - เปิด/ปิดระบบเล่นเพลงต่อเนื่องอัตโนมัติเมื่อคิวหมด',
                    inline: false
                },
                {
                    name: 'หมวดข้อมูล & ระบบ (Info & System)',
                    value: '\t`/gnowplaying` - ดูการ์ดเพลงและปุ่มควบคุม Now Playing\n\t`/glyrics` - ค้นหาเนื้อเพลง\n\t`/gping` - เช็คความหน่วงปิง\n\t`/gstats` - ดูข้อมูลสถิติ RAM/Uptime ระบบ\n\t`/gupdate` - โหลดและอัปเดตคำสั่งบอทใหม่ทั้งหมด\n\t`/ghelp` - เปิดหน้าต่างคู่มือนี้',
                    inline: false
                },
                {
                    name: 'หมวดตั้งค่าเสียง (Settings)',
                    value: '\t`/gvolume` - ปรับระดับเสียงความดังของบอท',
                    inline: false
                }
            )
            .setFooter({
                text: '💡 ทริค: เพลงช้าหรือกระตุก ลองเปลี่ยน Region ห้องเป็น Singapore ดูนะคะ!',
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
