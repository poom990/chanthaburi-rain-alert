/**
 * Chanthaburi Smart Rain Alert System (Node.js Version)
 * โครงงานพยากรณ์และแจ้งเตือนฝนตกล่วงหน้า จ.จันทบุรี สำหรับร้านค้าชุมชน
 */

const https = require('https');

// การตั้งค่าระบบ
const CONFIG = {
  location_name: "อำเภอเมืองจันทบุรี",
  latitude: 12.6114,
  longitude: 102.1039,
  rain_probability_threshold: 40, // แจ้งเตือนเมื่อโอกาสฝนตก >= 40%
  precipitation_threshold: 0.5,    // ปริมาณน้ำฝน >= 0.5 mm
};

// ฟังก์ชันดึงข้อมูลพยากรณ์อากาศ
function fetchWeather(lat, lon) {
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,precipitation,temperature_2m,relativehumidity_2m&timezone=Asia%2FBangkok&forecast_days=1`;

    https.get(url, { headers: { 'User-Agent': 'ChanthaburiRainAlert/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ฟังก์ชันวิเคราะห์ความเสี่ยงฝนตก (อิงเวลาไทย Asia/Bangkok 100% ดูอนาคตข้างหน้าเท่านั้น)
function analyzeRain(weatherData) {
  const hourly = weatherData.hourly;
  const times = hourly.time;
  const rainProbs = hourly.precipitation_probability;
  const precipitations = hourly.precipitation;
  const temps = hourly.temperature_2m;
  const humidities = hourly.relativehumidity_2m;

  // แปลงเวลาให้เป็นเวลาไทยแท้ๆ UTC+7 แม้รันบน GitHub Actions
  const thNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const thHour = thNow.getHours();
  const thDateStr = thNow.toISOString().split('T')[0];
  const currentSlotStr = `${thDateStr}T${String(thHour).padStart(2, '0')}:00`;

  let curIdx = times.findIndex(t => t >= currentSlotStr);
  if (curIdx === -1) curIdx = 0;

  let maxProb = 0;
  let willRain = false;
  const timeline = [];

  // ดูชั่วโมงข้างหน้าในอนาคต (curIdx + 1 ถึง curIdx + 4)
  for (let i = curIdx + 1; i <= Math.min(curIdx + 4, times.length - 1); i++) {
    const timeStr = times[i].split('T')[1];
    const prob = rainProbs[i] || 0;
    const precip = precipitations[i] || 0;

    if (prob > maxProb) maxProb = prob;
    if (prob >= CONFIG.rain_probability_threshold || precip >= CONFIG.precipitation_threshold) {
      willRain = true;
    }

    timeline.push({
      time: timeStr,
      probability: prob,
      precipitation: precip,
      temp: temps[i],
      humidity: humidities[i]
    });
  }

  return { willRain, maxProb, timeline, thNow };
}

// ฟอร์แมตข้อความเตือนให้ผู้สูงอายุอ่านง่าย
function formatMessage(analysis, location) {
  const nowStr = analysis.thNow.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  let msg = '';
  if (analysis.willRain) {
    msg += `🌧️ [เตือนฝนใกล้ตก!] - ${location}\n`;
    msg += `🕒 เวลาตรวจวัดปัจจุบัน: ${nowStr} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ โอกาสฝนตกสูงถึง: ${analysis.maxProb}%\n`;
    msg += `📢 คำแนะนำสำหรับร้านค้า:\n`;
    msg += ` • รีบเก็บผ้าหรือสินค้าที่วางหน้าร้าน\n`;
    msg += ` • ดึงกันสาด/ผ้าใบลงมาปิดหน้าร้าน\n`;
    msg += ` • ปิดหน้าต่างให้เรียบร้อย\n\n`;
    msg += `🕒 พยากรณ์ล่วงหน้าแต่ละชั่วโมง:\n`;
    analysis.timeline.forEach(item => {
      const icon = item.probability >= 40 ? '🌧️' : '⛅';
      msg += `  ${icon} เวลา ${item.time} น. -> โอกาสตก ${item.probability}%\n`;
    });
  } else {
    msg += `☀️ [รายงานสภาพอากาศ] - ${location}\n`;
    msg += `🕒 เวลาตรวจวัดปัจจุบัน: ${nowStr} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `ไม่มีสัญญาณฝนตกหนักในช่วง 3-4 ชั่วโมงข้างหน้านี้ (ค้าขายได้ตามปกติครับ)\n`;
    if (analysis.timeline.length > 0) {
      msg += `อุณหภูมิ: ${analysis.timeline[0].temp}°C | ความชื้น: ${analysis.timeline[0].humidity}%\n`;
    }
  }
  return msg;
}

// URL ภาพเรดาร์สดของกรมอุตุฯ ประจำภาคตะวันออก (ครอบคลุม จ.จันทบุรี)
const RADAR_IMAGE_URL = "https://weather.tmd.go.th/ryg/ryg240_latest.jpg";

// ฟังก์ชันส่งแจ้งเตือนเข้า LINE Messaging API (Broadcast หาเพื่อนทุกคน) พร้อมภาพเรดาร์
function sendLineBroadcast(messageText, token, attachRadar = false) {
  if (!token || token === "YOUR_CHANNEL_ACCESS_TOKEN_HERE") {
    console.log("ℹ️ [จำลองการส่ง] ยังไม่ได้ระบุ LINE Token จึงแสดงข้อความบนหน้าจอนี้แทน");
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const messages = [{ type: "text", text: messageText }];

    if (attachRadar) {
      messages.push({
        type: "image",
        originalContentUrl: RADAR_IMAGE_URL,
        previewImageUrl: RADAR_IMAGE_URL
      });
    }

    const payload = JSON.stringify({ messages });

    const options = {
      hostname: 'api.line.me',
      port: 443,
      path: '/v2/bot/message/broadcast',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log("✅ [LINE Alert] ส่งแจ้งเตือนเด้งเข้ามือถือสำเร็จเรียบร้อย!");
          resolve();
        } else {
          console.log(`❌ [LINE Alert Error] Code: ${res.statusCode}, Body: ${data}`);
          resolve();
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ตรวจสอบว่าถึงเวลาส่งสรุปตอนเช้าหรือไม่ (07:00 น. เวลาไทย)
function checkMorningReport(weatherData, location) {
  const thNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const currentHour = thNow.getHours(); // Thailand hour 07:00
  if (currentHour !== 7) return null;

  const hourly = weatherData.hourly;
  const times = hourly.time;
  const rainProbs = hourly.precipitation_probability;

  let maxProb = 0;
  let peakHours = [];

  for (let i = 6; i <= 20 && i < times.length; i++) {
    const timeSlot = times[i].split('T')[1];
    const prob = rainProbs[i];
    if (prob > maxProb) maxProb = prob;
    if (prob >= 40) peakHours.push(`${timeSlot} น. (${prob}%)`);
  }

  let msg = `🌅 อรุณสวัสดิ์ครับแม่! รายงานอากาศวันนี้\n`;
  msg += `📍 พื้นที่: ${location}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (maxProb >= 40) {
    msg += `⚠️ วันนี้มีโอกาสฝนตก (สูงสุด ${maxProb}%)\n`;
    msg += `🕒 ช่วงเวลาที่น่าจะมีฝน: ${peakHours.slice(0, 4).join(', ')}\n\n`;
    msg += `📢 คำแนะนำ: เตรียมกางผ้าใบหน้าร้านและพกร่มด้วยนะครับ ❤️`;
  } else {
    msg += `☀️ วันนี้ฟ้าโปร่ง โอกาสฝนตกน้อยมาก (สูงสุด ${maxProb}%)\n`;
    msg += `ค้าขายหน้าร้านได้ราบรื่นตลอดวันครับแม่! ขอให้ขายดีร่ำรวยครับ ✨`;
  }

  return msg;
}

// ทดสอบรัน
async function main() {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "RIYT2T6aXXZ0NBLREcscWalGWPkTOit4azYZLCYfwALXdt4UPzDOT2wUbvRGuHX+MY8FBHN/nrYhi8w1VABkQxIoX7YvEGBpvO0RMQdrGC0RyM4/uAMmKQzjbwLOTQnPC3IsJKQUYAMZjSCqunMc2gdB04t89/1O/w1cDnyilFU=";

  console.log("==================================================");
  console.log("กำลังตรวจสอบสภาพอากาศ จ.จันทบุรี จากระบบพยากรณ์...");
  console.log(`พิกัด: Lat ${CONFIG.latitude}, Lon ${CONFIG.longitude} (${CONFIG.location_name})`);
  console.log("==================================================\n");

  try {
    const data = await fetchWeather(CONFIG.latitude, CONFIG.longitude);

    // 1. ตรวจสอบรายงานตอนเช้า 07:00 น.
    const morningMsg = checkMorningReport(data, CONFIG.location_name);
    if (morningMsg) {
      console.log("🌅 ได้เวลาส่งสรุปตอนเช้าให้คุณแม่...");
      await sendLineBroadcast(morningMsg, lineToken, false);
    }

    // 2. วิเคราะห์ฝนตกด่วน
    const analysis = analyzeRain(data);
    const message = formatMessage(analysis, CONFIG.location_name);

    console.log("ผลลัพธ์การวิเคราะห์:\n" + message);
    console.log("==================================================");

    // ถ้าตรวจพบว่าฝนใกล้ตก ให้ส่งเข้า LINE พร้อมภาพเรดาร์จริงของกรมอุตุฯ
    if (analysis.willRain) {
      console.log("⚡ พบความเสี่ยงฝนตก! กำลังส่งเข้า LINE พร้อมภาพเรดาร์...");
      await sendLineBroadcast(message, lineToken, true);
    } else {
      console.log("☀️ วันนี้อากาศดี ไม่มีฝนตกหนัก จึงไม่มีการรบกวนส่งแจ้งเตือน");
    }
  } catch (err) {
    console.error("เกิดข้อผิดพลาด:", err.message);
  }
}

main();
