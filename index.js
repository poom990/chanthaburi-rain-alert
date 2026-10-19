/**
 * Chanthaburi Smart Rain Alert System (Scheduled Push Edition)
 * ระบบพยากรณ์และแจ้งเตือนสภาพอากาศ จ.จันทบุรี 3 เวลาต่อวัน (เช้า 07:00 / เที่ยง 12:00 / เย็น 16:00)
 * โครงงานพัฒนาโดย นายธนพนธ์ วิสุขะ (รร.ศรียานุสรณ์ จ.จันทบุรี)
 */

const https = require('https');

// ==========================================
// การตั้งค่าระบบ
// ==========================================
const CONFIG = {
  location_name: "อำเภอเมืองจันทบุรี",
  latitude: 12.6114,
  longitude: 102.1039,
  rain_probability_threshold: 35, // เกณฑ์โอกาสฝนที่เริ่มเตือน
  precipitation_threshold: 0.5,    // เกณฑ์ปริมาณน้ำฝน (มม.)
};

// URL ภาพเรดาร์สดของกรมอุตุนิยมวิทยา สถานีระยอง-จันทบุรี
const RADAR_IMAGE_URL = "https://weather.tmd.go.th/ryg/ryg240_latest.jpg";

// ==========================================
// ฟังก์ชันดึงข้อมูลพยากรณ์อากาศความละเอียดสูง (ECMWF)
// ==========================================
function fetchWeather(lat, lon) {
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation_probability,precipitation,temperature_2m,relativehumidity_2m,windspeed_10m&timezone=Asia%2FBangkok&forecast_days=2`;

    https.get(url, { headers: { 'User-Agent': 'ChanthaburiRainAlert/2.0' } }, (res) => {
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

// ==========================================
// ฟังก์ชันแปลระดับฝนเป็นภาษาชาวบ้านเข้าใจง่าย
// ==========================================
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

// ==========================================
// คำแนะนำเฉพาะกลุ่มอาชีพตามช่วงเวลา
// ==========================================
function getOccupationAdvice(period, maxProb, maxPrecip) {
  let advice = `👨‍🌾 คำแนะนำเพื่อพี่น้องชาวจันท์:\n`;

  if (period === 'morning') {
    // คำแนะนำรอบเช้า 07:00 น.
    if (maxProb < 35 && maxPrecip < 0.2) {
      advice += `• 🌲 ชาวสวนยาง: กรีดยาง-เก็บน้ำยางได้ราบรื่น หน้ายางแห้งดี\n`;
      advice += `• 🍈 สวนทุเรียน: พ่นยา ใส่ปุ๋ย ตัดแต่งกิ่งได้เต็มที่ ยาไม่โดนชะล้าง\n`;
      advice += `• 🛒 ค้าขาย/ตลาด: วางแผงหน้าร้านได้โล่งสบาย ค้าขายคล่องตัว\n`;
      advice += `• 🔨 รับจ้าง/ช่าง: วางแผนงานกลางแจ้ง เทปูน ก่อสร้าง ได้ตลอดเช้าถึงบ่ายครับ`;
    } else if (maxProb < 55) {
      advice += `• 🌲 ชาวสวนยาง: ระวังละอองฝนช่วงสาย สังเกตฟ้าก่อนหยอดน้ำกรด\n`;
      advice += `• 🍈 สวนทุเรียน: เลี่ยงการพ่นยาเคมี ฝนอาจชะล้าง แต่ตัดหญ้าแต่งสวนได้ปกติ\n`;
      advice += `• 🛒 ค้าขาย/ตลาด: เตรียมดึงผ้าใบกันสาดไว้ล่วงหน้า ของไม่เปียกแน่นอน\n`;
      advice += `• 🔨 รับจ้าง/ช่าง: งานทาสี/ฉาบปูนภายนอกควรเลี่ยง ทำงานช่างในร่มแทนครับ`;
    } else {
      advice += `• 🌲 ชาวสวนยาง: ⚠️ วันนี้มีแนวโน้มฝนหนัก งดงานกรีดเพื่อถนอมหน้ายาง\n`;
      advice += `• 🍈 สวนทุเรียน: ⚠️ งดพ่นสารเคมี ตรวจสอบร่องระบายน้ำและค้ำกิ่งก้าน\n`;
      advice += `• 🛒 ค้าขาย/ตลาด: ⚠️ ผูกเชือกขึงผ้าใบให้แน่นหนา เตรียมรับมือฝนเท\n`;
      advice += `• 🔨 รับจ้าง/ช่าง: ⚠️ หยุดงานบนที่สูงและงานกลางแจ้ง ระวังฟ้าคะนองและลื่นล้มครับ`;
    }
  } else if (period === 'noon') {
    // คำแนะนำรอบเที่ยง 12:00 น.
    if (maxProb < 35 && maxPrecip < 0.2) {
      advice += `• 🌲 ชาวสวนยาง: พักผ่อนช่วงเที่ยง อุปกรณ์และถ้วยยางแห้งสนิทดี\n`;
      advice += `• 🍈 สวนทุเรียน: บ่ายแดดจัด พักผ่อนในร่ม รอแดดร่มค่อยเข้าตรวจสวน\n`;
      advice += `• 🛒 ค้าขาย/ตลาด: ช่วงบ่ายอากาศดี ลูกค้าเดินตลาดสะดวก ขายดีร่ำรวยครับ\n`;
      advice += `• 🔨 รับจ้าง/ช่าง: แดดแรงช่วงบ่าย ดื่มน้ำมากๆ ทำงานต่อเนื่องได้ราบรื่น`;
    } else if (maxProb < 55) {
      advice += `• 🌲 ชาวสวนยาง: ระวังเมฆฝนก่อตัวตามเชิงเขาช่วงบ่ายแก่ๆ\n`;
      advice += `• 🍈 สวนทุเรียน: ช่วงบ่ายมีโอกาสฝนผ่านสั้นๆ เตรียมผ้าคลุมกองปุ๋ย/ยา\n`;
      advice += `• 🛒 ค้าขาย/ตลาด: กางร่มกันแดดและดึงกันสาดรอไว้ช่วงบ่าย 2-4 โมง\n`;
      advice += `• 🔨 รับจ้าง/ช่าง: ทำงานกลางแจ้งระวังฝนตกไล่ที่ เตรียมที่เก็บเครื่องมือไฟฟ้าครับ`;
    } else {
      advice += `• 🌲 ชาวสวนยาง: ⚠️ เมฆฝนบ่ายหนาแน่น ระวังพายุลมกระโชกแรงในสวน\n`;
      advice += `• 🍈 สวนทุเรียน: ⚠️ ระวังพายุฝนฟ้าคะนองช่วงบ่าย เช็กเสาค้ำทุเรียน\n`;
      advice += `• 🛒 ค้าขาย/ตลาด: ⚠️ ช่วงบ่ายฝนเทหนัก ขนของขึ้นที่สูง ดึงกันสาดมัดแน่นหนา\n`;
      advice += `• 🔨 รับจ้าง/ช่าง: ⚠️ หลบเข้าที่ร่มปลอดภัย ระวังฟ้าผ่าและลมกระโชกแรงครับ`;
    }
  } else {
    // คำแนะนำรอบเย็น 16:00 น. (4 โมงเย็น)
    if (maxProb < 35 && maxPrecip < 0.2) {
      advice += `• 🌲 ชาวสวนยาง: คืนนี้อากาศดี แนวโน้มกรีดยางรอบดึกได้สบาย หน้ายางแห้ง\n`;
      advice += `• 🍈 สวนทุเรียน: อากาศเย็นสบาย ปิดระบบน้ำ พักผ่อนได้เต็มที่\n`;
      advice += `• 🛒 ตลาดเย็น/โต้รุ่ง: ค้าขายช่วงเย็นราบรื่น ไม่มีฝนกวนใจ ลูกค้าคึกคัก\n`;
      advice += `• 🔨 รับจ้าง/เลิกงาน: เก็บเครื่องมือกลับบ้านได้ราบรื่น เดินทางปลอดภัยครับ`;
    } else if (maxProb < 55) {
      advice += `• 🌲 ชาวสวนยาง: ช่วงหัวค่ำอาจมีละอองฝน แนะนำตรวจฟ้าก่อนตัดสินใจออกกรีดดึกนี้\n`;
      advice += `• 🍈 สวนทุเรียน: ตรวจดูท่อน้ำและดินชื้น ไม่ต้องเปิดน้ำรดรอบเย็น\n`;
      advice += `• 🛒 ตลาดเย็น/โต้รุ่ง: เตรียมผ้าใบและร่มหน้าร้าน ช่วงหัวค่ำอาจมีฝนปรอยสั้นๆ\n`;
      advice += `• 🔨 รับจ้าง/เลิกงาน: เดินทางกลับบ้านระวังถนนลื่นจากละอองฝนครับ`;
    } else {
      advice += `• 🌲 ชาวสวนยาง: ⚠️ คืนนี้มีแนวโน้มฝนตก งดกรีดยางรอบดึก เสี่ยงน้ำยางเน่าเสีย\n`;
      advice += `• 🍈 สวนทุเรียน: ⚠️ ค่ำนี้ลมแรงและฝนตก ระวังทางน้ำหลากในสวน\n`;
      advice += `• 🛒 ตลาดเย็น/โต้รุ่ง: ⚠️ มีฝนหนักช่วงค่ำ กางเต็นท์มัดสมอบกให้แน่นหนา\n`;
      advice += `• 🔨 รับจ้าง/เลิกงาน: ⚠️ ฝนตกถนนลื่น ขับขี่ปลอดภัย เปิดไฟหน้ารถด้วยนะครับ`;
    }
  }

  return advice;
}

// ==========================================
// สร้างรายงานสภาพอากาศตามช่วงเวลา
// ==========================================
function buildScheduledReport(weatherData, location, period) {
  const hourly = weatherData.hourly;
  const times = hourly.time;
  const rainProbs = hourly.precipitation_probability;
  const precips = hourly.precipitation;
  const temps = hourly.temperature_2m;
  const humidities = hourly.relativehumidity_2m;
  const winds = hourly.windspeed_10m;

  const thNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const thDateStr = thNow.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeNowStr = thNow.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  let headerTitle = '';
  let periodGreeting = '';
  let startHour = 7;
  let endHour = 14;

  if (period === 'morning') {
    headerTitle = `🌅 [รายงานอากาศรอบเช้า 07:00 น.]`;
    periodGreeting = `อรุณสวัสดิ์ครับพี่น้องชาวจันทบุรี! รายงานสภาพอากาศเริ่มต้นวันใหม่ เพื่อใช้วางแผนทำงานและค้าขายครับ ✨`;
    startHour = 7;
    endHour = 14;
  } else if (period === 'noon') {
    headerTitle = `☀️ [รายงานอากาศรอบเที่ยง 12:00 น.]`;
    periodGreeting = `สวัสดีตอนเที่ยงครับ! ทานข้าวเที่ยงให้อร่อยนะครับ รายงานอากาศช่วงบ่ายและแนวโน้มฝนสำหรับเตรียมพร้อมหน้าร้านครับ 🍱`;
    startHour = 12;
    endHour = 19;
  } else {
    headerTitle = `🌆 [รายงานอากาศรอบเย็น 16:00 น.]`;
    periodGreeting = `สวัสดีช่วง 4 โมงเย็นครับ! สรุปอากาศช่วงเย็นถึงค่ำ สำหรับร้านค้าตลาดเย็น คนทำงานเลิกงาน และเตรียมตัวกรีดยางรอบดึกครับ 🌙`;
    startHour = 16;
    endHour = 23;
  }

  // หาสล็อตเวลาใน Open-Meteo
  const todayISO = thNow.toISOString().split('T')[0];
  const startSlotStr = `${todayISO}T${String(startHour).padStart(2, '0')}:00`;
  let startIdx = times.findIndex(t => t >= startSlotStr);
  if (startIdx === -1) startIdx = 0;

  let maxProb = 0;
  let maxPrecip = 0;
  let maxTemp = -99;
  let minTemp = 99;
  const timeline = [];

  // เก็บข้อมูล 6 ชั่วโมงข้างหน้าของช่วงเวลานั้น
  for (let i = startIdx; i < startIdx + 6 && i < times.length; i++) {
    const timeStr = times[i].split('T')[1];
    const prob = rainProbs[i] || 0;
    const precip = precips[i] || 0;
    const temp = temps[i] || 0;

    if (prob > maxProb) maxProb = prob;
    if (precip > maxPrecip) maxPrecip = precip;
    if (temp > maxTemp) maxTemp = temp;
    if (temp < minTemp) minTemp = temp;

    timeline.push({
      time: timeStr,
      prob: prob,
      precip: precip,
      temp: temp
    });
  }

  const overallDesc = describeRainLevel(maxProb, maxPrecip);
  const currentTemp = temps[startIdx] || 30;
  const currentHumidity = humidities[startIdx] || 75;
  const currentWind = winds ? winds[startIdx] || 10 : 10;

  let msg = `${headerTitle} - ${location}\n`;
  msg += `📅 ${thDateStr}\n`;
  msg += `🕒 เวลาอัปเดต: ${timeNowStr} น.\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${periodGreeting}\n\n`;

  msg += `📢 สภาพอากาศภาพรวม: **${overallDesc.text}**\n`;
  msg += `• โอกาสฝนตกสูงสุด: ${maxProb}%\n`;
  msg += `• ปริมาณฝนคาดการณ์: ${maxPrecip.toFixed(1)} มม.\n`;
  msg += `• อุณหภูมิ: ${currentTemp}°C | ลม: ${currentWind} กม./ชม. | ความชื้น: ${currentHumidity}%\n\n`;

  msg += `🕒 เจาะลึกสภาพอากาศทีละชั่วโมง:\n`;
  timeline.forEach(item => {
    const desc = describeRainLevel(item.prob, item.precip);
    msg += ` • ${item.time} น. ➔ ${desc.text} (${item.prob}%, ${item.temp}°C)\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += getOccupationAdvice(period, maxProb, maxPrecip) + `\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 ข้อมูลตรวจวัดจริง: ECMWF / กรมอุตุนิยมวิทยา\n`;
  msg += `👦 โครงงานพัฒนาโดย: นายธนพนธ์ วิสุขะ (รร.ศรียานุสรณ์)\n`;
  msg += `⭐ ร่วมทำแบบประเมินโครงงานได้ที่:\n`;
  msg += `👉 https://chanthaburi-rain-alert.onrender.com/feedback`;

  const attachRadar = maxProb >= 35 || maxPrecip >= 0.5;
  return { message: msg, attachRadar, maxProb, maxPrecip };
}

// ==========================================
// ส่งแจ้งเตือน Broadcast ไปยังผู้ติดตามทุกคนใน LINE
// ==========================================
function sendLineBroadcast(messageText, token, attachRadar = false) {
  if (!token || token === "YOUR_CHANNEL_ACCESS_TOKEN_HERE") {
    console.log("ℹ️ [จำลองการส่ง] ยังไม่ได้ระบุ LINE Token");
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
          console.log("✅ [LINE Broadcast] ส่งแจ้งเตือน 3 รอบสำเร็จเรียบร้อย!");
          resolve();
        } else {
          console.log(`❌ [LINE Broadcast Error] Code: ${res.statusCode}, Body: ${data}`);
          resolve();
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ==========================================
// ฟังก์ชันหลัก (ทำงานตามช่วงเวลาที่กำหนด)
// ==========================================
async function main() {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "RIYT2T6aXXZ0NBLREcscWalGWPkTOit4azYZLCYfwALXdt4UPzDOT2wUbvRGuHX+MY8FBHN/nrYhi8w1VABkQxIoX7YvEGBpvO0RMQdrGC0RyM4/uAMmKQzjbwLOTQnPC3IsJKQUYAMZjSCqunMc2gdB04t89/1O/w1cDnyilFU=";

  const thNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const currentHour = thNow.getHours();
  const currentMinute = thNow.getMinutes();

  console.log("==================================================");
  console.log(`🕒 เวลาไทยปัจจุบัน: ${currentHour}:${String(currentMinute).padStart(2, '0')} น.`);
  console.log(`📍 พิกัดตรวจสอบ: ${CONFIG.location_name} (Lat ${CONFIG.latitude}, Lon ${CONFIG.longitude})`);
  console.log("==================================================");

  // กำหนดช่วงเวลาตามคำขอ: เช้า 7 โมง / กลางวัน เที่ยง / เย็น 4 โมงเย็น (16:00 น.)
  let period = 'morning';
  if (currentHour >= 5 && currentHour < 10) {
    period = 'morning'; // รอบเช้า 07:00 น.
  } else if (currentHour >= 10 && currentHour < 14) {
    period = 'noon';    // รอบเที่ยง 12:00 น.
  } else {
    period = 'evening'; // รอบเย็น 16:00 น. (4 โมงเย็น)
  }

  console.log(`📢 กำหนดการแจ้งเตือน: รอบ "${period}"`);

  try {
    const data = await fetchWeather(CONFIG.latitude, CONFIG.longitude);
    const report = buildScheduledReport(data, CONFIG.location_name, period);

    console.log("\n--- เนื้อหาข้อความที่จะส่ง LINE ---");
    console.log(report.message);
    console.log(`แนบภาพเรดาร์: ${report.attachRadar ? "ใช่ (ตรวจพบเมฆฝน)" : "ไม่ (สภาพอากาศโปร่ง)"}`);
    console.log("------------------------------------\n");

    console.log("🚀 กำลังส่ง Broadcast เข้า LINE หาพี่น้องชาวจันทบุรี...");
    await sendLineBroadcast(report.message, lineToken, report.attachRadar);
    console.log("✨ ทำงานเสร็จสมบูรณ์เรียบร้อย!");

  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดในการประมวลผล:", err.message);
  }
}

main();
