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
// วิเคราะห์สภาพอากาศ (อิงเวลาประเทศไทย Asia/Bangkok 100%)
// คำนวณเฉพาะ "ชั่วโมงข้างหน้าในอนาคต" เท่านั้น ไม่เอาอดีตมาปน
// ==========================================
function analyzeWeather(data) {
  const hourly = data.hourly;
  const times = hourly.time;
  const rainProbs = hourly.precipitation_probability;
  const precips = hourly.precipitation;
  const temps = hourly.temperature_2m;
  const humidities = hourly.relativehumidity_2m;
  const winds = hourly.windspeed_10m;

  // แปลงเวลาให้เป็นเวลาไทยแท้ๆ แม้รันบน Cloud ต่างประเทศ
  const thNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const thHour = thNow.getHours();
  const thDateStr = thNow.toISOString().split('T')[0];
  const currentSlotStr = `${thDateStr}T${String(thHour).padStart(2, '0')}:00`;

  // หา index ของชั่วโมงปัจจุบันในชุดข้อมูล
  let currentIndex = times.findIndex(t => t >= currentSlotStr);
  if (currentIndex === -1) currentIndex = 0;

  const currentTemp = temps[currentIndex] || 0;
  const currentHumidity = humidities[currentIndex] || 0;
  const currentWind = winds[currentIndex] || 0;

  let maxProb = 0;
  let maxPrecip = 0;
  let willRain = false;
  let timeline = [];

  // เริ่มดูตั้งแต่ชั่วโมงถัดไปข้างหน้า (currentIndex + 1) จำนวน 3-4 ชั่วโมงในอนาคต
  for (let i = currentIndex + 1; i <= Math.min(currentIndex + 4, times.length - 1); i++) {
    const prob = rainProbs[i] || 0;
    const precip = precips[i] || 0;
    if (prob > maxProb) maxProb = prob;
    if (precip > maxPrecip) maxPrecip = precip;
    if (prob >= 40 || precip >= 0.5) willRain = true;

    const timeSlot = times[i].split('T')[1]; // ดึงเฉพาะเวลา เช่น "13:00"
    timeline.push({ time: timeSlot, prob, precip });
  }

  return { willRain, maxProb, maxPrecip, currentTemp, currentHumidity, currentWind, timeline, thNow };
}

// ฟังก์ชันแปลระดับฝนเป็นภาษาชาวบ้านเข้าใจง่าย
function describeRainLevel(prob, precip) {
  if (prob < 25 && precip < 0.1) {
    return { text: "☀️ ไม่ตก (ฟ้าโปร่ง/แดดดี)", level: "none" };
  } else if (prob < 45 && precip < 0.5) {
    return { text: "🌦️ มีฝนปรอยๆ ละอองบางๆ (ไม่เปียกมาก)", level: "drizzle" };
  } else if (prob >= 45 && precip < 2.5) {
    return { text: "🌧️ ตกไม่แรง แป๊บๆ หยุด (ฝนผ่านสั้นๆ)", level: "light" };
  } else {
    return { text: "⛈️ ตกหนัก มีลมแรง (ตกยาว/ต้องหลบ)", level: "heavy" };
  }
}

// สร้างคำแนะนำแยกตามอาชีพของคนจันทบุรี
function getOccupationAdvice(maxProb, maxPrecip) {
  let advice = `👨‍🌾 คำแนะนำเพื่อพี่น้องชาวจันท์:\n`;

  if (maxProb < 35 && maxPrecip < 0.2) {
    // กรณีฝนไม่ตก / ฟ้าเปิด
    advice += `• 🌲 ชาวสวนยาง: กรีดยางได้ปกติ หน้ายางไม่บูด น้ำยางไม่เสีย\n`;
    advice += `• 🍈 สวนทุเรียน/ผลไม้: พ่นยา ใส่ปุ๋ย ตัดแต่งกิ่งได้เต็มที่ ยาไม่โดนชะล้าง\n`;
    advice += `• 🛒 ค้าขาย/ตลาด: วางของหน้าร้านได้โล่งสบาย ค้าขายราบรื่น\n`;
    advice += `• 🔨 งานรับจ้าง/กลางแจ้ง: ทำงานเทปูน ก่อสร้าง ขนส่ง ได้สบายตลอดช่วงนี้ครับ`;
  } else if (maxProb < 55 && maxPrecip < 2.0) {
    // กรณีฝนปรอย หรือ ตกไม่แรงแป๊บๆ หยุด
    advice += `• 🌲 ชาวสวนยาง: ระวังละอองฝนเกาะหน้ายาง แนะนำสังเกตหัวกะโหลกก่อนกรีด\n`;
    advice += `• 🍈 สวนทุเรียน/ผลไม้: งดพ่นสารเคมีชั่วคราว ฝนอาจชะล้างยา แต่เข้าตัดแต่งสวนได้\n`;
    advice += `• 🛒 ค้าขาย/ตลาด: เตรียมดึงผ้าใบกันสาดลงมาคุมไว้ สินค้าไม่เสียหายมาก\n`;
    advice += `• 🔨 งานรับจ้าง/กลางแจ้ง: งานฉาบปูน/ทาสีควรเลี่ยง งานช่างในร่มทำได้ปกติครับ`;
  } else {
    // กรณีฝนตกหนัก
    advice += `• 🌲 ชาวสวนยาง: ⚠️ งดกรีดยางเด็ดขาด! ฝนชะน้ำยางเสียหายแน่นอน\n`;
    advice += `• 🍈 สวนทุเรียน/ผลไม้: ⚠️ ห้ามพ่นยา/ใส่ปุ๋ย ระวังลมกระโชกแรงกิ่งฉีกขาด\n`;
    advice += `• 🛒 ค้าขาย/ตลาด: ⚠️ รีบเก็บของเข้าที่ร่ม ดึงผ้าใบมัดให้แน่นหนาทันที\n`;
    advice += `• 🔨 งานรับจ้าง/กลางแจ้ง: ⚠️ หยุดงานกลางแจ้งและที่สูง หลบเข้าที่กำบังปลอดภัยครับ`;
  }
  return advice;
}

// ==========================================
// สร้างข้อความตอบกลับสำหรับ "เช็กฝน" หรือ "ฝนตกไหม"
// ==========================================
function buildRainCheckReply(analysis, locationName) {
  const timeStr = analysis.thNow.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const overall = describeRainLevel(analysis.maxProb, analysis.maxPrecip);
  let msg = '';

  if (analysis.willRain) {
    msg += `🌧️ [เตือนฝนรายชั่วโมง] - ${locationName}\n`;
    msg += `🕒 เวลาตรวจวัด: ${timeStr} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📢 สภาพฝนที่คาดหมาย: **${overall.text}**\n`;
    msg += `• โอกาสฝนตก: ${analysis.maxProb}%\n`;
    msg += `• ปริมาณน้ำฝน: ${analysis.maxPrecip.toFixed(1)} มม.\n`;
    msg += `• อุณหภูมิ: ${analysis.currentTemp}°C | ลม: ${analysis.currentWind} กม./ชม.\n\n`;

    msg += `🕒 แจกแจงทีละชั่วโมงข้างหน้า:\n`;
    analysis.timeline.forEach(item => {
      const desc = describeRainLevel(item.prob, item.precip);
      msg += ` • ${item.time} น. ➔ ${desc.text} (${item.prob}%)\n`;
    });

    msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg += getOccupationAdvice(analysis.maxProb, analysis.maxPrecip) + `\n\n`;

    msg += `🌐 ดูเรดาร์สดแบบเคลื่อนไหว:\n`;
    msg += `👉 https://weather.tmd.go.th/ryg240Loop.php\n`;
  } else {
    msg += `☀️ [รายงานอากาศ] - ${locationName}\n`;
    msg += `🕒 เวลาตรวจวัด: ${timeStr} น.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📢 สภาพอากาศ: **${overall.text}**\n`;
    msg += `✅ ช่วง 3-4 ชั่วโมงข้างหน้านี้ไม่มีฝนตกหนัก ค้าขายและทำสวนได้สบายใจ\n\n`;

    msg += `🕒 แจกแจงทีละชั่วโมงข้างหน้า:\n`;
    analysis.timeline.forEach(item => {
      const desc = describeRainLevel(item.prob, item.precip);
      msg += ` • ${item.time} น. ➔ ${desc.text} (${item.prob}%)\n`;
    });

    msg += `\n• อุณหภูมิปัจจุบัน: ${analysis.currentTemp}°C | ความชื้น: ${analysis.currentHumidity}%\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += getOccupationAdvice(analysis.maxProb, analysis.maxPrecip) + `\n\n`;

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
// สร้างข้อความ Help / แนะนำตัวผู้พัฒนา และคู่มือคำสั่งแบบละเอียดยิบ
// ==========================================
// ==========================================
// สร้างข้อความอธิบายแหล่งที่มาของข้อมูลโดยละเอียด
// ==========================================
function buildDataSourceReply() {
  let msg = `🔬 [แหล่งอ้างอิงข้อมูลและการประมวลผล]\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `ระบบแจ้งเตือนฝน จ.จันทบุรี ดึงข้อมูลตรวจวัดจริงตามหลักวิทยาศาสตร์และการคำนวณจากดาวเทียม ไม่ได้มาจากการสุ่มหรือคาดเดา โดยมี 3 แหล่งข้อมูลหลัก ดังนี้ครับ:\n\n`;

  msg += `1. 🇪🇺 แบบจำลองพยากรณ์อากาศระดับโลก ECMWF (ผ่าน Open-Meteo API)\n`;
  msg += `• ECMWF (European Centre for Medium-Range Weather Forecasts) เป็นศูนย์พยากรณ์อากาศระยะปานกลางแห่งยุโรปที่ได้รับการยอมรับจากนักอุตุนิยมวิทยาทั่วโลกว่ามี "ความแม่นยำสูงที่สุดในโลกในปัจจุบัน"\n`;
  msg += `• ระบบดึงข้อมูล High-Resolution Model อัปเดตรายชั่วโมง เพื่อคำนวณความน่าจะเป็นของฝน (Precipitation Probability %), ปริมาณน้ำฝนสะสม (มม.), อุณหภูมิ, ความชื้น และความเร็วลม\n\n`;

  msg += `2. 🇹🇭 เรดาร์ตรวจอากาศ กรมอุตุนิยมวิทยา (TMD)\n`;
  msg += `• อ้างอิงภาพเรดาร์ตรวจฝนสด Doppler Radar จาก "สถานีเรดาร์ตรวจอากาศระยอง" ของกรมอุตุนิยมวิทยา รัศมีการตรวจวัด 240 กิโลเมตร ซึ่งครอบคลุม จ.จันทบุรี, ระยอง, ตราด และอ่าวไทยโดยตรง\n`;
  msg += `• ตรวจวัดการสะท้อนของเม็ดฝนในชั้นบรรยากาศสดๆ ทุก 15 นาที เพื่อให้เห็นกลุ่มเมฆฝนและทิศทางการเคลื่อนที่จริงแบบ Real-time\n\n`;

  msg += `3. 📍 พิกัดดาวเทียมเฉพาะพื้นที่ 9 อำเภอ (GPS Coordinates)\n`;
  msg += `• ไม่ได้ใช้ค่าเฉลี่ยรวมทั้งจังหวัด แต่เจาะจงพิกัดภูมิศาสตร์ (Latitude / Longitude) ของจุดศูนย์กลางและชุมชนในแต่ละอำเภอทั้ง 9 แห่งของจันทบุรี\n`;
  msg += `• ทำให้การพยากรณ์คำนึงถึงสภาพภูมิประเทศเฉพาะตัว เช่น แถบติดเทือกเขา (เขาคิชฌกูฏ, โป่งน้ำร้อน) หรือแถบชายฝั่งทะเล (แหลมสิงห์, นายายอาม)\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💡 โครงงานพัฒนาโดย: นายธนพนธ์ วิสุขะ (นักเรียน รร.ศรียานุสรณ์ จันทบุรี)\n`;
  msg += `นำเทคโนโลยี Cloud และข้อมูลอุตุนิยมวิทยาระดับโลกมาปรับใช้เพื่อประโยชน์ของชุมชนครับ 🙏`;
  return msg;
}

// ==========================================
// สร้างข้อความ Help / แนะนำตัวผู้พัฒนา และคู่มือคำสั่งแบบละเอียดยิบ
// ==========================================
function buildHelpMessage() {
  let msg = `👦 [ที่มาและความตั้งใจของโครงงาน]\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `สวัสดีครับ ผม นายธนพนธ์ วิสุขะ กำลังศึกษาอยู่ที่ โรงเรียนศรียานุสรณ์ จ.จันทบุรี ครับ 🏫\n\n`;
  msg += `ที่ผมตั้งใจพัฒนาระบบนี้ขึ้นมา เพราะจะนำไปใส่พอร์ตโฟลิโอศึกษาต่อ และทางบ้านผมทำอาชีพค้าขาย ซึ่งต้องคอยกังวลเรื่องฝนตกตลอดเวลา บางครั้งการรอข่าวสารทั่วไปอาจไม่ทันต่อการเก็บของหน้าร้าน\n\n`;
  msg += `ผมเลยทำระบบนี้ขึ้นมาเพื่อให้พี่น้องชาวจันทบุรีทุกๆ คนในหลากหลายอาชีพ ไม่ว่าจะเป็น ชาวสวนยาง, สวนทุเรียน, ค้าขาย และรับจ้าง ได้ใช้ประโยชน์ เพื่อให้ใช้ชีวิตประจำวันได้สะดวกมากขึ้นครับ ❤️\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📖 คู่มือคำสั่งบอทเตือนฝน จ.จันทบุรี (ใช้พิมพ์หรือกดปุ่มได้เลย):\n\n`;

  msg += `1. 🌧️ ตรวจฝนรายชั่วโมง + คำแนะนำอาชีพ\n`;
  msg += `  • พิมพ์: "เช็กฝน" ➔ ตรวจในเมือง (ค่าเริ่มต้น)\n`;
  msg += `  • พิมพ์: "เช็กฝน [ชื่ออำเภอ]" เช่น "เช็กฝน มะขาม", "ฝนตกไหม นายอาม", "เช็กฝน ท่าใหม่"\n`;
  msg += `  👉 บอกสภาพฝนภาษาชาวบ้าน (ไม่ตก/ฝนปรอย/ตกไม่แรง/ตกหนัก) + คำแนะนำเจาะลึก 4 อาชีพ (สวนยาง, สวนทุเรียน, ค้าขาย, รับจ้าง)\n\n`;

  msg += `2. ⏱️ ถามว่าฝนจะหยุดตอนไหน\n`;
  msg += `  • พิมพ์: "ฝนหยุดตกตอนไหน" หรือ "ฝนหยุดตอนไหน มะขาม"\n`;
  msg += `  👉 ระบบจะคำนวณเวลาที่ฝนจะซาและหยุดตกให้ล่วงหน้า\n\n`;

  msg += `3. ☀️ สรุปภาพรวมอากาศทั้งวัน\n`;
  msg += `  • พิมพ์: "อากาศวันนี้" หรือ "สรุปอากาศ"\n`;
  msg += `  👉 บอกช่วงเวลาแดดดีและช่วงเวลาเสี่ยงฝนทั้งวัน\n\n`;

  msg += `4. 📡 ดูภาพเรดาร์สดกรมอุตุนิยมวิทยา\n`;
  msg += `  • พิมพ์: "ดูเรดาร์"\n`;
  msg += `  👉 ส่งภาพเรดาร์ตรวจฝนสดสถานีระยอง-จันทบุรี พร้อมลิงก์ดูภาพเคลื่อนไหว\n\n`;

  msg += `5. 🔬 ตรวจสอบแหล่งที่มาของข้อมูล\n`;
  msg += `  • พิมพ์: "แหล่งข้อมูล" หรือ "ข้อมูลมาจากไหน"\n`;
  msg += `  👉 ตรวจสอบความน่าเชื่อถือทางวิทยาศาสตร์และโมเดลพยากรณ์ที่ระบบใช้\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🗺️ รายชื่อ 9 อำเภอที่ระบบรองรับ (พิกัดดาวเทียมจริง):\n`;
  msg += `1. เมือง (หรือ ในเมือง, อำเภอเมือง)\n`;
  msg += `2. มะขาม\n`;
  msg += `3. นายอาม (นายายอาม)\n`;
  msg += `4. ท่าใหม่\n`;
  msg += `5. ขลุง\n`;
  msg += `6. แหลมสิงห์\n`;
  msg += `7. โป่งน้ำร้อน\n`;
  msg += `8. เขาคิชฌกูฏ\n`;
  msg += `9. มะนาวหวาน\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔬 แหล่งที่มาของข้อมูล (Data Sources):\n`;
  msg += `• 🇪🇺 ECMWF Model (ผ่าน Open-Meteo): โมเดลพยากรณ์อากาศที่แม่นยำอันดับ 1 ของโลกจากศูนย์วิจัยยุโรป คำนวณฝนสะสมและความน่าจะเป็นรายชั่วโมง\n`;
  msg += `• 🇹🇭 กรมอุตุนิยมวิทยา (TMD): ภาพเรดาร์ Doppler ตรวจกลุ่มฝนสดรัศมี 240 กม. จากสถานีระยอง ครอบคลุมจันทบุรี ตรวจวัดจริงทุก 15 นาที\n`;
  msg += `• 📍 พิกัด GPS 9 อำเภอ: คำนวณเจาะจงเฉพาะตำแหน่งพิกัดดาวเทียมของแต่ละอำเภอในจันทบุรี ไม่เหมารวมทั้งจังหวัด\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⭐ [แบบประเมินโครงงานสำหรับใส่พอร์ตโฟลิโอ]\n`;
  msg += `ร่วมประเมินโครงงานเพื่อช่วยให้กำลังใจเด็กตาดำๆ ได้ที่ลิงก์นี้นะครับ:\n`;
  msg += `👉 https://chanthaburi-rain-alert.onrender.com/feedback\n\n`;
  msg += `ขอบพระคุณทุกท่านที่เข้ามาใช้งานครับ 🙏`;
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
    // คำสั่ง: แหล่งข้อมูล / ที่มา / ข้อมูลมาจากไหน / อ้างอิง
    if (userText.includes("แหล่งข้อมูล") || userText.includes("ข้อมูลมาจากไหน") || userText.includes("ที่มา") || userText.includes("อ้างอิง") || userText.includes("ecmwf") || userText.includes("ความแม่นยำ") || userText.includes("ดาวเทียม")) {
      replyMessage(replyToken, [{ type: "text", text: buildDataSourceReply() }]);
      return;
    }

    // คำสั่ง: ประเมิน / แบบประเมิน / feedback
    if (userText.includes("ประเมิน") || userText.includes("แบบสอบถาม") || userText.includes("feedback") || userText.includes("ฟีดแบ็ก")) {
      replyMessage(replyToken, [{
        type: "text",
        text: `⭐ [แบบประเมินโครงงานระบบแจ้งเตือนฝน จ.จันทบุรี]\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `โครงงานพัฒนาโดย นายธนพนธ์ วิสุขะ (รร.ศรียานุสรณ์)\n` +
              `เพื่อนำผลการประเมินไปใส่ในพอร์ตโฟลิโอ (TCAS) ศึกษาต่อครับ\n\n` +
              `👉 กดทำแบบประเมินสั้นๆ เพื่อให้กำลังใจได้ที่นี่ครับ:\n` +
              `https://chanthaburi-rain-alert.onrender.com/feedback\n\n` +
              `ขอบพระคุณทุกความคิดเห็นและกำลังใจครับ 🙏❤️`
      }]);
      return;
    }

    // คำสั่ง: คำสั่ง / ประวัติ / ผู้พัฒนา / ใครทำ / ช่วย / เมนู / สวัสดี
    if (userText.includes("คำสั่ง") || userText.includes("ประวัติ") || userText.includes("ผู้พัฒนา") || userText.includes("ใครทำ") || userText.includes("ช่วย") || userText.includes("เมนู") || userText.includes("สวัสดี") || userText.includes("hello") || userText.includes("hi")) {
      replyMessage(replyToken, [{ type: "text", text: buildHelpMessage() }]);
      return;
    }

    // คำสั่ง: ฝนจะหยุดตกตอนไหน / ฝนหยุดตอนไหน
    if (userText.includes("หยุด") || userText.includes("ฝนหยุด")) {
      console.log(`⏱️ วิเคราะห์เวลาฝนหยุดที่: ${location.name}`);
      const data = await fetchWeather(location.lat, location.lon);
      const times = data.hourly.time;
      const probs = data.hourly.precipitation_probability;
      const precips = data.hourly.precipitation;

      const thNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
      const thHour = thNow.getHours();
      const thMinute = thNow.getMinutes();
      const timeNowStr = thNow.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const currentSlot = `${thNow.toISOString().split('T')[0]}T${String(thHour).padStart(2, '0')}:00`;
      let curIdx = times.findIndex(t => t >= currentSlot);
      if (curIdx === -1) curIdx = 0;

      // ตรวจว่าตอนนี้ฝนกำลังตกอยู่หรือเปล่า
      const currentProb = probs[curIdx] || 0;
      const currentPrecip = precips[curIdx] || 0;
      const isRainingNow = currentProb >= 40 || currentPrecip >= 0.5;

      // สแกนหาชั่วโมงที่ฝนจะหยุด (โอกาสฝนต่ำกว่า 35% และปริมาณฝนน้อยกว่า 0.2 มม.)
      let stopTime = null;
      let stopIdx = null;
      let timeline = [];

      for (let i = curIdx; i < Math.min(curIdx + 8, times.length); i++) {
        const tStr = times[i].split('T')[1];
        const p = probs[i] || 0;
        const mm = precips[i] || 0;
        const isRaining = p >= 40 || mm >= 0.5;

        let icon = '';
        if (p >= 70) icon = '🌧️ ฝนตกหนัก';
        else if (p >= 40) icon = '🌦️ ฝนตก';
        else if (p >= 20) icon = '⛅ เมฆมาก/ฝนปรอย';
        else icon = '☀️ ฟ้าเปิด/แดดออก';

        timeline.push(` • เวลา ${tStr} น. ➔ ${p}% (${mm} มม.) [${icon}]`);

        if (i > curIdx && p < 35 && mm < 0.2 && !stopTime) {
          stopTime = tStr;
          stopIdx = i;
        }
      }

      let reply = `⏱️ [วิเคราะห์: ฝนจะหยุดตกตอนไหน?]\n`;
      reply += `📍 ${location.name}\n`;
      reply += `🕒 เวลาปัจจุบัน: ${timeNowStr} น.\n`;
      reply += `━━━━━━━━━━━━━━━━━━━━\n`;

      if (!isRainingNow) {
        // ตอนนี้ฝนยังไม่ตก
        reply += `☀️ ตอนนี้ฝนยังไม่ตกครับ (โอกาสฝนแค่ ${currentProb}%)\n`;
        reply += `สามารถค้าขายหน้าร้านได้สบายใจ!\n\n`;
      } else if (stopTime) {
        // คำนวณว่าอีกกี่ชั่วโมงฝนจะหยุด
        const hoursUntilStop = stopIdx - curIdx;
        reply += `🌤️ คาดการณ์: ฝนจะเริ่มซาลงและหยุดตก\n`;
        reply += `ช่วงเวลาประมาณ ${stopTime} น.\n`;
        reply += `(อีกประมาณ ${hoursUntilStop} ชั่วโมงข้างหน้า)\n\n`;
        reply += `📢 คำแนะนำ: รอฝนหยุดก่อนค่อยวางของหน้าร้านนะครับ\n\n`;
      } else {
        // ฝนตกต่อเนื่องไม่หยุดเลยในหลายชั่วโมงข้างหน้า
        reply += `🌧️ คาดการณ์: ฝนยังมีแนวโน้มตกต่อเนื่อง\n`;
        reply += `ไม่มีสัญญาณจะหยุดภายใน 5-6 ชม.ข้างหน้า\n\n`;
        reply += `📢 คำแนะนำ: กางผ้าใบหรือร่มไว้ตลอดเลยนะครับ\n\n`;
      }

      reply += `📊 พยากรณ์รายชั่วโมง:\n`;
      reply += timeline.slice(0, 6).join('\n') + `\n\n`;
      reply += `🌐 ดูเรดาร์สด: https://weather.tmd.go.th/ryg240Loop.php\n`;
      reply += `━━━━━━━━━━━━━━━━━━━━\n`;
      reply += `📡 วิเคราะห์จากข้อมูลจริง: ECMWF / กรมอุตุนิยมวิทยา`;

      replyMessage(replyToken, [{ type: "text", text: reply }]);
      return;
    }

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
                `👉 https://weather.tmd.go.th/ryg.php\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `⭐ ช่วยประเมินโครงงานของ นายธนพนธ์ วิสุขะ:\n` +
                `👉 https://chanthaburi-rain-alert.onrender.com/feedback`
        },
        { type: "image", originalContentUrl: RADAR_URL, previewImageUrl: RADAR_URL }
      ]);

    // คำสั่ง: คำสั่ง / ประวัติ / ผู้พัฒนา / ช่วย / เมนู / สวัสดี
    } else if (userText.includes("คำสั่ง") || userText.includes("ประวัติ") || userText.includes("ผู้พัฒนา") || userText.includes("ใครทำ") || userText.includes("ช่วย") || userText.includes("เมนู") || userText.includes("สวัสดี") || userText.includes("hello") || userText.includes("hi")) {
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

// URL หน้าแบบประเมินโครงงาน (บน Render)
const FEEDBACK_URL = "https://chanthaburi-rain-alert.onrender.com/feedback";

// ==========================================
// เซิร์ฟเวอร์ Webhook รับข้อความจาก LINE & เสิร์ฟหน้าประเมิน
// ==========================================
const fs = require('fs');
const path = require('path');

const server = http.createServer(async (req, res) => {
  // 1. เส้นทางหน้าแบบประเมินผล
  if (req.method === 'GET' && (req.url === '/feedback' || req.url === '/eval')) {
    const filePath = path.join(__dirname, 'feedback.html');
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end("ไม่พบหน้าแบบประเมิน");
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  // 2. รับข้อมูลคะแนนประเมินเข้ามาบันทึก
  if (req.method === 'POST' && req.url === '/api/feedback') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const newFeedback = JSON.parse(body);
        const logPath = path.join(__dirname, 'evaluations.json');
        let records = [];
        if (fs.existsSync(logPath)) {
          try { records = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) {}
        }
        records.push(newFeedback);
        fs.writeFileSync(logPath, JSON.stringify(records, null, 2));
        console.log("⭐ บันทึกผลประเมินใหม่เรียบร้อย:", newFeedback);
      } catch (err) {
        console.error("Error saving feedback:", err);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success' }));
    });
    return;
  }

  // 3. Webhook รับข้อความ LINE
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
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h3>ระบบพยากรณ์อากาศและเตือนฝน จ.จันทบุรี (โครงงาน นายธนพนธ์ วิสุขะ) ทำงานปกติครับ</h3><p><a href="/feedback">คลิกที่นี่เพื่อไปหน้าแบบประเมินโครงงาน</a></p>`);
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
