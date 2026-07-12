# BotDisLava 🚀🎵

Discord Music Bot ที่ขับเคลื่อนด้วย **Lavalink**, **Shoukaku**, และ **Kazagumo** รองรับการเล่นเพลงจาก YouTube, SoundCloud ฯลฯ ด้วยคุณภาพเสียงที่เสถียรและระบบจัดการคิวที่ครบครัน

## 🌟 ฟีเจอร์หลัก (Features)
- 🎵 เล่นเพลงจาก YouTube, YouTube Music, SoundCloud และแพลตฟอร์มอื่น ๆ
- ⏩ ระบบจัดการคิวที่ล้ำหน้า: แซงคิว (`gplay top`), ดันคิว (`gjump`), ข้ามและเล่นทันที (`gskipplay`)
- 📜 ระบบดูคิวเพลง (Queue) แบบหลายหน้า (Pagination)
- 🚀 ทำงานผ่าน Lavalink Server เพื่อลดภาระการประมวลผลเสียงของ Node.js (พร้อม Local Node ในตัว)
- 💻 รองรับ Slash Commands (/) ทำให้ผู้ใช้เรียกคำสั่งได้ง่ายๆ พิมพ์แค่ `/`

## 🛠️ สิ่งที่ต้องมี (Prerequisites)
ก่อนเริ่มติดตั้งและรันบอท กรุณาตรวจสอบว่าคุณมีโปรแกรมเหล่านี้ติดตั้งอยู่ในเครื่องแล้ว:
- [Node.js](https://nodejs.org/) (เวอร์ชัน 16.11.0 ขึ้นไป สำหรับรัน Discord.js v14)
- [Java 17](https://adoptium.net/) หรือสูงกว่า (สำหรับรัน Lavalink Server)
- Token ของ Discord Bot (ต้องเปิด **Intents**: `Guilds`, `GuildVoiceStates` ใน [Discord Developer Portal](https://discord.com/developers/applications))

## ⚙️ การติดตั้ง (Installation)

1. **เปิดโฟลเดอร์โปรเจกต์ใน Terminal**
2. **ติดตั้งแพ็กเกจ (Dependencies)**
   ```bash
   npm install
   ```
3. **ตั้งค่า Environment Variables**
   - ก็อปปี้หรือเปลี่ยนชื่อไฟล์ `.env.example` เป็น `.env`
   - ใส่ Token บอทของคุณในไฟล์ `.env`
     ```env
     DISCORD_TOKEN=your_discord_bot_token_here
     ```

## 🚀 วิธีการรัน (Usage)

โปรเจกต์นี้จะต้องรัน 2 ส่วนควบคู่กัน คือ **Lavalink Server** และ **Bot (Node.js)**

### 1. รัน Lavalink Server
เข้าไปที่โฟลเดอร์ `LavalinkServer` และรันตัว `Lavalink.jar` ด้วย Java:
```bash
cd LavalinkServer
java -jar Lavalink.jar
```
*(เมื่อรันสำเร็จ Lavalink จะทำงานที่ `localhost:2333` โดยอิงตามการตั้งค่าในไฟล์ `application.yml`)*

### 2. รัน Discord Bot
เปิด Terminal ใหม่อีกหน้าต่างหนึ่ง ในโฟลเดอร์หลักของโปรเจกต์ (`BotDisLava`) แล้วรันคำสั่ง:
```bash
node index.js
```
หากทุกอย่างตั้งค่าไว้ถูกต้อง คุณจะเห็นข้อความว่าล็อกอินบอทสำเร็จและ "Lavalink Node: LocalNode is now connected" ✅

## 📜 คำสั่งทั้งหมด (Slash Commands)
- `/gplay <query> [top]` - ค้นหาและเล่นเพลงจากชื่อหรือลิ้งก์ (หากเลือกตัวเลือก `top` จะนำไปต่อคิวเป็นเพลงถัดไปทันที)
- `/gskipplay <query>` - ค้นหาและเล่นเพลงนี้ทันที (ข้ามเพลงปัจจุบันและแทรกคิว)
- `/gjump <position>` - เลือกดึงเพลงที่อยู่ในคิวด้านล่าง ให้ขยับขึ้นมาเป็นเพลงถัดไป (แซงคิว)
- `/gqueue [page]` - ดูรายชื่อคิวเพลงทั้งหมดที่กำลังรอเล่น
- `/gskip` - ข้ามเพลง (Skip) ที่กำลังเล่นอยู่
- `/gclear` - ล้างเพลงในคิวที่รออยู่ทั้งหมด
- `/gstop` - หยุดเล่นเพลงและล้างคิวทั้งหมด จากนั้นบอทจะนิ่งรอคำสั่งใหม่

---
**💡 คำแนะนำเพิ่มเติม:** 
หากคุณต้องการนำบอทขึ้นโฮสต์หรือ Server จริง แนะนำให้เข้าไปแก้ไขรหัสผ่านใน `LavalinkServer/application.yml` และไปแก้รหัสผ่านของ Node ใน `index.js` ให้ตรงกัน เพื่อป้องกันผู้อื่นแอบใช้งาน Lavalink ของคุณ
# BotDisLava
# BotDisLava
