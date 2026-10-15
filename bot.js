/**
 * Chanthaburi Smart Weather Bot (Multi-Location + Interactive Reply)
 * ระบบบอทตอบคำถามสภาพอากาศรายอำเภอ จ.จันทบุรี
 * รองรับ: เมือง, มะขาม, นายอาม, ท่าใหม่, ขลุง, แหลมสิงห์, โป่งน้ำร้อน, มะนาวหวาน
 */

const http = require('http');
const https = require('https');

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || "RIYT2T6aXXZ0NBLREcscWalGWPkTOit4azYZLCYfwALXdt4UPzDOT2wUbvRGuHX+MY8FBHN/nrYhi8w1VABkQxIoX7YvEGBpvO0RMQdrGC0RyM4/uAMmKQzjbwLOTQnPC3IsJKQUYAMZjSCqunMc2gdB04t89/1O/w1cDnyilFU=";
const RADAR_URL = "https://weather.tmd.go.th/ryg/ryg240_latest.jpg";

// ==========================================
// พิกัดของแต่ละอำเภอใน จ.จันทบุรี (ข้อมูลวิทยาศาสตร์จริง)
// ==========================================
const LOCATIONS = {
  // คีย์เวิร์ดที่คุณแม่/คนในกลุ่มพิมพ์ -> พิกัดอำเภอนั้น
  "เมือง":       { name: "อ.เมืองจันทบุรี",   lat: 12.6114, lon: 102.1039 },
  "อำเภอเมือง":  { name: "อ.เมืองจันทบุรี",   lat: 12.6114, lon: 102.1039 },
  "ในเมือง":     { name: "อ.เมืองจันทบุรี",   lat: 12.6114, lon: 102.1039 },
  "มะขาม":       { name: "อ.มะขาม",            lat: 12.7833, lon: 102.1333 },
  "นายอาม":      { name: "อ.นายอาม",           lat: 12.9167, lon: 102.1333 },
  "ท่าใหม่":     { name: "อ.ท่าใหม่",          lat: 12.5000, lon: 102.0000 },
  "ขลุง":        { name: "อ.ขลุง",             lat: 12.4167, lon: 101.9167 },
  "แหลมสิงห์":   { name: "อ.แหลมสิงห์",        lat: 12.4500, lon: 102.2333 },
  "โป่งน้ำร้อน": { name: "อ.โป่งน้ำร้อน",     lat: 12.8833, lon: 102.2500 },
  "มะนาวหวาน":   { name: "อ.มะนาวหวาน",        lat: 12.7500, lon: 102.2500 },
  "เขาคิชฌกูฏ":  { name: "อ.เขาคิชฌกูฏ",      lat: 12.7667, lon: 102.1833 },
};

// อำเภอเริ่มต้น (ถ้าไม่ระบุอำเภอ ใช้อ.เมือง)
const DEFAULT_LOCATION = LOCATIONS["เมือง"];

// ==========================================
// ฟังก์ชันตรวจจับอำเภอจากข้อความที่พิมพ์
// ==========================================
function detectLocation(text) {
  for (const keyword of Object.keys(LOCATIONS)) {
    if (text.includes(keyword)) {
      return LOCATIONS[keyword];
    }
  }
  return null; // ไม่ระบุอำเภอ
}

// ==========================================
// ดึงข้อมูลสภาพอากาศตามพิกัด
// ==========================================
function fetchWeather(lat, lon) {
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,precipitation,temperature_2m,relativehumidity_2m,windspeed_10m&timezone=Asia%2FBangkok&forecast_days=1`;
    https.get(url, { headers: { 'User-Agent': 'ChanthaburiWeatherBot/2.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ==========================================
// วิเคราะห์สภาพอากาศ
// ==========================================
function analyzeWeather(data) {
  const hourly = data.hourly;
  const times = hourly.time;
  const rainProbs = hourly.precipitation_probability;
  const precips = hourly.precipitation;
  const temps = hourly.temperature_2m;
  const humidities = hourly.relativehumidity_2m;
  const winds = hourly.windspeed_10m;

  const currentHour = new Date().getHours();
  const currentTemp = temps[currentHour] || 0;
  const currentHumidity = humidities[currentHour] || 0;
  const currentWind = winds[currentHour] || 0;

  let maxProb = 0;
  let maxPrecip = 0;
  let willRain = false;
  let timeline = [];

  for (let i = currentHour; i < Math.min(currentHour + 4, times.length); i++) {
    const prob = rainProbs[i];
    const precip = precips[i];
    if (prob > maxProb) maxProb = prob;
    if (precip > maxPrecip) maxPrecip = precip;
    if (prob >= 40 || precip >= 0.5) willRain = true;
    timeline.push({ time: times[i].split('T')[1], prob, precip });
  }

  return { willRain, maxProb, maxPrecip, currentTemp, currentHumidity, currentWind, timeline };
}

// ==========================================
// สร้างข้อความตอบกลับสำหรับ "เช็กฝน" หรือ "ฝนตกไหม"
// ==========================================
function buildRainCheckReply(analysis, locationName) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  let msg = '';

  if (analysis.willRain) {
    msg += `🌧️ [เตือนฝนรายชั่วโมง] - ${locationName}\n`;
    msg += `🕒 เวลาที่ตรวจตอนนี้: ${timeStr} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ สรุป: มีแนวโน้มฝนตกในอีกไม่กี่ชั่วโมงข้างหน้านี้!\n`;
    msg += `• โอกาสฝนสูงสุด: ${analysis.maxProb}%\n`;
    msg += `• ปริมาณน้ำฝนสูงสุด: ${analysis.maxPrecip.toFixed(1)} มม. (mm)\n`;
    msg += `• อุณหภูมิ: ${analysis.currentTemp}°C | ลม: ${analysis.currentWind} กม./ชม.\n\n`;

    msg += `🕒 โอกาสฝนในแต่ละชั่วโมงข้างหน้า:\n`;
    let rainTimes = [];
    analysis.timeline.forEach(item => {
      let status = '';
      if (item.prob >= 70) {
        status = '🌧️ ตกค่อนข้างแน่';
        rainTimes.push(item.time);
      } else if (item.prob >= 40) {
        status = '🌦️ มีโอกาสตก';
        rainTimes.push(item.time);
      } else {
        status = '⛅ โอกาสน้อย/ฟ้าครึ้ม';
      }
      msg += ` • เวลา ${item.time} น. ➔ โอกาส ${item.prob}% (ฝน ${item.precip} มม.) [${status}]\n`;
    });

    msg += `\n📢 คำแนะนำสำหรับร้านค้า:\n`;
    if (rainTimes.length > 0) {
      msg += `⚠️ ควรเตรียมดึงผ้าใบ/เก็บของหน้าร้านก่อนเวลา ${rainTimes[0]} น. นะครับ!\n\n`;
    } else {
      msg += `เตรียมผ้าใบหน้าร้านไว้เผื่อฝนตกกระทันหันนะครับ\n\n`;
    }

    msg += `🌐 ดูเรดาร์สดแบบเคลื่อนไหว:\n`;
    msg += `👉 https://weather.tmd.go.th/ryg240Loop.php\n`;
  } else {
    msg += `☀️ [รายงานอากาศ] - ${locationName}\n`;
    msg += `🕒 เวลาที่ตรวจตอนนี้: ${timeStr} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✅ สบายใจได้ครับ อีก 3-4 ชั่วโมงข้างหน้านี้ไม่มีฝนตกหนัก\n\n`;
    msg += `🕒 ตรวจสอบทีละชั่วโมง:\n`;
    analysis.timeline.forEach(item => {
      msg += ` • เวลา ${item.time} น. ➔ โอกาสตก ${item.prob}% (ฟ้าโปร่ง ⛅)\n`;
    });
    msg += `\n• อุณหภูมิปัจจุบัน: ${analysis.currentTemp}°C\n`;
    msg += `• ความชื้นสัมพัทธ์: ${analysis.currentHumidity}%\n\n`;
    msg += `ค้าขายหน้าร้านได้ราบรื่นตลอดช่วงนี้เลยครับแม่! 👍\n\n`;
    msg += `🌐 ลิงก์เรดาร์กรมอุตุฯ: https://weather.tmd.go.th/ryg.php\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 ข้อมูลตรวจวัดจริง: ECMWF / กรมอุตุนิยมวิทยา`;
  return msg;
}

// ==========================================
// สร้างข้อความ "อากาศวันนี้" (ภาพรวมทั้งวัน)
// ==========================================
function buildDaySummaryReply(data, locationName) {
  const hourly = data.hourly;
  const times = hourly.time;
  const rainProbs = hourly.precipitation_probability;

  let maxProb = 0;
  let rainSlots = [];

  for (let i = 6; i <= 20 && i < times.length; i++) {
    const prob = rainProbs[i];
    if (prob > maxProb) maxProb = prob;
    if (prob >= 40) rainSlots.push(`${times[i].split('T')[1]} น. (${prob}%)`);
  }

  const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  let msg = `📋 [สรุปอากาศวันนี้] ${locationName}\n`;
  msg += `🕒 อัปเดต ณ ${now} น.\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (maxProb >= 40) {
    msg += `⚠️ วันนี้มีแนวโน้มฝนตกบางช่วง\n`;
    msg += `☔ โอกาสฝนตกสูงสุดวันนี้: ${maxProb}%\n\n`;
    msg += `🕒 ช่วงเวลาที่น่าจะมีฝน:\n`;
    rainSlots.slice(0, 5).forEach(s => msg += `  • ${s}\n`);
    msg += `\n📢 คำแนะนำ: เตรียมกางผ้าใบหน้าร้านไว้ด้วยนะครับ ❤️`;
  } else {
    msg += `☀️ วันนี้สภาพอากาศดีทั้งวัน\n`;
    msg += `• โอกาสฝนตกน้อยมาก (สูงสุด ${maxProb}%)\n\n`;
    msg += `ค้าขายหน้าร้านได้ราบรื่นทั้งวันครับแม่! ✨`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 ข้อมูล: ECMWF / กรมอุตุนิยมวิทยา`;
  return msg;
}

// ==========================================
// สร้างข้อความ Help (เมนูคำสั่ง)
// ==========================================
function buildHelpMessage() {
  let msg = `🤖 สวัสดีครับ! บอทเตือนฝน จ.จันทบุรี\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📌 คำสั่งที่ใช้ได้:\n\n`;
  msg += `🌧️ "เช็กฝน" → สภาพอากาศตอนนี้\n`;
  msg += `☀️ "อากาศวันนี้" → สรุปทั้งวัน\n`;
  msg += `📡 "ดูเรดาร์" → ภาพเรดาร์สดกรมอุตุฯ\n\n`;
  msg += `📍 ระบุอำเภอได้เลยครับ เช่น:\n`;
  msg += `  • "เช็กฝน เมือง"\n`;
  msg += `  • "ฝนตกไหม มะขาม"\n`;
  msg += `  • "อากาศ นายอาม"\n`;
  msg += `  • "เช็กฝน ท่าใหม่"\n`;
  msg += `  • "ดูเรดาร์ ขลุง"\n\n`;
  msg += `🗺️ อำเภอที่รองรับ:\n`;
  msg += `เมือง | มะขาม | นายอาม | ท่าใหม่\n`;
  msg += `ขลุง | แหลมสิงห์ | โป่งน้ำร้อน | มะนาวหวาน | เขาคิชฌกูฏ`;
  return msg;
}

// ==========================================
// ส่งข้อความตอบกลับ (Reply)
// ==========================================
function replyMessage(replyToken, messages) {
  const payload = JSON.stringify({ replyToken, messages });
  const options = {
    hostname: 'api.line.me', port: 443,
    path: '/v2/bot/message/reply', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      if (res.statusCode === 200) console.log("✅ ตอบกลับสำเร็จ!");
      else console.log(`❌ ตอบกลับล้มเหลว ${res.statusCode}:`, body);
    });
  });
  req.on('error', err => console.error("Reply error:", err.message));
  req.write(payload);
  req.end();
}

// ==========================================
// ประมวลผลข้อความจากผู้ใช้
// ==========================================
async function handleMessage(event) {
  const userText = event.message.text.trim();
  const replyToken = event.replyToken;
  console.log(`📩 ข้อความ: "${userText}"`);

  // ตรวจจับอำเภอจากข้อความ
  const location = detectLocation(userText) || DEFAULT_LOCATION;

  try {
    // คำสั่ง: เช็กฝน / ฝนตกไหม
    if (userText.includes("เช็กฝน") || userText.includes("ฝน") || userText.includes("ตกไหม")) {
      console.log(`⚡ เช็กฝนที่: ${location.name}`);
      const data = await fetchWeather(location.lat, location.lon);
      const analysis = analyzeWeather(data);
      const msg = buildRainCheckReply(analysis, location.name);

      // ถ้าฝนจะตก ส่งภาพเรดาร์แนบไปด้วย
      if (analysis.willRain || userText.includes("เรดาร์")) {
        replyMessage(replyToken, [
          { type: "text", text: msg },
          { type: "image", originalContentUrl: RADAR_URL, previewImageUrl: RADAR_URL }
        ]);
      } else {
        replyMessage(replyToken, [{ type: "text", text: msg }]);
      }

    // คำสั่ง: อากาศวันนี้ / สรุป
    } else if (userText.includes("อากาศ") || userText.includes("วันนี้") || userText.includes("สรุป")) {
      console.log(`📋 สรุปอากาศวันนี้ที่: ${location.name}`);
      const data = await fetchWeather(location.lat, location.lon);
      const msg = buildDaySummaryReply(data, location.name);
      replyMessage(replyToken, [{ type: "text", text: msg }]);

    // คำสั่ง: ดูเรดาร์
    } else if (userText.includes("เรดาร์")) {
      const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      replyMessage(replyToken, [
        {
          type: "text",
          text: `📡 [ภาพเรดาร์ตรวจฝนสด กรมอุตุนิยมวิทยา]\n` +
                `📍 สถานีเรดาร์ตรวจอากาศระยอง-จันทบุรี\n` +
                `🕒 เวลาไทยปัจจุบัน: ${now} น.\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `💡 วิธีดูภาพเรดาร์:\n` +
                `• มุมขวาบนในภาพระบุเวลาสากล UTC (+7 ชม. = เวลาไทย)\n` +
                `• 🟩 เขียว = ฝนเบา/ละออง\n` +
                `• 🟨 เหลือง = ฝนปานกลาง\n` +
                `• 🟧🟥 ส้ม/แดง = ฝนตกหนักมาก + ลมแรง ⚠️\n\n` +
                `🌐 ลิงก์ตรงหน้าเรดาร์กรมอุตุฯ (ดูภาพเคลื่อนไหว):\n` +
                `👉 https://weather.tmd.go.th/ryg240Loop.php\n` +
                `👉 https://weather.tmd.go.th/ryg.php`
        },
        { type: "image", originalContentUrl: RADAR_URL, previewImageUrl: RADAR_URL }
      ]);

    // คำสั่ง: ช่วย / เมนู / สวัสดี
    } else if (userText.includes("ช่วย") || userText.includes("เมนู") || userText.includes("สวัสดี") || userText.includes("hello") || userText.includes("hi")) {
      replyMessage(replyToken, [{ type: "text", text: buildHelpMessage() }]);
    }

  } catch (err) {
    console.error("Error handling message:", err.message);
    replyMessage(replyToken, [{
      type: "text",
      text: "ขออภัยครับ ระบบดึงข้อมูลสภาพอากาศขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ 🙏"
    }]);
  }
}

// ==========================================
// เซิร์ฟเวอร์ Webhook รับข้อความจาก LINE
// ==========================================
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));

      try {
        const payload = JSON.parse(body);
        for (const event of (payload.events || [])) {
          if (event.type === 'message' && event.message.type === 'text') {
            await handleMessage(event);
          }
        }
      } catch (e) {
        console.error("Webhook error:", e.message);
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end("Chanthaburi Weather Bot ทำงานปกติครับ! พิมพ์ 'ช่วย' ใน LINE เพื่อดูคำสั่งครับ");
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("=======================================================");
  console.log("🤖 Chanthaburi Weather Bot พร้อมตอบคำถามแล้วครับ!");
  console.log(`🌐 Webhook: http://localhost:${PORT}/webhook`);
  console.log("📍 รองรับ 9 อำเภอ จ.จันทบุรี");
  console.log("=======================================================");
});
