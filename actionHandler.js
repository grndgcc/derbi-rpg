/**
 * ============================================================================
 * DERBİ RPG - EYLEM VE MEKANİK İŞLEYİCİSİ (actionHandler.js)
 * ============================================================================
 * Bu modül, oyuncuların (İnsan veya AI) fiziksel dünyadaki niyetlerini alır,
 * Mörk Borg zar motorunda test eder ve sonuçları fiziksel vektörlere dökerek
 * sahaya yansıtır. Topun ayaktan çıkması, şutun kaleye gitmesi burada gerçekleşir.
 */

import { GAME_CONFIG } from './data.js';
import { Vector2D } from './physics.js';
import { resolvePass, resolveShot, resolveTackle, calculateMaxSpeed } from './rpgEngine.js';

export class ActionHandler {
    constructor() {
        // Eylemlerin arka arkaya spamlanmasını önlemek için bekleme süreleri (Cooldown)
        // Örn: Kayma tuşuna bastıktan sonra oyuncu 60 frame (1 saniye) yerden kalkamaz.
        this.cooldowns = new Map();
    }

    // ========================================================================
    // 1. İNSAN OYUNCU (HUMAN) GİRDİLERİNİN İŞLENMESİ
    // ========================================================================
    
    /**
     * İnsanın kontrol ettiği oyuncunun o frame'deki niyetlerini eyleme dönüştürür.
     * @param {Object} gameState - Oyunun tüm anlık verilerini barındıran obje
     * @param {Object} humanIntent - inputManager.updateAndGetIntent() çıktısı
     */
    processHumanInput(gameState, humanIntent) {
        const player = gameState.players.find(p => p.id === gameState.humanPlayerId);
        if (!player) return;

        // 1. Cooldown Kontrolü (Oyuncu yerde kayıyorsa veya şut çekmişse hareket edemez)
        if (this._isOnCooldown(player.id)) {
            // İvmesini sıfırla (yerde sürükleniyor)
            player.vx *= 0.5;
            player.vy *= 0.5;
            return; 
        }

        // 2. Hareket ve İvmelenme İstekleri
        // Sprint (Hızlı koşu) tuşuna basılıyorsa taban hızı artır
        const baseSpeed = humanIntent.isSprinting ? GAME_CONFIG.player.baseSpeed * 1.5 : GAME_CONFIG.player.baseSpeed;
        player.targetMaxSpeed = calculateMaxSpeed(player.stats, baseSpeed);
        player.moveIntent = humanIntent.moveVector; // Bu vektör physics.js tarafından işlenecek

        // 3. Toplu ve Topsuz Aksiyonlar
        const hasBall = gameState.playerWithBallId === player.id;

        if (hasBall) {
            // TOP BİZDEYSE: Pas veya Şut atabiliriz
            if (humanIntent.actionPass) {
                this.executePass(player, gameState);
            } else if (humanIntent.actionShot) {
                this.executeShot(player, gameState);
            }
        } else {
            // TOP BİZDE DEĞİLSE: Kayarak müdahale (Tackle) yapabiliriz
            if (humanIntent.actionTackle) {
                this.executeTackle(player, gameState);
            }
        }
    }

    // ========================================================================
    // 2. YAPAY ZEKA (AI) NİYETLERİNİN İŞLENMESİ
    // ========================================================================
    
    /**
     * Web Worker'dan gelen 21 farklı oyuncunun niyet listesini okur.
     * @param {Object} gameState - Oyun durumu
     * @param {Array} aiIntents - aiWorker.js'ten gelen niyet dizisi
     */
    processAIIntents(gameState, aiIntents) {
        aiIntents.forEach(intent => {
            const player = gameState.players.find(p => p.id === intent.id);
            if (!player || this._isOnCooldown(player.id)) return;

            // AI'ın hedefine olan hareket vektörünü hesapla
            const pPos = new Vector2D(player.x, player.y);
            const targetPos = new Vector2D(intent.targetX, intent.targetY);
            
            if (pPos.distance(targetPos) > 10) {
                player.moveIntent = targetPos.sub(pPos).normalize();
            } else {
                player.moveIntent = new Vector2D(0, 0); // Hedefe vardıysa dur
            }

            // AI'ın taban hızı (Gerektiğinde depar atar, normalde düz koşar)
            // Eğer topa çok yakınsa veya hücuma çıkıyorsa sprint atar.
            player.targetMaxSpeed = calculateMaxSpeed(player.stats, GAME_CONFIG.player.baseSpeed * 1.2);

            // AI Aksiyonları
            const hasBall = gameState.playerWithBallId === player.id;

            if (intent.action === "PASS" && hasBall) {
                const targetPlayer = gameState.players.find(p => p.id === intent.actionTargetId);
                if (targetPlayer) {
                    this.executePassToTarget(player, targetPlayer.x, targetPlayer.y, gameState);
                }
            } else if (intent.action === "SHOT" && hasBall) {
                this.executeShot(player, gameState);
            } else if (intent.action === "TACKLE" && !hasBall) {
                this.executeTackle(player, gameState);
            }
        });
    }

    // ========================================================================
    // 3. EYLEM YÜRÜTME FONKSİYONLARI (ZAR + FİZİK)
    // ========================================================================

    /**
     * İnsan oyuncu için yön tuşlarına (veya baktığı yöne) doğru bir pas atar.
     */
    executePass(passer, gameState) {
        // İnsan oyuncu bir yön seçmişse o yöne, seçmemişse baktığı yöne (hız vektörü) pas atar
        let passDir = passer.moveIntent.mag() > 0 ? passer.moveIntent : new Vector2D(passer.vx, passer.vy).normalize();
        
        // Eğer oyuncu tamamen duruyorsa ileri doğru atsın
        if (passDir.mag() === 0) passDir = new Vector2D(passer.teamId === 'gs' ? 1 : -1, 0);

        // Pasın düşeceği tahmini hedef koordinat (Şimdilik sabit 200px ileri)
        // Gelişmiş bir sistemde bu, analog stick'in basılı tutulma süresine (güç barı) göre ayarlanabilir.
        const targetX = passer.x + (passDir.x * 250);
        const targetY = passer.y + (passDir.y * 250);
        
        this.executePassToTarget(passer, targetX, targetY, gameState);
    }

    /**
     * Hem AI hem de İnsan için ortak pas yürütme (Zar ve Fizik çözünürlüğü).
     */
    executePassToTarget(passer, targetX, targetY, gameState) {
        const ball = gameState.ball;
        const distance = new Vector2D(passer.x, passer.y).distance(new Vector2D(targetX, targetY));
        
        // Etraftaki rakip baskısını hesapla (Pas zorluğunu artırır)
        const enemiesNearby = gameState.players.filter(p => p.teamId !== passer.teamId && new Vector2D(p.x, p.y).distance(new Vector2D(passer.x, passer.y)) < 80).length;

        // 1. RPG MOTORUNDAN ZAR AT (Kader anı)
        const passResult = resolvePass(passer.stats, distance, enemiesNearby);

        // 2. FİZİĞİ UYGULA
        // Topu oyuncudan kopar
        gameState.playerWithBallId = null;
        
        let targetVec = new Vector2D(targetX - passer.x, targetY - passer.y).normalize();
        
        // Baz pas hızı
        let ballSpeed = 8 + (passResult.quality * 0.05); 

        if (passResult.isFumble) {
            // KRİTİK HATA (Nat 1): Top inanılmaz alakasız bir yere gider
            const randomAngle = (Math.random() * Math.PI) - (Math.PI / 2); // 90 dereceye kadar sapma
            const cos = Math.cos(randomAngle);
            const sin = Math.sin(randomAngle);
            targetVec = new Vector2D(
                targetVec.x * cos - targetVec.y * sin,
                targetVec.x * sin + targetVec.y * cos
            );
            ballSpeed = 5; // Cılız bir vuruş
            ball.vz = 0; // Yerden
        } else if (!passResult.success) {
            // BAŞARISIZ PAS: Hedef %10-20 arası şaşar
            const errorMargin = (Math.random() - 0.5) * 0.5; // -0.25 to 0.25 radian sapma
            const cos = Math.cos(errorMargin);
            const sin = Math.sin(errorMargin);
            targetVec = new Vector2D(
                targetVec.x * cos - targetVec.y * sin,
                targetVec.x * sin + targetVec.y * cos
            );
            ballSpeed *= 0.8; // Hızı biraz düşer
        } else if (passResult.quality === 100) {
            // KRİTİK BAŞARI (Nat 20): Mermi gibi adrese teslim
            ballSpeed *= 1.3;
        }

        // Uzun pas ise (mesafe > 300) topu havalandır (Z ekseni vektörü)
        if (distance > 300 && passResult.success) {
            ball.vz = 5 + (distance * 0.01); // Mesafe arttıkça top daha çok yükselir
            ballSpeed *= 0.9; // Havadan giden topun yatay hızı hafif düşer
        }

        // Topun yeni vektörünü ayarla
        ball.vx = targetVec.x * ballSpeed;
        ball.vy = targetVec.y * ballSpeed;
        
        // Pas atan oyuncuya kısa bir cooldown ver ki hemen gidip topu geri almasın (animasyon süresi)
        this._setCooldown(passer.id, 15);
    }

    /**
     * ŞUT ÇEKME EYLEMİ (Kaleciyle Düello)
     */
    executeShot(shooter, gameState) {
        const ball = gameState.ball;
        
        // Hedef kaleyi bul
        const isGs = shooter.teamId === 'gs';
        const targetGoalX = isGs ? GAME_CONFIG.pitch.width : 0;
        const targetGoalY = GAME_CONFIG.pitch.height / 2;

        const distanceToGoal = new Vector2D(shooter.x, shooter.y).distance(new Vector2D(targetGoalX, targetGoalY));

        // Rakip kaleciyi bul
        const enemyGK = gameState.players.find(p => p.teamId !== shooter.teamId && p.role === 'GK');

        // 1. RPG MOTORUNDAN DÜELLO ZARI AT (Şutör vs Kaleci)
        const shotResult = resolveShot(shooter.stats, enemyGK.stats, distanceToGoal);

        // 2. FİZİĞİ UYGULA
        gameState.playerWithBallId = null; // Top ayaktan çıktı
        this._setCooldown(shooter.id, 20); // Şut sonrası toparlanma süresi

        // Şutun taban gücü (Hız)
        let shotPower = 15 + (shooter.stats.sut * 1.5);
        
        let finalTargetX = targetGoalX;
        let finalTargetY = targetGoalY;
        let zForce = 0; // Topun yüksekliği

        if (shotResult.missedCompletely) {
            // Kötü vuruş (Auta veya Taça gidiyor)
            // Kalenin Y ekseninden çok uzağa sapma ekle
            const missOffset = (Math.random() > 0.5 ? 1 : -1) * (GAME_CONFIG.pitch.goalHeight + 50 + Math.random() * 100);
            finalTargetY += missOffset;
            zForce = Math.random() * 20; // Dağlara taşlara gidebilir
        } 
        else if (shotResult.isGoal) {
            // Muazzam isabet (Köşeleri hedefler)
            // Y ekseninde direk diplerine yakın bir hedef seç
            const cornerTarget = (GAME_CONFIG.pitch.goalHeight / 2) - 5;
            finalTargetY += (Math.random() > 0.5 ? cornerTarget : -cornerTarget);
            
            // Eğer Nat 20 ise 90'a (Çatala) gider, Z eksenini ayarla
            if (shotResult.rebound === false) { 
                zForce = 15; // 90 yüksekliği (Yaklaşık direk altı)
                shotPower *= 1.3; // Durdurulamaz hız
            }
        } 
        else if (shotResult.isSaved) {
            // Kurtarış. Top kalecinin üstüne veya yakınına gider.
            finalTargetY = enemyGK.y;
            finalTargetX = enemyGK.x;
            
            if (shotResult.rebound) {
                // Seken top (Kaleci tutamaz, fizik motoru sekme işleyecek)
                shotPower *= 0.8;
                zForce = 10; 
                // Kaleci topu çeldi, kaleciye kısa bir cooldown (yerde yatma)
                this._setCooldown(enemyGK.id, 45); 
            } else {
                // Kaleci yapıştırdı (Top kalecinin göğsünde kalacak şekilde yavaşlar)
                shotPower = new Vector2D(shooter.x, shooter.y).distance(new Vector2D(enemyGK.x, enemyGK.y)) * 0.02; 
            }
        }

        // Hesaplanan hedefe doğru vektörü oluştur ve topa uygula
        const shotDir = new Vector2D(finalTargetX - shooter.x, finalTargetY - shooter.y).normalize();
        ball.vx = shotDir.x * shotPower;
        ball.vy = shotDir.y * shotPower;
        ball.vz = zForce;
    }

    /**
     * KAYARAK MÜDAHALE (Tackle) 
     */
    executeTackle(tackler, gameState) {
        // Kayma eylemi başlar, oyuncuya sert bir ivme (lunge) verilir.
        const lungeSpeed = GAME_CONFIG.player.maxSpeed * 1.5;
        
        // Hız vektörü yoksa, baktığı yöne veya rakibe doğru kaysın
        let tackleDir = tackler.moveIntent;
        if (tackleDir.mag() === 0) tackleDir = new Vector2D(tackler.teamId === 'gs' ? 1 : -1, 0);
        
        tackler.vx = tackleDir.x * lungeSpeed;
        tackler.vy = tackleDir.y * lungeSpeed;
        
        // Oyuncu kayarken belli bir süre kontrol edilemez (Yerden kalkma animasyonu süresi)
        this._setCooldown(tackler.id, 50);

        // Topu süren bir rakip var mı kontrol et
        const ballCarrierId = gameState.playerWithBallId;
        if (!ballCarrierId) return; // Top kimsede değilse sadece çimlerde kaydı

        const carrier = gameState.players.find(p => p.id === ballCarrierId);
        if (!carrier || carrier.teamId === tackler.teamId) return;

        // Çarpışma mesafesinde miyiz?
        const distance = new Vector2D(tackler.x, tackler.y).distance(new Vector2D(carrier.x, carrier.y));
        const collisionRadius = GAME_CONFIG.player.radius * 3; // Kayma menzili biraz uzundur

        if (distance < collisionRadius) {
            // 1. RPG MOTORUNDAN MÜDAHALE ZARI AT
            const tackleResult = resolveTackle(tackler.stats, carrier.stats);

            if (tackleResult.foul) {
                // KRİTİK HATA (Nat 1): Sert Faul
                gameState.playerWithBallId = null;
                gameState.ball.vx = 0;
                gameState.ball.vy = 0;
                
                // Oyuncuları durdur
                carrier.vx = 0; carrier.vy = 0;
                this._setCooldown(carrier.id, 90); // Faul yapılan oyuncu yerde kıvranır
                
                // TODO: Main loop'a faul event'i gönderilebilir
            } 
            else if (tackleResult.tackleSuccess) {
                // BAŞARILI TOP ÇALMA
                gameState.playerWithBallId = null;
                
                // Top boşta kalır ve müdahale yönüne doğru hafifçe seker
                gameState.ball.vx = tackleDir.x * 4;
                gameState.ball.vy = tackleDir.y * 4;
                
                // Topu kaptıran kısa bir süre afallar
                this._setCooldown(carrier.id, 30);
            }
            else {
                // BAŞARISIZ (Çalım Yedi)
                // Hücumcu sıyrılır, savunmacı yerde kalmaya devam eder (zaten cooldown'da)
            }
        }
    }

    // ========================================================================
    // 4. YARDIMCI FONKSİYONLAR (Cooldown / State Management)
    // ========================================================================

    /**
     * Oyuncuya belirtilen frame (kare) sayısı kadar bekleme süresi atar.
     */
    _setCooldown(playerId, frames) {
        this.cooldowns.set(playerId, frames);
    }

    /**
     * Oyuncunun eylem yapamayacak durumda (animasyonda/yerde) olup olmadığını kontrol eder.
     */
    _isOnCooldown(playerId) {
        return (this.cooldowns.get(playerId) || 0) > 0;
    }

    /**
     * Her oyun döngüsünde (frame) çağrılır ve tüm cooldown sürelerini 1 azaltır.
     */
    updateCooldowns() {
        for (let [playerId, frames] of this.cooldowns.entries()) {
            if (frames > 0) {
                this.cooldowns.set(playerId, frames - 1);
            } else {
                this.cooldowns.delete(playerId);
            }
        }
    }
}

// Singleton olarak dışa aktar
export const actionHandler = new ActionHandler();