/**
 * ============================================================================
 * DERBİ RPG - FİZİK VE ÇARPIŞMA MOTORU (physics.js)
 * ============================================================================
 * Bu modül, sahadaki tüm objelerin (top, oyuncular, direkler) hareketlerini,
 * sürtünme katsayılarını, yerçekimini ve birbirleriyle olan etkileşimlerini hesaplar.
 * Mörk Borg RPG statları, buradaki fiziksel limitleri (hız, itme gücü) doğrudan etkiler.
 */

import { GAME_CONFIG } from './data.js';
import { calculateDribbleControlDistance } from './rpgEngine.js';

// ============================================================================
// 1. VEKTÖR MATEMATİĞİ KÜTÜPHANESİ (GPU Çizimi ve Fizik İçin Temel)
// ============================================================================

export class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) { return new Vector2D(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2D(this.x - v.x, this.y - v.y); }
    mult(n) { return new Vector2D(this.x * n, this.y * n); }
    div(n) { return new Vector2D(this.x / n, this.y / n); }
    
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); } // Vektörün büyüklüğü (Hız/Mesafe)
    
    normalize() {
        const m = this.mag();
        return m === 0 ? new Vector2D(0, 0) : this.div(m);
    }
    
    limit(max) {
        if (this.mag() > max) {
            return this.normalize().mult(max);
        }
        return this;
    }

    distance(v) { return this.sub(v).mag(); }
    
    // Noktasal Çarpım (İki vektörün aynı yöne bakıp bakmadığını anlamak için)
    dot(v) { return this.x * v.x + this.y * v.y; }
}

// ============================================================================
// 2. OYUNCU FİZİĞİ (Hareket ve Omuz Omuza Mücadele)
// ============================================================================

/**
 * Oyuncunun hareket vektörünü ve ivmelenmesini hesaplar.
 * @param {Object} player - Oyuncu obje referansı (x, y, vx, vy, stats vb. içerir)
 * @param {Vector2D} targetDir - İstenilen hareket yönü (Normalize edilmiş)
 * @param {number} maxSpeed - rpgEngine'den gelen stat bazlı maksimum hız
 * @param {number} deltaTime - Frameler arası geçen süre (Akıcılık için)
 */
export function updatePlayerPhysics(player, targetDir, maxSpeed, deltaTime) {
    // Hızlanma (Acceleration) statı ivmeyi belirler. 
    // Statı yüksek oyuncu max hızına 2 frame'de çıkar, düşük oyuncu 10 frame'de.
    const accelerationRate = 0.5 + (player.stats.hizlanma * 0.15); 
    
    if (targetDir.mag() > 0) {
        // İstenilen yöne doğru ivmelenme uygula
        player.vx += targetDir.x * accelerationRate;
        player.vy += targetDir.y * accelerationRate;
    } else {
        // Tuşa basılmıyorsa yavaşlayarak durma (Sürtünme/Frenleme)
        player.vx *= 0.8; 
        player.vy *= 0.8;
    }

    // Oyuncunun mevcut hız vektörü
    let currentVelocity = new Vector2D(player.vx, player.vy);
    
    // Mörk Borg hız statının izin verdiği limiti aşmasını engelle
    currentVelocity = currentVelocity.limit(maxSpeed);
    
    player.vx = currentVelocity.x;
    player.vy = currentVelocity.y;

    // Pozisyonu güncelle
    player.x += player.vx;
    player.y += player.vy;

    // Saha sınırlarında oyuncuyu tut (Taç çizgilerinden dışarı koşamasın)
    keepPlayerInBounds(player);
}

/**
 * İki oyuncu birbirine çarptığında yaşanacak fiziksel tepki.
 * "Güç" (Strength) statı yüksek olan, düşük olanı iter.
 */
export function resolvePlayerCollisions(players) {
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            const p1 = players[i];
            const p2 = players[j];
            
            const pos1 = new Vector2D(p1.x, p1.y);
            const pos2 = new Vector2D(p2.x, p2.y);
            const dist = pos1.distance(pos2);
            
            const minDist = GAME_CONFIG.player.radius * 2; // Çarpışma mesafesi

            if (dist < minDist && dist > 0) {
                // Oyuncular iç içe girmiş, itme vektörü hesapla
                const overlap = minDist - dist;
                const pushDir = pos1.sub(pos2).normalize();
                
                // Mörk Borg Güç Kıyaslaması (Zar atılmadan pasif stat olarak çalışır)
                // -3 ile +3 arasındaki farka göre kimin ne kadar itileceği belirlenir.
                const p1Weight = 10 + p1.stats.guc; 
                const p2Weight = 10 + p2.stats.guc;
                const totalWeight = p1Weight + p2Weight;
                
                const p1PushRatio = p2Weight / totalWeight; // P2 daha güçlüyse P1 daha çok itilir
                const p2PushRatio = p1Weight / totalWeight;
                
                // P1'i dışarı it
                p1.x += pushDir.x * (overlap * p1PushRatio);
                p1.y += pushDir.y * (overlap * p1PushRatio);
                
                // P2'yi ters yöne dışarı it
                p2.x -= pushDir.x * (overlap * p2PushRatio);
                p2.y -= pushDir.y * (overlap * p2PushRatio);
            }
        }
    }
}

/**
 * Oyuncunun saha sınırları (margin) dışına çıkmasını engeller.
 */
function keepPlayerInBounds(player) {
    const r = GAME_CONFIG.player.radius;
    const margin = GAME_CONFIG.pitch.margin;
    
    if (player.x < margin + r) player.x = margin + r;
    if (player.x > GAME_CONFIG.pitch.width - margin - r) player.x = GAME_CONFIG.pitch.width - margin - r;
    if (player.y < margin + r) player.y = margin + r;
    if (player.y > GAME_CONFIG.pitch.height - margin - r) player.y = GAME_CONFIG.pitch.height - margin - r;
}

// ============================================================================
// 3. TOP FİZİĞİ (2.5D Boyutlu - X, Y ve Yerçekimi/Z Ekseni)
// ============================================================================

/**
 * Topun sahadaki süzülüşünü, sekmelerini ve yavaşlamasını hesaplar.
 * Z ekseni (yükseklik) şut ve uzun paslar için kullanılır.
 */
export function updateBallPhysics(ball, deltaTime) {
    // 1. Z-Ekseni (Yükseklik ve Yerçekimi) Fiziği
    if (ball.z > 0 || ball.vz !== 0) {
        ball.vz -= 0.5; // Yerçekimi kuvveti (Gravity)
        ball.z += ball.vz;

        // Top yere çarptı
        if (ball.z <= 0) {
            ball.z = 0;
            // Topun dikey enerjisi yatay hıza biraz aktarılır veya sönümlenir
            ball.vz = -ball.vz * 0.4; // %40 sekme (Bounce)
            
            // Sekme enerjisi çok düşükse top yerde yuvarlanmaya başlar
            if (Math.abs(ball.vz) < 1) {
                ball.vz = 0;
            }
        }
    }

    // 2. X ve Y Ekseninde İlerleme
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 3. Sürtünme (Friction) Uygulaması
    // Eğer top havadaysa (z > 0) sürtünme çok düşüktür (hava direnci).
    // Top çimde (z == 0) ise çim sürtünmesi etki eder.
    const currentFriction = ball.z > 0 ? 0.995 : GAME_CONFIG.ball.friction;
    
    ball.vx *= currentFriction;
    ball.vy *= currentFriction;

    // Kinetik enerjisi çok düşen topu tamamen durdur (Titreşimi engellemek için)
    if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
    if (Math.abs(ball.vy) < 0.05) ball.vy = 0;
}

// ============================================================================
// 4. TOP - OYUNCU ETKİLEŞİMİ (Top Sürme ve Kontrol)
// ============================================================================

/**
 * Bir oyuncunun topu kontrol edip edemediğini ve ediyorsa top sürme dinamiğini hesaplar.
 * @param {Object} player - Topu ayağında tutan oyuncu
 * @param {Object} ball - Oyun topu
 */
export function handleDribbling(player, ball) {
    // Top havadaysa (Z > 10) ayakla kontrol edilemez (Kafa veya göğüs kontrolü eklenebilir)
    if (ball.z > 10) return false;

    const pPos = new Vector2D(player.x, player.y);
    const bPos = new Vector2D(ball.x, ball.y);
    const distance = pPos.distance(bPos);

    // Mörk Borg "Top Sürme" (Dribble) statına göre topun ne kadar açılabileceği hesaplanır
    const controlRadius = calculateDribbleControlDistance(player.stats) + GAME_CONFIG.player.radius;

    if (distance <= controlRadius) {
        // Oyuncu topu kontrolüne alıyor
        // Top, oyuncunun baktığı yönde ve hızında oyuncunun ayağına "mıknatıslanır"
        
        // Eğer oyuncu koşuyorsa topu biraz öne atar, duruyorsa tam dibinde tutar.
        const speed = new Vector2D(player.vx, player.vy).mag();
        
        // Hız yönü veya varsayılan yön
        const dir = speed > 0.1 ? new Vector2D(player.vx, player.vy).normalize() : new Vector2D(0, 1);
        
        // Top süren oyuncunun hızının bir kısmı topa aktarılır (Top ayakla birlikte gider)
        // Ancak statlara bağlı olarak top ara sıra ayaktan hafifçe sekebilir
        const dribbleImperfectness = Math.max(0, 3 - player.stats.topSurme) * (Math.random() * 0.5);
        
        // İdeal top pozisyonu: Oyuncunun hemen önü
        const idealBallPos = pPos.add(dir.mult(GAME_CONFIG.player.radius + 5 + dribbleImperfectness));
        
        // Topu ideal pozisyona doğru yumuşakça çek (Smoothing/Lerp)
        ball.x += (idealBallPos.x - ball.x) * 0.5;
        ball.y += (idealBallPos.y - ball.y) * 0.5;
        
        // Topun hızı oyuncunun hızına eşitlenir
        ball.vx = player.vx;
        ball.vy = player.vy;
        
        return true; // Top bu oyuncunun kontrolünde
    }
    
    return false; // Top boşta
}

// ============================================================================
// 5. SAHA SINIRLARI VE KALE/DİREK ÇARPIŞMALARI
// ============================================================================

/**
 * Topun sahanın dışına (Taç/Aut) çıkıp çıkmadığını ve 
 * direklere veya ağlara çarpıp çarpmadığını detaylıca kontrol eder.
 * @returns {Object} Durum raporu (örn: "goal_home", "throw_in", "corner", "playing")
 */
export function checkPitchBoundaries(ball) {
    const { width, height, margin, goalWidth, goalHeight } = GAME_CONFIG.pitch;
    const r = GAME_CONFIG.ball.radius;

    // Kale direklerinin Y eksenindeki konumları
    const goalCenterY = height / 2;
    const goalTopY = goalCenterY - (goalHeight / 2);
    const goalBottomY = goalCenterY + (goalHeight / 2);

    let matchEvent = "playing"; // Varsayılan durum: Oyun devam ediyor

    // --- SOL KALE (Ev Sahibi / GS) KONTROLÜ ---
    if (ball.x - r < margin) {
        // Top Y ekseninde kaleyi buldu mu?
        if (ball.y > goalTopY && ball.y < goalBottomY) {
            // Eğer z ekseni (yükseklik) direk boyunu aşmadıysa GOL!
            // Z=0 yer, Z=30 direk üstü kabul edelim.
            if (ball.z < 30) {
                // Top filelere takılıp seker
                ball.vx = Math.abs(ball.vx) * 0.3; // İçeride yavaşla
                if (ball.x < margin - goalWidth) ball.x = margin - goalWidth; // Ağların en dibi
                matchEvent = "goal_away"; // Top sol kaleye girdi, deplasman gol attı
            } else {
                // Top üst direğin üstünden dışarı çıktı (Aut)
                matchEvent = "goal_kick";
            }
        } else {
            // Kale değil, direk dışına çıktı (Kornere veya Auta)
            // Direğe çarpma kontrolü (Basit nokta çarpışması)
            const distToTopPost = new Vector2D(margin, goalTopY).distance(new Vector2D(ball.x, ball.y));
            const distToBottomPost = new Vector2D(margin, goalBottomY).distance(new Vector2D(ball.x, ball.y));
            
            if ((distToTopPost < r * 2 || distToBottomPost < r * 2) && ball.z < 30) {
                // DİREKTEN DÖNDÜ! (Fiziği ters çevir ve sertçe sektir)
                ball.vx = Math.abs(ball.vx) * GAME_CONFIG.ball.bounce;
                ball.x = margin + r; // Direk hizasında tut
                // RPG Engine'e bir event yollanabilir burada "ÇATAL!" diye ama onu game loop'da yapacağız.
            } else {
                matchEvent = "goal_kick_or_corner"; // Çarpan oyuncuya göre Main JS karar verecek
            }
        }
    }

    // --- SAĞ KALE (Deplasman / FB) KONTROLÜ ---
    else if (ball.x + r > width - margin) {
        if (ball.y > goalTopY && ball.y < goalBottomY) {
            if (ball.z < 30) {
                ball.vx = -Math.abs(ball.vx) * 0.3; 
                if (ball.x > width - margin + goalWidth) ball.x = width - margin + goalWidth;
                matchEvent = "goal_home";
            } else {
                matchEvent = "goal_kick";
            }
        } else {
            const distToTopPost = new Vector2D(width - margin, goalTopY).distance(new Vector2D(ball.x, ball.y));
            const distToBottomPost = new Vector2D(width - margin, goalBottomY).distance(new Vector2D(ball.x, ball.y));
            
            if ((distToTopPost < r * 2 || distToBottomPost < r * 2) && ball.z < 30) {
                ball.vx = -Math.abs(ball.vx) * GAME_CONFIG.ball.bounce;
                ball.x = width - margin - r;
            } else {
                matchEvent = "goal_kick_or_corner";
            }
        }
    }

    // --- TAÇ ÇİZGİLERİ ALT VE ÜST KONTROLÜ ---
    if (ball.y - r < margin) {
        // Üst Taç Çizgisi
        matchEvent = "throw_in_top";
    } else if (ball.y + r > height - margin) {
        // Alt Taç Çizgisi
        matchEvent = "throw_in_bottom";
    }

    return matchEvent;
}