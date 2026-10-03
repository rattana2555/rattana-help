# นำ RATTANA HELP ขึ้นใช้งานจริง

ระบบต้องรันบนเซิร์ฟเวอร์ Node.js ที่มี **พื้นที่เก็บไฟล์ถาวร** (persistent disk/volume) เพราะฐานข้อมูลและภาพทั้งหมดเก็บเป็นไฟล์
และต้องเปิดผ่าน **HTTPS** — ถ้าไม่ใช่ HTTPS มือถือจะไม่ยอมให้ใช้ปุ่ม “ใช้ตำแหน่งปัจจุบัน” (GPS)

## ก่อนขึ้นระบบจริง

1. ไม่ต้องล้างข้อมูลตัวอย่างบนเซิร์ฟเวอร์ — image ตั้ง `SEED_DEMO=0` ไว้แล้ว ฐานข้อมูลบนเซิร์ฟเวอร์จะเริ่มว่าง (มีเฉพาะ 77 จังหวัด)
2. ตั้งรหัสผ่าน admin คนแรกผ่านตัวแปร `ADMIN_PASSWORD` (username คือ `admin`) แล้วเปลี่ยนรหัสอีกครั้งหลังเข้าสู่ระบบ
3. สร้างบัญชีให้ทีม: ผู้ดูแลหลัก (ทำได้ทุกอย่าง) / ทีมภาคสนาม (อัปโหลดภาพ สถานะ GPS ไทม์ไลน์)

## ตัวแปรสภาพแวดล้อม

| ตัวแปร | ค่าแนะนำ | ใช้ทำอะไร |
|---|---|---|
| `ADMIN_PASSWORD` | รหัสที่ตั้งเอง ≥ 12 ตัว | รหัสผ่าน admin คนแรก (ใช้เฉพาะตอนฐานข้อมูลยังว่าง) |
| `DATA_DIR` | `/data/db` | โฟลเดอร์ฐานข้อมูล — ต้องอยู่บน volume ถาวร |
| `UPLOAD_DIR` | `/data/uploads` | โฟลเดอร์ภาพ — ต้องอยู่บน volume ถาวร |
| `SEED_DEMO` | `0` | ไม่ใส่ข้อมูลตัวอย่าง |
| `TRUST_PROXY` | `1` | อ่าน IP จริงของผู้ใช้หลัง proxy (ใช้กับการล็อกการล็อกอินผิด) |
| `PORT` | `3000` | พอร์ต (แพลตฟอร์มส่วนใหญ่กำหนดให้เอง) |

Dockerfile ตั้งค่าเหล่านี้ไว้แล้ว ยกเว้น `ADMIN_PASSWORD`

## ทางเลือกที่ 1 — Render (ง่ายสุด)

1. push โค้ดขึ้น GitHub (repo แบบ Private)
2. Render → New → **Blueprint** → เลือก repo นี้ (ใช้ไฟล์ `render.yaml`)
3. ใส่ค่า `ADMIN_PASSWORD` ในหน้า Environment
4. ต้องเลือกแพ็กเกจที่รองรับ **Disk** (แพ็กเกจฟรีไม่มี disk — ข้อมูลจะหายทุกครั้งที่ deploy)
5. ได้ URL `https://rattana-help.onrender.com` → ผูกโดเมนของบริษัทได้ที่ Settings → Custom Domains

## ทางเลือกที่ 2 — Railway

1. New Project → Deploy from GitHub repo (ตรวจพบ `Dockerfile` อัตโนมัติ)
2. เพิ่ม **Volume** แล้ว mount ที่ `/data`
3. ใส่ Variables: `ADMIN_PASSWORD`
4. Settings → Networking → Generate Domain (ได้ HTTPS ทันที)

## ทางเลือกที่ 3 — เครื่อง/เซิร์ฟเวอร์ของบริษัท

ใช้ได้ทั้ง VPS หรือคอมพิวเตอร์ที่เปิดไว้ตลอด

```bash
# ต้องมี Node.js 22.13 ขึ้นไป
SEED_DEMO=0 ADMIN_PASSWORD='ตั้งรหัสเอง' TRUST_PROXY=1 node server.js
```

- ให้รันตลอดเวลาด้วย `pm2` (`npm i -g pm2 && pm2 start server.js --name rattana-help && pm2 save`) หรือ Windows Task Scheduler
- เปิด HTTPS ด้วย Caddy (`caddy reverse-proxy --from help.rattanaphaiboon.com --to localhost:3000`)
  หรือ Cloudflare Tunnel (ไม่ต้องเปิดพอร์ตเราเตอร์)

## ทดสอบกับมือถือในวง Wi-Fi เดียวกัน (ก่อนขึ้นระบบจริง)

1. `npm start` บนเครื่องนี้
2. มือถือที่ต่อ Wi-Fi เดียวกันเปิด `http://<IP ของเครื่อง>:3000/admin` (หา IP ด้วย `ipconfig` → IPv4)
3. ถ้า Windows ถามเรื่อง Firewall ให้อนุญาต Node.js บน Private network
4. ข้อจำกัด: ผ่าน http ธรรมดา ปุ่ม “ใช้ตำแหน่งปัจจุบัน” จะใช้ไม่ได้ (ต้องแตะบนแผนที่แทน) — อัปโหลดภาพใช้ได้ปกติ

## สำรองข้อมูล

```bash
npm run backup
```

ได้โฟลเดอร์ `backups/<วันเวลา>/` ที่มีฐานข้อมูลและภาพทั้งหมด — รันได้ขณะระบบเปิดอยู่ ควรรันทุกวันและคัดลอกเก็บไว้นอกเซิร์ฟเวอร์
กู้คืน: หยุดระบบ → คัดลอก `rattana-help.db` ไปที่ `DATA_DIR` และโฟลเดอร์ `uploads` ไปที่ `UPLOAD_DIR` → เปิดระบบ

## ตรวจว่าระบบทำงาน

`GET /api/health` → `{"ok":true,"db":true}` (ใช้เป็น health check ของแพลตฟอร์ม)
