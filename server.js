const express = require('express');
const fs = require('fs-extra');
const axios = require('axios');
const ytdl = require('ytdl-core');
const path = require('path');
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serve index.html dari root

const PORT = process.env.PORT || 3000;

// Store pairing codes
const pairingCodes = new Map();

let sock = null;
let botNumber = null;

// ==================== START BOT ====================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: true,
    syncFullHistory: false
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) console.log('📱 Scan QR Code jika diperlukan:', qr);
    
    if (connection === 'open') {
      botNumber = sock.user.id.split(':')[0];
      console.log(`✅ BOTZEROZXTEST AKTIF!`);
      console.log(`📱 Nomor Bot: ${botNumber}`);
      console.log(`⚡ Command hanya bisa dipakai oleh nomor bot sendiri!\n`);
    }
    
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔄 Koneksi terputus, mencoba reconnect...');
        startBot();
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ========== HANDLER PESAN ==========
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const body = msg.message.conversation || 
                 msg.message.extendedTextMessage?.text || 
                 '';
    
    if (!body.startsWith('.')) return;
    
    console.log(`📩 [${from}] ${body}`);
    
    // Cek apakah pengirim adalah nomor bot sendiri
    const senderNumber = msg.key.participant || from;
    const isSelf = senderNumber.includes(botNumber);
    
    if (!isSelf) {
      await sock.sendMessage(from, { 
        text: '❌ Akses ditolak! Command hanya bisa digunakan oleh *nomor bot itu sendiri*.'
      });
      return;
    }
    
    const args = body.slice(1).trim().split(' ');
    const cmd = args[0].toLowerCase();
    
    try {
      // ========== .sticker ==========
      if (cmd === 'sticker') {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
          await sock.sendMessage(from, { text: '📌 *Cara pakai .sticker:*\nReply gambar/video lalu ketik .sticker' });
          return;
        }
        
        const media = quoted.imageMessage || quoted.videoMessage;
        if (!media) {
          await sock.sendMessage(from, { text: '❌ Reply ke GAMBAR atau VIDEO ya!' });
          return;
        }
        
        await sock.sendMessage(from, { text: '⏳ Membuat stiker...' });
        const buffer = await downloadMediaMessage(quoted, 'buffer', {}, {});
        await sock.sendMessage(from, { 
          sticker: buffer,
          mimetype: 'image/webp'
        });
      }
      
      // ========== .ytmp3 ==========
      else if (cmd === 'ytmp3' && args[1]) {
        const url = args[1];
        if (!ytdl.validateURL(url)) {
          await sock.sendMessage(from, { text: '❌ URL YouTube tidak valid!\nContoh: .ytmp3 https://youtu.be/xxx' });
          return;
        }
        
        await sock.sendMessage(from, { text: '🎵 Mengunduh audio... mohon tunggu ⏳' });
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
        
        const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
        const outputPath = path.join(__dirname, 'temp', `${title}.mp3`);
        await fs.ensureDir('./temp');
        
        const writeStream = fs.createWriteStream(outputPath);
        stream.pipe(writeStream);
        
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        
        await sock.sendMessage(from, { 
          audio: fs.readFileSync(outputPath),
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`
        });
        fs.unlinkSync(outputPath);
      }
      
      // ========== .vo (Anti ViewOnce) ==========
      else if (cmd === 'vo') {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const viewOnce = quoted?.viewOnceMessageV2 || quoted?.viewOnceMessage;
        
        if (!viewOnce) {
          await sock.sendMessage(from, { text: '📌 *Cara pakai .vo:*\nReply pesan "Sekali Lihat" lalu ketik .vo' });
          return;
        }
        
        const media = viewOnce.message?.imageMessage || viewOnce.message?.videoMessage;
        if (media) {
          const buffer = await downloadMediaMessage(quoted, 'buffer', {}, {});
          if (media.mimetype.startsWith('image')) {
            await sock.sendMessage(from, { image: buffer, caption: '🔓 Pesan sekali lihat berhasil dibuka!' });
          } else {
            await sock.sendMessage(from, { video: buffer, caption: '🔓 Pesan sekali lihat berhasil dibuka!' });
          }
        }
      }
      
      // ========== .ai ==========
      else if (cmd === 'ai') {
        const prompt = args.slice(1).join(' ');
        if (!prompt) {
          await sock.sendMessage(from, { text: '❌ Contoh: .ai halo apa kabar?' });
          return;
        }
        await sock.sendMessage(from, { text: `🤖 *BOTZEROZXTEST AI*\n\nKamu bertanya: "${prompt}"\n\n⚠️ Fitur AI sedang dalam pengembangan. Nanti akan terintegrasi dengan Gemini API!` });
      }
      
      // ========== .help / .menu ==========
      else if (cmd === 'help' || cmd === 'menu') {
        await sock.sendMessage(from, { text: `
🤖 *BOTZEROZXTEST - DAFTAR COMMAND*

━━━━━━━━━━━━━━━━━━━━━━
🔹 *.sticker* - Buat stiker dari gambar/video
🔹 *.ytmp3 [url]* - Download audio YouTube
🔹 *.ig [url]* - Download Instagram
🔹 *.tt [url]* - Download TikTok
🔹 *.fb [url]* - Download Facebook
🔹 *.tw [url]* - Download Twitter/X
🔹 *.ai [pesan]* - Chat dengan AI
🔹 *.vo* - Buka pesan sekali lihat
🔹 *.help* - Menu bantuan
━━━━━━━━━━━━━━━━━━━━━━

✨ *Auto Reply aktif!*
📌 Ketik "halo", "p", "assalamualaikum" untuk coba auto reply.

⚡ Bot by ZeroZXTest
        `});
      }
      
      // ========== Unknown command ==========
      else {
        await sock.sendMessage(from, { text: `❌ Command "${cmd}" tidak dikenal.\nKetik .help untuk melihat daftar command.` });
      }
      
    } catch (err) {
      console.error(err);
      await sock.sendMessage(from, { text: `⚠️ Error: ${err.message}` });
    }
  });
  
  // ========== AUTO REPLY ==========
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const body = msg.message.conversation?.toLowerCase() || '';
    
    const autoReplies = {
      'halo': 'Halo juga! Ada yang bisa dibantu? Ketik .help untuk command ya 🤖',
      'hai': 'Hai! Selamat datang di BOTZEROZXTEST 🚀',
      'p': '🏓 Pong! Bot aktif dan sehat.',
      'assalamualaikum': 'Wa\'alaikumsalam warahmatullah wabarakatuh 👋',
      'bot': 'Ya, saya BOTZEROZXTEST! WhatsApp Bot super lengkap 🤖',
      'help': 'Ketik .help untuk melihat semua command yang tersedia!'
    };
    
    for (const [key, reply] of Object.entries(autoReplies)) {
      if (body.includes(key)) {
        await sock.sendMessage(from, { text: reply });
        break;
      }
    }
  });
}

// ==================== API ENDPOINT ====================
app.post('/jadibot2', async (req, res) => {
  const { nomor } = req.body;
  
  console.log(`📞 Request pairing untuk nomor: ${nomor}`);
  
  if (!nomor || !/^[1-9][0-9]{9,14}$/.test(nomor)) {
    return res.json({ 
      status: false, 
      error: 'Format nomor tidak valid! Gunakan format: 628xxxxxxxxxx' 
    });
  }
  
  if (!sock) {
    return res.json({ 
      status: false, 
      error: 'Bot sedang dalam proses koneksi, coba lagi sebentar' 
    });
  }
  
  try {
    const pairingCode = await sock.requestPairingCode(nomor);
    pairingCodes.set(nomor, pairingCode);
    console.log(`✅ Pairing code untuk ${nomor}: ${pairingCode}`);
    
    res.json({
      status: true,
      pairing_code: pairingCode,
      cara: 'Buka WhatsApp > Setelan > Perangkat Tertaut > Tautkan Perangkat > Masukkan kode ini'
    });
  } catch (err) {
    console.error(`❌ Gagal membuat pairing: ${err.message}`);
    res.json({ 
      status: false, 
      error: err.message || 'Gagal membuat pairing code' 
    });
  }
});

// ==================== ROUTE HTML ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== START SERVER ====================
fs.ensureDirSync('./temp');
fs.ensureDirSync('./sessions');

startBot();

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║     BOTZEROZXTEST - READY!           ║
╠══════════════════════════════════════╣
║  🌐 Web: http://localhost:${PORT}     ║
║  📱 Bot: Menunggu koneksi...         ║
║  ⚡ Status: ONLINE                    ║
╚══════════════════════════════════════╝
  `);
});