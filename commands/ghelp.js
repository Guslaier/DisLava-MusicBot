const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'ghelp',
        description: 'ดูคู่มือและคำสั่งทั้งหมดของบอท',
    },
    run: async (client, interaction) => {
        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('📖 คู่มือการใช้งาน ดีเจบอท GOOLIX')
            .setDescription('สวัสดีค่ะ! รวมคำสั่งทั้งหมดของ GOOLIX นะคะ 💖\nพิมพ์ `/` แล้วตามด้วยชื่อคำสั่งเพื่อเรียกใช้งานได้เลยค่ะ!')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                {
                    name: '🎵 หมวดเล่นเพลง (Playback)',
                    value: [
                        '`/gplay` - เล่นเพลงเดี่ยวจาก YouTube/SoundCloud (มีตัวเลือก `top` แซงคิว และ `playlist`)',
                        '`/gplaylist` - เล่นเพลย์ลิสต์/มิกซ์ ยกชุดลงในคิว (ดึงได้ 5-100 เพลง)',
                        '`/gpause` - หยุดเพลงชั่วคราว',
                        '`/gresume` - เล่นเพลงต่อ',
                        '`/gstop` - หยุดเล่น ล้างคิว และออกจากห้องเสียง',
                        '`/gfav` - จัดการเพลงโปรดของคุณ (add, list, play, remove)'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📑 หมวดจัดการคิว (Queue Control)',
                    value: [
                        '`/gqueue` - ดูรายการคิวเพลงที่กำลังรอเล่น',
                        '`/gskip` - ข้ามไปยังเพลงถัดไป',
                        '`/gskipplay` - ข้ามเพลงปัจจุบันแล้วเล่นเพลงใหม่ทันที',
                        '`/gprevious` - ย้อนกลับไปเล่นเพลงก่อนหน้า',
                        '`/gshuffle` - สลับลำดับเพลงในคิวแบบสุ่ม',
                        '`/gmove` - สลับย้ายตำแหน่งเพลงในคิว',
                        '`/gloop` - เปิดวนลูป (track: เพลงเดียว, queue: ทั้งคิว, off: ปิด)',
                        '`/gclear` - ล้างเพลงทั้งหมดที่รออยู่ในคิว',
                        '`/gjump` - แซงคิว! ดึงเพลงในคิวขึ้นมาเล่นเป็นเพลงถัดไป',
                        '`/gremove` - ลบเพลงตามลำดับที่เจาะจงออกจากคิว'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🎛️ หมวดปรับแต่งเสียง & เวลา (Audio & Seek)',
                    value: [
                        '`/gvolume` - ปรับระดับความดังของเสียง (0 - 150%)',
                        '`/gseek` - กรอไปยังตำแหน่งเวลาที่ต้องการ (เช่น 1:30 หรือ 90)',
                        '`/gforward` - กรอเดินหน้าตามจำนวนวินาที',
                        '`/gbackward` - กรอย้อนหลังตามจำนวนวินาที',
                        '`/gautoplay` - เปิด/ปิดระบบเล่นเพลงต่อเนื่องอัตโนมัติเมื่อคิวหมด'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🛡️ หมวดข้อมูล & ระบบเน็ตเวิร์ก (System & Network)',
                    value: [
                        '`/gnowplaying` - ดูการ์ดเพลงและแผงปุ่มควบคุม Now Playing',
                        '`/gcleancard` - กวาดล้างการ์ดเพลงเก่าหรือการ์ดที่ค้างอยู่ในห้องแชท',
                        '`/glyrics` - ค้นหาและดูเนื้อเพลง',
                        '`/gstats` - ดูสถิติระบบ, RAM, Uptime, Audio Engine และสถานะ VPN',
                        '`/gproxy` - เช็คและจัดการระบบเครือข่าย VPN / Smart Proxy (status, test, switch)',
                        '`/gping` - ตรวจสอบความหน่วงและปิงของบอท',
                        '`/gupdate` - รีโหลดและอัปเดตคำสั่ง Slash Commands ทั้งหมด',
                        '`/ghelp` - เปิดหน้าต่างคู่มือนี้'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({
                text: '💡 ทริค: สตรีมสดตรง Direct Live Pipe เริ่มเล่นใน ~2 วินาที พร้อมระบบกันกระตุก!',
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
