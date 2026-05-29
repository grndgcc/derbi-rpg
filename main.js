/**
 * ============================================================================
 * DERBİ RPG - ANA OYUN MOTORU VE RENDER SİSTEMİ (main.js)
 * ============================================================================
 * Tüm modüllerin birleştirildiği, GPU Canvas çizimlerinin yapıldığı ve 
 * Saniyede 60 Kare (FPS) çalışan ana döngünün (Game Loop) bulunduğu dosyadır.
 */

import { GAME_CONFIG, getTeam, getPlayerById } from './data.js';
import { inputManager } from './input.js';
import { actionHandler } from './actionHandler.js';
import { matchState, MATCH_PHASES } from './matchState.js';
import { 
    updatePlayerPhysics, 
    updateBallPhysics, 
    resolvePlayerCollisions, 
    handleDribbling, 
    checkPitchBoundaries 
} from './physics.js';

// ============================================================================
// 1. GLOBAL DEĞİŞKENLER VE CANVAS KURULUMU
// ============================================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false }); // alpha:false GPU optimizasyonu sağlar

// UI Elementleri
const uiLayer = document.getElementById('ui-layer');
const startMenu = document.getElementById('start-menu');
const scoreboard = document.getElementById('scoreboard');
const actionLog = document.getElementById('action-log');
const logText = document.getElementById('log-text');
const playerSelectBox = document.getElementById('player-selection-box');
const playerSelect = document.getElementById('player-select');
const btnStart = document.getElementById('btn-start');

let selectedTeamId = null;
let lastRenderTime = 0;
let aiWorker = null;
let latestAIIntents = []; // AI Worker'dan gelen son niyetler
let aiProcessing = false; // Worker meşgul mü?

// Ekran sarsıntısı (Screen Shake) için (Kritik vuruşlar veya gollerde)
let screenShake = 0;

// ============================================================================
// 2. BAŞLANGIÇ (MENÜ VE YÜKLEME)
// ============================================================================

function init() {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    // AI Worker'ı Başlat (Ayrı bir CPU thread'inde çalışır)
    // Not: ES6 Module kullanıldığı için type: 'module' şarttır.
    aiWorker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
    
    // Worker'dan gelen cevapları dinle
    aiWorker.onmessage = (e) => {
        latestAIIntents = e.data.intents;
        aiProcessing = false;
    };

    // UI Buton Dinleyicileri
    document.getElementById('btn-gs').addEventListener('click', () => selectTeam('gs'));
    document.getElementById('btn-fb').addEventListener('click', () => selectTeam('fb'));
    
    playerSelect.addEventListener('change', () => {
        if (playerSelect.value) {
            btnStart.classList.remove('hidden');
        } else {
            btnStart.classList.add('hidden');
        }
    });

    btnStart.addEventListener('click', startMatch);

    // Mörk Borg RPG Zar Loglarını (Spiker bildirimleri) dinle
    window.addEventListener('rpgLog', (e) => {
        const { actionName, resultText, isCritical } = e.detail;
        showActionLog(`[${actionName}] ${resultText}`, isCritical);
        
        // Kritik zarlarda ekranı hafifçe sars
        if (isCritical) screenShake = 15;
    });

    // Golleri Dinle
    window.addEventListener('goalScored', (e) => {
        showActionLog("GOOOOOOOOOOOOOL!!!", true);
        screenShake = 30; // Büyük sarsıntı
        document.getElementById('score-home').innerText = matchState.score.gs;
        document.getElementById('score-away').innerText = matchState.score.fb;
    });

    // Zamanlayıcıyı Dinle
    window.addEventListener('timeUpdate', (e) => {
        const m = e.detail.minutes.toString().padStart(2, '0');
        const s = e.detail.seconds.toString().padStart(2, '0');
        document.getElementById('match-timer').innerText = `${m}:${s}`;
    });
}

function selectTeam(teamId) {
    selectedTeamId = teamId;
    const teamData = getTeam(teamId);
    
    // Dropdown (Select) menüsünü doldur
    playerSelect.innerHTML = '<option value="">Kontrol edeceğiniz oyuncuyu seçin...</option>';
    teamData.squad.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.innerText = `${player.number} - ${player.name} (${player.role}) [Şut:${player.stats.sut}, Pas:${player.stats.pas}]`;
        playerSelect.appendChild(option);
    });

    playerSelectBox.classList.remove('hidden');
    btnStart.classList.add('hidden'); // Yeni takım seçildiğinde start butonunu gizle
}

function startMatch() {
    const selectedPlayerId = playerSelect.value;
    if (!selectedTeamId || !selectedPlayerId) return;

    // Menüyü gizle, Skoru göster
    startMenu.classList.add('hidden');
    scoreboard.classList.remove('hidden');

    // Maç Durumunu (State) Başlat
    matchState.initMatch(selectedTeamId, selectedPlayerId);

    // Game Loop'u (Ana Döngüyü) Tetikle
    requestAnimationFrame(gameLoop);
}

/**
 * Log ekranında metni gösterir ve 3 saniye sonra geri gizler.
 */
let logTimeout;
function showActionLog(text, isCritical) {
    actionLog.classList.remove('hidden');
    logText.innerText = text;
    
    // Kritik durumlar için rengi kırmızı yap
    logText.style.color = isCritical ? "#ff003c" : "#ffcc00";

    clearTimeout(logTimeout);
    logTimeout = setTimeout(() => {
        actionLog.classList.add('hidden');
    }, 3000);
}

/**
 * Canvas çözünürlüğünü ve ölçeklemesini (Aspect Ratio) ayarlar.
 */
function setupCanvas() {
    // Sahanın mantıksal (Oyun içi) pikselleri
    canvas.width = GAME_CONFIG.pitch.width;
    canvas.height = GAME_CONFIG.pitch.height;

    // Ekrana sığdırmak için CSS ile boyutlandırıyoruz ama mantıksal 1200x800 kalıyor
    // (Böylece fizik motoru ekran çözünürlüğünden bağımsız kusursuz çalışır)
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.objectFit = 'contain'; 
}

// ============================================================================
// 3. ANA OYUN DÖNGÜSÜ (GAME LOOP)
// ============================================================================

function gameLoop(timestamp) {
    // Geçen süreyi (Delta Time) hesapla. Akıcılık için kritik.
    const deltaTime = (timestamp - lastRenderTime) / 1000; // Saniye cinsinden
    lastRenderTime = timestamp;

    // Eğer deltaTime çok büyükse (sekme değiştirildiğinde), fizik motorunun sapıtmaması için sınırla
    const dt = Math.min(deltaTime, 0.05);

    // 1. UPDATE KATI (Matematik, Fizik, Kararlar)
    update(dt);

    // 2. RENDER KATI (Çizim, Grafikler)
    draw();

    // Sürekli kendini çağır (60 FPS)
    requestAnimationFrame(gameLoop);
}

// ============================================================================
// 4. UPDATE (FİZİK VE YAPAY ZEKA GÜNCELLEMELERİ)
// ============================================================================

function update(dt) {
    // A. HAKEM VE ZAMAN
    matchState.updateTimer(dt);

    // B. AI İLETİŞİMİ (WEB WORKER)
    // Eğer worker boşta ise sahanın yeni fotoğrafını yolla
    if (!aiProcessing && matchState.phase === MATCH_PHASES.PLAYING) {
        aiProcessing = true;
        aiWorker.postMessage(matchState.getGameStateDTO());
    }

    // C. GİRDİ (INPUT) ALIMI
    // İnsan oyuncunun niyetleri (Klavye/Gamepad)
    const humanIntent = inputManager.updateAndGetIntent();
    actionHandler.processHumanInput(matchState, humanIntent);
    
    // AI niyetlerini uygula
    if (latestAIIntents.length > 0) {
        actionHandler.processAIIntents(matchState, latestAIIntents);
        latestAIIntents = []; // İşlenenleri temizle
    }

    // D. FİZİK VE HAREKET
    // 1. Oyuncuların hareketi
    matchState.players.forEach(player => {
        // İnsan kontrolündeki oyuncuyu moveIntent'e göre, diğerlerini AI moveIntent'ine göre yürüt
        updatePlayerPhysics(player, player.moveIntent, player.targetMaxSpeed, dt);
    });

    // 2. Çarpışmalar (Omuz omuza mücadeleler)
    resolvePlayerCollisions(matchState.players);

    // 3. Top Fiziği (Eğer top sahadaysa)
    if (matchState.phase === MATCH_PHASES.PLAYING || matchState.phase === MATCH_PHASES.GOAL_CELEBRATION) {
        updateBallPhysics(matchState.ball, dt);
        
        // Saha sınırları ve Direk kontrolü
        const outOfBoundsEvent = checkPitchBoundaries(matchState.ball);
        if (outOfBoundsEvent !== "playing" && matchState.phase === MATCH_PHASES.PLAYING) {
            if (outOfBoundsEvent === "goal_home") matchState.scoreGoal("gs");
            else if (outOfBoundsEvent === "goal_away") matchState.scoreGoal("fb");
            else matchState.handleOutOfBounds(outOfBoundsEvent);
        }
    }

    // 4. Top Sürme (Dribbling) Kontrolü
    matchState.players.forEach(player => {
        if (handleDribbling(player, matchState.ball)) {
            matchState.playerWithBallId = player.id;
            matchState.possessionTeamId = player.teamId;
        }
    });

    // E. COOLDOWN VE SİSTEM GÜNCELLEMELERİ
    actionHandler.updateCooldowns();
    matchState.updatePossession();

    // Santra vuruşu (Kick-Off) Beklemesi (Klavye K/Pas tuşuna basınca başlar)
    if (matchState.phase === MATCH_PHASES.KICK_OFF) {
        if (humanIntent.actionPass) {
            matchState.phase = MATCH_PHASES.PLAYING;
            inputManager.resetInputs();
            showActionLog("DÜDÜK ÇALDI! MAÇ BAŞLADI!", false);
        }
    }
}

// ============================================================================
// 5. RENDER MOTORU (ÇİZİM İŞLEMLERİ)
// ============================================================================

function draw() {
    const { width, height, margin } = GAME_CONFIG.pitch;

    // 0. EKRAN SARSINTISI (Camera Shake Efekti)
    ctx.save();
    if (screenShake > 0) {
        const dx = (Math.random() - 0.5) * screenShake;
        const dy = (Math.random() - 0.5) * screenShake;
        ctx.translate(dx, dy);
        screenShake *= 0.9; // Sarsıntıyı giderek azalt
        if (screenShake < 0.5) screenShake = 0;
    }

    // 1. ZEMİN ÇİM ÇİZİMİ
    ctx.fillStyle = '#2d5a27'; // Koyu Yeşil
    ctx.fillRect(0, 0, width, height);

    // Çim Çizgileri (Açık/Koyu yeşil şeritler)
    ctx.fillStyle = '#32662c';
    const stripeWidth = 50;
    for (let x = margin; x < width - margin; x += stripeWidth * 2) {
        ctx.fillRect(x, margin, stripeWidth, height - (margin * 2));
    }

    // 2. BEYAZ SAHA ÇİZGİLERİ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    // Dış Çerçeve (Taç ve Aut Çizgileri)
    ctx.rect(margin, margin, width - (margin * 2), height - (margin * 2));
    
    // Orta Çizgi
    ctx.moveTo(width / 2, margin);
    ctx.lineTo(width / 2, height - margin);
    
    // Orta Yuvarlak
    ctx.moveTo(width / 2 + GAME_CONFIG.pitch.centerCircleRadius, height / 2);
    ctx.arc(width / 2, height / 2, GAME_CONFIG.pitch.centerCircleRadius, 0, Math.PI * 2);
    
    // Sol Ceza Sahası
    ctx.moveTo(margin, height / 2 - GAME_CONFIG.pitch.penaltyBoxHeight / 2);
    ctx.rect(margin, height / 2 - GAME_CONFIG.pitch.penaltyBoxHeight / 2, GAME_CONFIG.pitch.penaltyBoxWidth, GAME_CONFIG.pitch.penaltyBoxHeight);
    
    // Sağ Ceza Sahası
    ctx.moveTo(width - margin, height / 2 - GAME_CONFIG.pitch.penaltyBoxHeight / 2);
    ctx.rect(width - margin - GAME_CONFIG.pitch.penaltyBoxWidth, height / 2 - GAME_CONFIG.pitch.penaltyBoxHeight / 2, GAME_CONFIG.pitch.penaltyBoxWidth, GAME_CONFIG.pitch.penaltyBoxHeight);
    
    ctx.stroke();

    // 3. KALELERİN ÇİZİMİ
    const { goalWidth, goalHeight } = GAME_CONFIG.pitch;
    
    // Sol Kale (GS Ağı)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // Ağ efekti
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5; // Direk kalınlığı
    
    ctx.fillRect(margin - goalWidth, height / 2 - goalHeight / 2, goalWidth, goalHeight);
    ctx.strokeRect(margin - goalWidth, height / 2 - goalHeight / 2, goalWidth, goalHeight);
    
    // Sağ Kale (FB Ağı)
    ctx.fillRect(width - margin, height / 2 - goalHeight / 2, goalWidth, goalHeight);
    ctx.strokeRect(width - margin, height / 2 - goalHeight / 2, goalWidth, goalHeight);

    // 4. OYUNCULARIN ÇİZİMİ
    matchState.players.forEach(player => {
        const teamColors = getTeam(player.teamId).colors;
        const isSelected = player.id === matchState.humanPlayerId;

        // İnsan tarafından kontrol edilen oyuncunun altına belirteç halkası çiz
        if (isSelected) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.arc(player.x, player.y, GAME_CONFIG.player.radius + 6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Oyuncu Gövdesi
        ctx.beginPath();
        ctx.fillStyle = player.role === 'GK' ? '#000000' : teamColors.primary;
        ctx.strokeStyle = player.role === 'GK' ? teamColors.primary : teamColors.secondary;
        ctx.lineWidth = 3;
        ctx.arc(player.x, player.y, GAME_CONFIG.player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Forma Numarası (Sırt Numarası)
        ctx.fillStyle = teamColors.text;
        ctx.font = 'bold 12px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // İsimlendirme veritabanından çekilir (Bunu optimizasyon için başta player objesine eklemiştik)
        ctx.fillText(player.stats.sut ? player.name.charAt(0) : "X", player.x, player.y);
        
        // Cooldown'daysa (Yerde yatıyorsa) üzerine çarpı veya uyku simgesi çiz
        if (actionHandler._isOnCooldown(player.id)) {
            ctx.fillStyle = '#ff003c';
            ctx.fillText('Zzz', player.x, player.y - 20);
        }
    });

    // 5. TOPUN ÇİZİMİ (Pseudo 3D - Z Ekseni Etkisiyle)
    const ball = matchState.ball;
    
    // A. Topun Yerdeki Gölgesi (Top havalandıkça gölge küçülür ve açılır)
    const shadowAlpha = Math.max(0.1, 0.5 - (ball.z * 0.01)); // Yükseldikçe şeffaflaşır
    const shadowScale = Math.max(0.2, 1 - (ball.z * 0.02)); // Yükseldikçe gölge küçülür
    const shadowOffsetY = ball.z * 0.5; // Yükseldikçe gölge toptan aşağı ayrılır

    ctx.beginPath();
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.ellipse(ball.x, ball.y + shadowOffsetY, GAME_CONFIG.ball.radius * shadowScale, (GAME_CONFIG.ball.radius / 2) * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // B. Gerçek Topun Kendisi (Top havalandıkça kameraya yaklaştığı için büyür)
    const ballApparentSize = GAME_CONFIG.ball.radius + (ball.z * 0.15); // Z ekseni boyutu artırır
    const apparentY = ball.y - ball.z; // Y ekseninde yukarı kaydırma (Kamera yanılsaması)

    ctx.beginPath();
    ctx.fillStyle = '#ffffff'; // Topun beyazı
    ctx.arc(ball.x, apparentY, ballApparentSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Top Deseni (Mörk Borg hissiyatı için sert çizgiler)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(ball.x - ballApparentSize, apparentY);
    ctx.lineTo(ball.x + ballApparentSize, apparentY);
    ctx.stroke();

    // 6. EKRAN ÜSTÜ YAZILAR (Santra Beklentisi vb.)
    if (matchState.phase === MATCH_PHASES.KICK_OFF) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(width/2 - 200, height/2 - 60, 400, 120);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('SANTRA BEKLENİYOR', width / 2, height / 2 - 10);
        ctx.font = '16px Courier New';
        ctx.fillText('Başlamak için (K) veya PAS tuşuna basın', width / 2, height / 2 + 20);
    }

    ctx.restore(); // Screen Shake ayarlarını geri al
}

// ============================================================================
// 6. OYUNU BAŞLATMA
// ============================================================================

// DOM yüklendikten sonra çalıştır
document.addEventListener('DOMContentLoaded', init);