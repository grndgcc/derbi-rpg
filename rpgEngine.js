/**
 * ============================================================================
 * DERBİ RPG - ZAR VE KURAL MOTORU (rpgEngine.js)
 * ============================================================================
 * Bu modül, oyun içindeki tüm "acaba başarılı olacak mı?" sorularının 
 * Mörk Borg d20 sistemi ile çözüldüğü yerdir. 
 * CPU üzerinde çalışır, fizik motoru ve kullanıcı girdileri tarafından çağrılır.
 */

import { D20_RULES } from './data.js';

// ============================================================================
// 1. TEMEL ZAR MEKANİKLERİ
// ============================================================================

/**
 * Temel 20'lik zar (d20) atışını gerçekleştirir.
 * @returns {number} 1 ile 20 arasında tam sayı.
 */
function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

/**
 * Arayüze (UI) bilgi göndermek için Özel Olay (Custom Event) fırlatır.
 * Oyuncu zarları görmese de, sistem "Kritik Kurtarış", "Kötü Pas" gibi metinleri
 * bu event üzerinden index.html'deki #action-log alanına iletir.
 * 
 * @param {string} actionName - Eylemin adı (Örn: "ŞUT", "PAS")
 * @param {string} resultText - Sonuç metni (Örn: "Mükemmel İsabet!")
 * @param {boolean} isCritical - Özel bir renk/efekt için kritik mi?
 */
function dispatchRPGLog(actionName, resultText, isCritical = false) {
    const event = new CustomEvent('rpgLog', {
        detail: { actionName, resultText, isCritical }
    });
    window.dispatchEvent(event);
}

// ============================================================================
// 2. EYLEM (ZAR) ÇÖZÜMLEME FONKSİYONLARI
// ============================================================================

/**
 * Bir oyuncunun pas atma eylemini zarlarla hesaplar.
 * Hedef mesafesi arttıkça veya araya giren rakip oldukça DC (Zorluk) dinamikleşir.
 * 
 * @param {Object} passerStats - Pası atan oyuncunun stat objesi (pas: +2 vb.)
 * @param {number} distance - Pasın gideceği piksel cinsinden mesafe
 * @param {number} enemyPressure - Pası atan oyuncunun çevresindeki rakip sayısı/baskısı (0-3)
 * @returns {Object} { success: boolean, quality: number (1-100), isFumble: boolean }
 */
export function resolvePass(passerStats, distance, enemyPressure = 0) {
    const rawRoll = rollD20();
    const modifier = passerStats.pas; // Mörk Borg statı (-3 to +3)
    const total = rawRoll + modifier;

    // Uzunluğa göre dinamik zorluk belirleme (Kısa pas DC 10, Uzun pas DC 15 bazlı)
    const isLongPass = distance > 300; 
    let currentDC = isLongPass ? D20_RULES.actions.longPass.dc : D20_RULES.actions.shortPass.dc;
    
    // Rakip baskısı zorluğu artırır (+1 DC her rakip için)
    currentDC += enemyPressure;

    // Kritik Hata (Fumble) - Zar 1 gelirse
    if (rawRoll === D20_RULES.critical.fail) {
        dispatchRPGLog("PAS", "Felaket! Top taca veya doğrudan rakibe gitti.", true);
        return { success: false, quality: 0, isFumble: true };
    }

    // Kritik Başarı - Zar 20 gelirse
    if (rawRoll === D20_RULES.critical.success) {
        dispatchRPGLog("PAS", "Adrese teslim, kusursuz pas!", true);
        return { success: true, quality: 100, isFumble: false };
    }

    // Normal Çözümleme
    const isSuccess = total >= currentDC;
    
    if (isSuccess) {
        // Kalite: Zarın zorluğu ne kadar geçtiğine göre belirlenir. Topun hızını/isabetini etkiler.
        const margin = total - currentDC; 
        const quality = Math.min(100, 50 + (margin * 10)); 
        return { success: true, quality, isFumble: false };
    } else {
        // Başarısız pas ama tamamen felaket değil, hedef şaşacak (Physics engine bunu kaydıracak)
        return { success: false, quality: Math.max(10, total * 3), isFumble: false };
    }
}

/**
 * FUTBOLUN ZİRVESİ: ŞUT VE KALECİ DÜELLOSU
 * Mörk Borg sistemine uygun bir Karşılıklı Zar (Contested Roll) atılır.
 * Şutör (d20 + şut) VS Kaleci (d20 + kurtarma).
 * 
 * @param {Object} shooterStats - Şut çeken oyuncunun statları (sut: +3 vb.)
 * @param {Object} gkStats - Kalecinin statları (kurtarma: +2 vb.)
 * @param {number} distance - Kaleye olan uzaklık
 * @returns {Object} { isGoal: boolean, isSaved: boolean, rebound: boolean }
 */
export function resolveShot(shooterStats, gkStats, distance) {
    const shotRoll = rollD20();
    const gkRoll = rollD20();

    const shotTotal = shotRoll + shooterStats.sut;
    const gkTotal = gkRoll + gkStats.kurtarma;

    // Uzaktan çekilen şutlar kaleciye avantaj sağlar (+ stat bonusu gibi)
    const distanceGKBonus = distance > 400 ? 2 : 0;
    const finalGkTotal = gkTotal + distanceGKBonus;

    // 1. ŞUTÖR KRİTİK HATA (Dağlara Taşlara)
    if (shotRoll === D20_RULES.critical.fail) {
        dispatchRPGLog("ŞUT", "İnanılmaz kötü bir vuruş! Top kornere bile gitmedi.", true);
        return { isGoal: false, isSaved: false, rebound: false, missedCompletely: true };
    }

    // 2. ŞUTÖR KRİTİK BAŞARI (90'a giden durdurulamaz şut)
    // Kaleci de 20 atmadıysa kesin goldür.
    if (shotRoll === D20_RULES.critical.success) {
        if (gkRoll === D20_RULES.critical.success) {
            dispatchRPGLog("DÜELLO", "Epik Şut, Destansı Kurtarış! Korner!", true);
            return { isGoal: false, isSaved: true, rebound: true, missedCompletely: false };
        }
        dispatchRPGLog("ŞUT", "Mükemmel! Örümcek ağlarını aldı!", true);
        return { isGoal: true, isSaved: false, rebound: false, missedCompletely: false };
    }

    // 3. KALECİ KRİTİK BAŞARI
    if (gkRoll === D20_RULES.critical.success) {
        dispatchRPGLog("KALECİ", "İnanılmaz refleks! Topu tuttu.", true);
        return { isGoal: false, isSaved: true, rebound: false, missedCompletely: false };
    }

    // 4. NORMAL KARŞILIKLI ZAR KIYASLAMASI (Contested Check)
    if (shotTotal > finalGkTotal) {
        // Şut kalecinin zarını aştı!
        // Ancak topun dışarı gitme ihtimalini kontrol etmek için Temel DC'ye (16) de bakmalıyız.
        if (shotTotal >= D20_RULES.actions.shot.dc) {
            dispatchRPGLog("ŞUT", "GOOOOL! Kaleci çaresiz.", false);
            return { isGoal: true, isSaved: false, rebound: false, missedCompletely: false };
        } else {
            dispatchRPGLog("ŞUT", "Sert vuruş ama top az farkla dışarıda.", false);
            return { isGoal: false, isSaved: false, rebound: false, missedCompletely: true };
        }
    } else {
        // Kaleci zarı şutu geçti!
        const difference = finalGkTotal - shotTotal;
        if (difference >= 5) {
            // Fark 5 veya fazlaysa topu yapışkan gibi tutar.
            dispatchRPGLog("KURTARIŞ", "Kaleci rahatça kontrol etti.", false);
            return { isGoal: false, isSaved: true, rebound: false, missedCompletely: false };
        } else {
            // Ucu ucuna kurtardı, top seker (Fizik motoru topu sahaya geri sektirecek)
            dispatchRPGLog("KURTARIŞ", "Kaleci son anda çeldi! Top oyunda!", false);
            return { isGoal: false, isSaved: true, rebound: true, missedCompletely: false };
        }
    }
}

/**
 * İKİLİ MÜCADELE VE KAYARAK MÜDAHALE (Tackle vs Dribbling)
 * Savunmacının kayma (Tackle) yeteneği ile Hücumcunun top sürme (Dribble) zarı çarpışır.
 * 
 * @param {Object} tacklerStats - Savunma oyuncusu
 * @param {Object} dribblerStats - Topu süren oyuncu
 * @returns {Object} { tackleSuccess: boolean, foul: boolean }
 */
export function resolveTackle(tacklerStats, dribblerStats) {
    const tackleRoll = rollD20();
    const dribbleRoll = rollD20();

    const tackleTotal = tackleRoll + tacklerStats.kayma;
    const dribbleTotal = dribbleRoll + dribblerStats.topSurme;

    // Savunma 1 atarsa sert bir faul yapar!
    if (tackleRoll === D20_RULES.critical.fail) {
        dispatchRPGLog("MÜDAHALE", "Çok sert ve kontrolsüz bir kayış! FAUL!", true);
        return { tackleSuccess: false, foul: true };
    }

    if (tackleTotal > dribbleTotal) {
        dispatchRPGLog("MÜDAHALE", "Tertemiz top çalma!", false);
        return { tackleSuccess: true, foul: false };
    } else {
        dispatchRPGLog("ÇALIM", "Hücumcu zekice sıyrıldı!", false);
        return { tackleSuccess: false, foul: false };
    }
}

/**
 * BOŞTAKİ TOPA KOŞU YARIŞI (Pace Duel)
 * İki oyuncu boşta kalan bir topa koşarken hız ve hızlanma statları kullanılarak 
 * kimin topa daha çabuk ulaşacağına dair bir inisiyatif zarı atılır.
 * Bu fonksiyon özellikle AI'nin (Yapay Zekanın) karar mekanizmasında kullanılacaktır.
 * 
 * @param {Object} player1Stats - 1. Oyuncu
 * @param {Object} player2Stats - 2. Oyuncu
 * @returns {number} 1 (Player 1 kazanır), 2 (Player 2 kazanır), 0 (Berabere - Fizik motoruna bırakılır)
 */
export function resolvePaceDuel(player1Stats, player2Stats) {
    const p1Roll = rollD20() + player1Stats.hiz + player1Stats.hizlanma;
    const p2Roll = rollD20() + player2Stats.hiz + player2Stats.hizlanma;

    if (p1Roll > p2Roll + 2) return 1;
    if (p2Roll > p1Roll + 2) return 2;
    return 0; // Kafa kafaya durum
}

// ============================================================================
// 3. PASİF STAT HESAPLAMALARI (Fizik Motoru İçin)
// ============================================================================

/**
 * Oyuncunun oyun içindeki anlık maksimum hız vektörünü Mörk Borg statlarına 
 * göre hesaplar. Sadece zar atmak için değil, fiziksel hareket sınırları için.
 * @param {Object} stats - Oyuncu statları
 * @param {number} baseSpeed - GAME_CONFIG içindeki taban hız
 * @returns {number} Pixel/Frame cinsinden maksimum hareket hızı
 */
export function calculateMaxSpeed(stats, baseSpeed) {
    // Hiz statı (-3 to +3). Her +1 stat taban hıza %10 bonus sağlar.
    const multiplier = 1 + (stats.hiz * 0.1); 
    return baseSpeed * multiplier;
}

/**
 * Oyuncunun topu ne kadar uzağından sektirmeden sürebileceğini hesaplar.
 * @param {Object} stats - Oyuncu statları
 * @returns {number} Top sürme mesafesi (Pixel) - düşük stat topun ayaktan açılmasına sebep olur.
 */
export function calculateDribbleControlDistance(stats) {
    // -3 statlı bir oyuncu topu sürerken kendinden 30 piksel açar, +3 statlı oyuncu 12 piksel açar (ayağına yapışır).
    const baseDistance = 21;
    return Math.max(10, baseDistance - (stats.topSurme * 3));
}