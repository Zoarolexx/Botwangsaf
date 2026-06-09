const express = require('express');
const fs = require('fs-extra');
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
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

let sock = null;
let botNumber = null;
let isConnected = false;

// ==================== START BOT ====================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    patchWhatsappMd: true, // Penting untuk pairing code
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('📱 QR CODE (scan jika pairing code gagal):');
      console.log(qr);
    }
    
    if (connection === 'open') {
      isConnected = true;
      botNumber = sock.user.id.split(':')[0];
      console.log('\n========================================');
      console.log('✅ BOTZEROZXTEST BERHASIL AKTIF!');
      console.log(`📱 NOMOR BOT: ${botNumber}`);
      console.log('⚡ PAIRING CODE SIAP DIGUNAKAN!');
      console.log('========================================\n');
    }
    
    if (connection === 'close') {
      isConnected = false;
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ Koneksi terputus: ${reason}`);
      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔄 Mencoba reconnect dalam 5 detik...');
        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  
  // ========== HANDLER PESAN ==========
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const body = msg.message.conversation || 
                 msg.message.extendedTextMessage?.text || '';
    
    // Auto reply sederhana
    if (body.toLowerCase() === 'p') {
      await sock.sendMessage(from, { text: '🏓 Pong! Bot aktif.' });
    }
    
    // Command handler
    if (body.startsWith('.') && from.includes(botNumber)) {
      const args = body.slice(1).trim().split(' ');
      const cmd = args[0].toLowerCase();
      
      if (cmd === 'help') {
        await sock.sendMessage(from, { 
          text: '🤖 *BOTZEROZXTEST*\n\n.sticker - Buat stiker\n.ytmp3 [url] - Download audio\n.vo - Buka pesan sekali lihat\n.help - Menu bantuan' 
        });
      } else if (cmd === 'sticker') {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted?.imageMessage || quoted?.videoMessage) {
          const buffer = await downloadMediaMessage(quoted, 'buffer', {}, {});
          await sock.sendMessage(from, { sticker: buffer });
        } else {
          await sock.sendMessage(from, { text: 'Reply gambar/video dengan .sticker' });
        }
      }
    }
  });
}

// ==================== API PAIRING (PERBAIKAN) ====================
app.post('/jadibot2', async (req, res) => {
  const { nomor } = req.body;
  
  console.log(`\n📞 [REQUEST PAIRING] Nomor: ${nomor}`);
  
  // Validasi nomor
  if (!nomor) {
    return res.json({ status: false, error: 'Nomor tidak boleh kosong!' });
  }
  
  // Format nomor (hapus karakter aneh)
  let cleanNumber = nomor.toString().replace(/[^0-9]/g, '');
  if (!cleanNumber.startsWith('62') && !cleanNumber.startsWith('60') && !cleanNumber.startsWith('65')) {
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    } else if (!cleanNumber.startsWith('1') && cleanNumber.length < 11) {
      return res.json({ status: false, error: 'Gunakan kode negara! Contoh: 628123456789' });
    }
  }
  
  if (cleanNumber.length < 10 || cleanNumber.length > 15) {
    return res.json({ status: false, error: `Nomor tidak valid (${cleanNumber.length} digit)` });
  }
  
  // Cek koneksi bot
  if (!sock || !isConnected) {
    return res.json({ status: false, error: 'Bot sedang memulai, tunggu 10 detik dan coba lagi!' });
  }
  
  try {
    console.log(`⏳ Mengirim pairing code ke ${cleanNumber}...`);
    
    // KIRIM PAIRING CODE
    const pairingCode = await sock.requestPairingCode(cleanNumber);
    
    console.log(`✅ PAIRING CODE BERHASIL: ${pairingCode}`);
    console.log(`📱 Untuk nomor: ${cleanNumber}\n`);
    
    res.json({
      status: true,
      pairing_code: pairingCode,
      nomor: cleanNumber,
      cara: '1. Buka WhatsApp\n2. Setelan → Perangkat Tertaut\n3. Tautkan Perangkat\n4. Masukkan kode: ' + pairingCode
    });
    
  } catch (error) {
    console.error(`❌ GAGAL PAIRING:`, error.message);
    res.json({ 
      status: false, 
      error: error.message || 'Gagal mengirim pairing code. Pastikan nomor WhatsApp aktif!'
    });
  }
});

// Cek status bot
app.get('/status', (req, res) => {
  res.json({ 
    connected: isConnected, 
    botNumber: botNumber,
    ready: sock && isConnected 
  });
});

// Serve halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== START ====================
(async () => {
  await startBot();
  
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║                                                   ║
║   🤖 BOTZEROZXTEST - READY TO PAIR               ║
║                                                   ║
║   🌐 WEB UI: http://localhost:${PORT}             ║
║   📡 STATUS: Menunggu koneksi WhatsApp...        ║
║                                                   ║
║   ⚡ TUNGGU HINGGA TERSAJAT "BOT AKTIF"           ║
║   ⚡ BARU BISA PAIRING!                           ║
║                                                   ║
╚══════════════════════════════════════════════════╝
    `);
  });
})();
