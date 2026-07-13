<div align="center">
  <h1>DisLava-MusicBot</h1>
  <p><strong>Discord Music Bot for your server</strong></p>
  
  [![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue?logo=discord&logoColor=white)](https://discord.js.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-16.11.0+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Lavalink](https://img.shields.io/badge/Lavalink-Supported-red?logo=java&logoColor=white)](https://github.com/lavalink-devs/Lavalink)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

<br />

**DisLava-MusicBot** คือ Discord Music Bot แบบ Open Source ที่ทำงานร่วมกับ **Lavalink, Shoukaku และ Kazagumo** ระบบบอทถูกออกแบบมาเพื่อรองรับการค้นหาและเล่นเพลงจาก **YouTube โดยเฉพาะ** ป้องกันปัญหาเพลงไม่ตรงปก พร้อมระบบจัดการคิวและการออกแบบ UI (Embed) โทนสี Hot Pink ที่สบายตา

> **หมายเหตุสำหรับผู้ใช้งานทั่วไป:** โปรเจกต์นี้เป็น Open Source ที่ออกแบบมาเพื่อให้ทุกคนนำไปติดตั้งและรันบนเซิร์ฟเวอร์ของตัวเอง (Self-hosted) ไม่ได้เปิดให้บริการเช่าหรือบอทสาธารณะ เพื่อหลีกเลี่ยงการละเมิดข้อตกลง (ToS) ของบริการสตรีมมิ่ง

---

## คุณสมบัติหลัก (Features)
- **ค้นหาจาก YouTube เท่านั้น**: บังคับดึงข้อมูลจาก YouTube เป็นหลักเพื่อป้องกันปัญหาเพลงไม่ตรงปก
- **ระบบคิวขั้นสูง**: รองรับการแทรกคิว (`/gplay top`), ดันคิว (`/gjump`) และ ข้ามแล้วเล่นทันที (`/gskipplay`)
- **ควบคุมการเล่นแบบครบวงจร**: หยุดชั่วคราว, เล่นต่อ, กรอเพลง, ปรับระดับเสียง, วนลูป, สุ่มคิว
- **อัปเดตคำสั่งได้ทันที**: แอดมินสามารถใช้ `/gupdate` เพื่อรีโหลดคำสั่งใหม่ได้โดยไม่ต้องรีสตาร์ทบอท
- **ดีไซน์ที่ชัดเจน**: ข้อความแจ้งเตือนทั้งหมดใช้ EmbedBuilder สี Hot Pink (`#FF69B4`) เพื่อความสวยงามและอ่านง่าย

---

## สิ่งที่ต้องมี (Prerequisites)
ก่อนเริ่มการติดตั้ง กรุณาตรวจสอบว่ามีโปรแกรมเหล่านี้ติดตั้งอยู่ในระบบ:
- [Node.js](https://nodejs.org/) (เวอร์ชัน 16.11.0 ขึ้นไป สำหรับรัน Discord.js v14)
- [Java 17](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html) หรือสูงกว่า (สำหรับรัน Lavalink Server)
- [PM2](https://pm2.keymetrics.io/) สำหรับรันบอทและ Lavalink ให้ออนไลน์ตลอดเวลา (`npm install pm2 -g`)
- Token ของ Discord Bot (สมัครและรับ Token ได้ที่ [Discord Developer Portal](https://discord.com/developers/applications))

---

## การติดตั้งและการตั้งค่า (Installation & Setup)

1. **โคลนโปรเจกต์และติดตั้งแพ็กเกจ**
   ```bash
   git clone https://github.com/....
   cd DisLava-MusicBot
   npm install
   ```

2. **การตั้งค่า Environment Variables**
   - คัดลอกหรือเปลี่ยนชื่อไฟล์ `.env.example` เป็น `.env`
   - ระบุ Token บอทของคุณลงในไฟล์ `.env`
     ```env
     DISCORD_TOKEN=your_discord_bot_token_here
     ```

3. **การเตรียม Lavalink Server**
   - ดาวน์โหลด `Lavalink.jar` จาก [Lavalink Releases](https://github.com/lavalink-devs/Lavalink/releases) (แนะนำให้ใช้เวอร์ชันที่รองรับกับ Plugins ใน `application.yml` ของคุณ)
   - นำไฟล์ที่ดาวน์โหลดมาวางในโฟลเดอร์ `LavalinkServer`

---

## วิธีการใช้งาน (Usage)

จำเป็นต้องรัน 2 ส่วนควบคู่กัน คือ Lavalink Server และ ตัวบอท

### 1. การรัน Lavalink Server (ใช้ PM2)
```bash
cd LavalinkServer
pm2 start "java -jar Lavalink.jar" --name LAVALINK
cd ..
```

### 2. การรัน Discord Bot (ใช้ PM2)
```bash
pm2 start index.js --name BOT_LAVA
```
*คุณสามารถเช็คสถานะการรันและ log ได้ผ่านคำสั่ง `pm2 list`, `pm2 monit` และ `pm2 log`*

---

## คำสั่งทั้งหมด (Slash Commands)

### หมวดเล่นเพลง (Basic)
- `/gplay <query> [top]` - ค้นหาและเล่นเพลงจากชื่อหรือลิงก์ (เปิด `top` เพื่อลัดคิวให้เล่นเป็นเพลงต่อไป)
- `/gpause` - หยุดเล่นเพลงชั่วคราว
- `/gresume` - เล่นเพลงต่อจากที่หยุดไว้
- `/gstop` - หยุดเล่นเพลงและล้างคิวทั้งหมด ปิดสเตจ

### หมวดจัดการคิว (Queue Control)
- `/gqueue` - แสดงรายชื่อคิวเพลงทั้งหมดที่รอเล่น
- `/gskip` - ข้ามเพลงที่กำลังเล่นอยู่
- `/gskipplay <query>` - เล่นเพลงนี้ทันที (ข้ามเพลงปัจจุบันและแทรกคิว)
- `/gprevious` - ย้อนกลับไปเล่นเพลงที่เพิ่งจบไป
- `/gshuffle` - สุ่มลำดับคิวเพลง
- `/gloop <mode>` - วนลูปเพลง (ปิด / เพลงเดียว / ทั้งคิว)
- `/gclear` - ลบเพลงที่รออยู่ในคิวทั้งหมด

### หมวดปรับแต่งขั้นสูง (Advanced)
- `/gseek <time>` - กรอเพลงไปยังเวลาที่กำหนด (เช่น 01:30 หรือ 90)
- `/gjump <position>` - ดันเพลงที่ระบุในคิวขึ้นมาเป็นเพลงถัดไป (แซงคิว)
- `/gremove <position>` - ลบเพลงออกจากคิวตามตำแหน่ง

### หมวดข้อมูล (Info)
- `/gnowplaying` - ดูข้อมูลเพลงที่กำลังเล่น พร้อมแถบเวลา
- `/glyrics` - ค้นหาเนื้อเพลงที่กำลังเล่นอยู่
- `/ghelp` - ดูคู่มือและคำสั่งทั้งหมดของบอท

### หมวดผู้ดูแลระบบ (Admin Only)
- `/gvolume <amount>` - ปรับระดับเสียง (0-150%)
- `/gupdate` - (เฉพาะ Admin) รีโหลดไฟล์คำสั่งทั้งหมดและอัปเดต Slash Commands ใหม่โดยไม่ต้องรีสตาร์ทบอท

---

## การมีส่วนร่วม (Contributing)
ยินดีต้อนรับนักพัฒนาทุกท่านที่ต้องการเข้ามาร่วมพัฒนา DisLava-MusicBot หากคุณพบเจอบัค หรือมีฟีเจอร์ใหม่ๆ ที่น่าสนใจ สามารถเปิด **Issues** หรือส่ง **Pull Requests** เข้ามาได้เลย

## ลิขสิทธิ์ (License)
โปรเจกต์นี้เป็น Open Source ภายใต้สัญญาอนุญาต [MIT License](LICENSE) - คุณสามารถนำไปใช้งาน ดัดแปลง และเผยแพร่ต่อได้อย่างอิสระ
