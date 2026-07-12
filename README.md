# BotDisLava

Discord Music Bot ที่ทำงานร่วมกับ Lavalink, Shoukaku และ Kazagumo รองรับการเล่นเพลงจาก YouTube, SoundCloud และแพลตฟอร์มอื่น ๆ พร้อมระบบจัดการคิวเพลงที่ครบครัน

## คุณสมบัติหลัก (Features)
- เล่นเพลงจาก YouTube, YouTube Music, SoundCloud และแพลตฟอร์มอื่น ๆ
- ระบบจัดการคิว: แซงคิว (gplay top), ดันคิว (gjump), ข้ามและเล่นทันที (gskipplay)
- ระบบดูคิวเพลง (Queue) แบบหลายหน้า (Pagination)
- ทำงานผ่าน Lavalink Server เพื่อลดภาระการประมวลผลเสียงของ Node.js
- รองรับ Slash Commands (/) ทำให้ผู้ใช้เรียกคำสั่งได้สะดวก

## สิ่งที่ต้องมี (Prerequisites)
ก่อนเริ่มการติดตั้งและการทำงานของบอท กรุณาตรวจสอบว่ามีโปรแกรมเหล่านี้ติดตั้งอยู่ในระบบ:
- Node.js (เวอร์ชัน 16.11.0 ขึ้นไป สำหรับรัน Discord.js v14)
- Java 17 หรือสูงกว่า (สำหรับรัน Lavalink Server)
- Token ของ Discord Bot (จำเป็นต้องเปิด Intents: Guilds, GuildVoiceStates ใน Discord Developer Portal)

## การติดตั้งและการตั้งค่า (Installation & Setup)

1. เปิดโฟลเดอร์โปรเจกต์ใน Terminal
2. ติดตั้งแพ็กเกจที่จำเป็น
   ```bash
   npm install
   ```
3. การตั้งค่า Environment Variables
   - คัดลอกหรือเปลี่ยนชื่อไฟล์ .env.example เป็น .env
   - ระบุ Token บอทของคุณในไฟล์ .env
     ```env
     DISCORD_TOKEN=your_discord_bot_token_here
     ```
4. การเตรียม Lavalink Server
   - เนื่องจากไฟล์ Lavalink.jar มีขนาดใหญ่ จึงไม่ได้รวมอยู่ใน Repository นี้
   - ไปที่ https://github.com/lavalink-devs/Lavalink/releases
   - ดาวน์โหลดไฟล์ Lavalink.jar (แนะนำให้ใช้เวอร์ชันที่รองรับกับ Plugins ใน application.yml)
   - นำไฟล์ที่ดาวน์โหลดมา ไปวางไว้ในโฟลเดอร์ `LavalinkServer` ภายในโปรเจกต์นี้

## วิธีการใช้งาน (Usage)

โปรเจกต์นี้จำเป็นต้องรัน 2 ส่วนควบคู่กัน คือ Lavalink Server และ Bot (Node.js)

### 1. การรัน Lavalink Server
เข้าไปที่โฟลเดอร์ LavalinkServer และรัน Lavalink.jar ด้วย Java:
```bash
cd LavalinkServer
java -jar Lavalink.jar
```
(เมื่อรันสำเร็จ Lavalink จะทำงานที่ localhost:2333 ตามการตั้งค่าในไฟล์ application.yml)

### 2. การรัน Discord Bot
เปิด Terminal ใหม่ในโฟลเดอร์หลักของโปรเจกต์ (BotDisLava) และใช้คำสั่ง:
```bash
node index.js
```
หากการตั้งค่าถูกต้อง ระบบจะแสดงข้อความแจ้งการล็อกอินสำเร็จและสถานะการเชื่อมต่อกับ Lavalink Node

## คำสั่งทั้งหมด (Slash Commands)
- /gplay <query> [top] - ค้นหาและเล่นเพลงจากชื่อหรือลิงก์ (หากเลือก top เพลงจะถูกจัดคิวเป็นเพลงถัดไปทันที)
- /gskipplay <query> - ค้นหาและเล่นเพลงนี้ทันที (ข้ามเพลงปัจจุบันและแทรกคิว)
- /gjump <position> - ดึงเพลงที่ระบุในคิวขึ้นมาเป็นเพลงถัดไป (แซงคิว)
- /gqueue [page] - แสดงรายชื่อคิวเพลงทั้งหมดที่รอเล่น
- /gskip - ข้ามเพลงที่กำลังเล่นอยู่
- /gclear - ลบเพลงที่รออยู่ในคิวทั้งหมด
- /gstop - หยุดเล่นเพลงและล้างคิวทั้งหมด

---
คำแนะนำเพิ่มเติม:
หากต้องการนำบอทไปทำงานบนโฮสต์หรือเซิร์ฟเวอร์จริง ควรเปลี่ยนรหัสผ่านใน LavalinkServer/application.yml และปรับแก้ไขรหัสผ่านของ Node ในไฟล์ index.js ให้ตรงกันเพื่อความปลอดภัย
