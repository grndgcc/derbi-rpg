/**
 * ============================================================================
 * DERBİ RPG - VERİ VE KONFİGÜRASYON MERKEZİ (data.js)
 * ============================================================================
 * Bu dosya oyunun temel iskeletini barındırır. Mörk Borg zar mekanikleri,
 * saha geometrisi, fizik motoru parametreleri, yapay zeka formasyon ağları 
 * ve takımların detaylı stat sheet'leri burada tanımlanır.
 * Mörk Borg sistemine göre statlar -3 (Zayıf/Kötü) ile +3 (Efsanevi) arasındadır.
 */

// ============================================================================
// 1. OYUN, FİZİK VE SAHA KONFİGÜRASYONU
// ============================================================================

export const GAME_CONFIG = {
    // Canvas'ın mantıksal (iç) çözünürlüğü. Render edilirken CSS ile ekrana sığdırılır.
    pitch: {
        width: 1200,      // Sahanın yatay uzunluğu (X ekseni)
        height: 800,      // Sahanın dikey uzunluğu (Y ekseni)
        margin: 50,       // Taç ve aut çizgileri dışındaki yeşil alan boşluğu
        centerCircleRadius: 80,
        penaltyBoxWidth: 165,
        penaltyBoxHeight: 320,
        goalBoxWidth: 55,
        goalBoxHeight: 140,
        goalWidth: 20,    // Kalenin X eksenindeki derinliği
        goalHeight: 100   // Kalenin Y eksenindeki açıklığı
    },
    // Topun fiziksel ağırlığı ve sürtünme katsayıları
    ball: {
        radius: 6,
        mass: 1,          // Çarpışma hesaplamalarında (physics.js) kullanılacak kütle
        friction: 0.985,  // Topun çimdeki yavaşlama oranı (1 = hiç yavaşlamaz, 0 = anında durur)
        bounce: 0.7       // Direklere çarptığında geri sekme katsayısı
    },
    // Oyuncuların fiziksel özellikleri
    player: {
        radius: 12,       // Oyuncuların kapladığı dairesel alan
        mass: 10,         // Oyuncu kütlesi (İkili mücadelelerde çarpışma için)
        baseSpeed: 2.5,   // Oyuncuların Mörk Borg statlarından bağımsız taban hızı
        maxSpeed: 5.5     // Bir oyuncunun ulaşabileceği maksimum terminal hız vektörü
    }
};

// ============================================================================
// 2. MÖRK BORG D20 SİSTEMİ ZORLUK DERECELERİ (DIFFICULTY CLASSES - DC)
// ============================================================================
// Bir oyuncu eylem yaptığında arkada d20 (1-20 arası zar) atılır.
// Atılan Zar + Oyuncu Statı >= Hedef DC ise eylem başarılı olur.

export const D20_RULES = {
    actions: {
        shortPass: { dc: 10, statUsed: 'pas' },        // Kısa pas için 10'u geçmek gerekir.
        longPass:  { dc: 15, statUsed: 'pas' },        // Uzun pas risklidir.
        dribbling: { dc: 12, statUsed: 'topSurme' },   // Rakip varken topu ayağından açmadan sürmek.
        tackle:    { dc: 14, statUsed: 'kayma' },      // Topu çalma zorluğu. (Rakibin topSürme zarına karşı contested/karşılıklı zar da atılabilir).
        shot:      { dc: 16, statUsed: 'sut' }         // Uzaktan şut atmanın temel zorluğu. Kaleci ayrı bir zar atıp bunu iptal edebilir.
    },
    // Yapay Zekanın yorgunluk ve moral durumlarında kullanabileceği zarlar (Opsiyonel derinlik)
    critical: {
        success: 20, // Zar tam 20 gelirse statlara bakılmaksızın kusursuz, engellenemez hareket (Örn: Çatal giden şut).
        fail: 1      // Zar 1 gelirse statlara bakılmaksızın epik başarısızlık (Örn: Boş kaleye kaçırma).
    }
};

// ============================================================================
// 3. YAPAY ZEKA (AI) FORMASYON VE POZİSYON MATRİSİ
// ============================================================================
// Web Worker (Çoklu CPU) bu koordinatları kullanarak oynamadığın karakterlerin
// sahada nerede durması gerektiğini hesaplayacak. Koordinatlar 0.0 ile 1.0 arası 
// sahanın yüzdelik oranlarıdır. [X ekseni (0 sol, 1 sağ), Y ekseni (0 üst, 1 alt)]

export const FORMATIONS = {
    "4-2-3-1": {
        // HÜCUM DURUMU (Takım topa sahipken pas isteme yerleşimi)
        attack: {
            GK:  [0.05, 0.50],  // Kaleci ceza sahası dışına çok az çıkar
            LB:  [0.40, 0.15],  // Sol bek hücuma genişlik katar
            LCB: [0.30, 0.35],  // Sol stoper
            RCB: [0.30, 0.65],  // Sağ stoper
            RB:  [0.40, 0.85],  // Sağ bek hücuma genişlik katar
            LDM: [0.50, 0.35],  // Defansif orta saha (Oyun kurucu)
            RDM: [0.50, 0.65],  // Defansif orta saha (Kesici)
            LW:  [0.85, 0.15],  // Sol açık içe kat etmek için bekler
            CAM: [0.75, 0.50],  // 10 Numara ceza yayı civarında
            RW:  [0.85, 0.85],  // Sağ açık
            ST:  [0.90, 0.50]   // Santrafor stoperlerin arasında
        },
        // SAVUNMA DURUMU (Rakip topa sahipken "Zonal Marking / Alan Savunması" yerleşimi)
        defense: {
            GK:  [0.02, 0.50],
            LB:  [0.15, 0.20],
            LCB: [0.12, 0.40],
            RCB: [0.12, 0.60],
            RB:  [0.15, 0.80],
            LDM: [0.25, 0.35],
            RDM: [0.25, 0.65],
            LW:  [0.35, 0.20],
            CAM: [0.40, 0.50],
            RW:  [0.35, 0.80],
            ST:  [0.55, 0.50]   // Santrafor orta sahada pres bekler
        }
    }
};

// ============================================================================
// 4. TAKIM VE OYUNCU STATLARI (MÖRK BORG SİSTEMİ)
// ============================================================================
// Stat Açıklamaları:
// - pas (Pass): Oyun kurma, topu hedefe ulaştırma zar modifier'ı.
// - topSurme (Dribble): Top ayağındayken manevra yapma, hız kaybetmeme.
// - hiz (Pace): Düz yolda oyuncunun çıkabileceği maksimum hızı etkiler.
// - hizlanma (Acceleration): Durur halden depar atarken ilk saniyedeki ivme.
// - sut (Shot): Kaleye giden topun isabeti ve hızını belirler.
// - kayma (Tackle): Top çalma zarı. Defansif başarı şansı.
// - markaj (Marking): AI tarafından oynanırken adam takip etme yetisi.
// - guc (Strength): Omuz omuza mücadelede topu kimin kazanacağını belirler.
// - kurtarma (Reflex): Sadece kaleciler için geçerli d20 şut çıkarma yeteneği.

export const TEAMS = {
    galatasaray: {
        id: "gs",
        name: "Galatasaray",
        colors: { primary: "#A32638", secondary: "#FDB913", text: "#FFFFFF" },
        formation: "4-2-3-1",
        squad: [
            { 
                id: "gs_1", name: "Muslera", number: 1, role: "GK", isGK: true, 
                stats: { pas: 0, topSurme: -2, hiz: -1, hizlanma: -1, sut: -3, kayma: 0, markaj: 0, guc: +1, kurtarma: +3 }
            },
            { 
                id: "gs_2", name: "Jakobs", number: 4, role: "LB", isGK: false, 
                stats: { pas: +1, topSurme: +1, hiz: +2, hizlanma: +2, sut: -1, kayma: +1, markaj: +1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "gs_3", name: "Abdülkerim", number: 42, role: "LCB", isGK: false, 
                stats: { pas: +2, topSurme: 0, hiz: 0, hizlanma: -1, sut: +1, kayma: +2, markaj: +2, guc: +3, kurtarma: -3 }
            },
            { 
                id: "gs_4", name: "D. Sanchez", number: 6, role: "RCB", isGK: false, 
                stats: { pas: +1, topSurme: 0, hiz: +2, hizlanma: +1, sut: -1, kayma: +3, markaj: +2, guc: +3, kurtarma: -3 }
            },
            { 
                id: "gs_5", name: "Kaan Ayhan", number: 23, role: "RB", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: 0, hizlanma: 0, sut: 0, kayma: +2, markaj: +2, guc: +2, kurtarma: -3 }
            },
            { 
                id: "gs_6", name: "Torreira", number: 34, role: "LDM", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: +1, hizlanma: +2, sut: +1, kayma: +3, markaj: +3, guc: +2, kurtarma: -3 }
            },
            { 
                id: "gs_7", name: "G. Sara", number: 20, role: "RDM", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: 0, hizlanma: +1, sut: +2, kayma: +1, markaj: +1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "gs_8", name: "Barış Alper", number: 53, role: "LW", isGK: false, 
                stats: { pas: +1, topSurme: +2, hiz: +3, hizlanma: +3, sut: +2, kayma: +1, markaj: +1, guc: +3, kurtarma: -3 }
            },
            { 
                id: "gs_9", name: "Mertens", number: 10, role: "CAM", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: 0, hizlanma: +1, sut: +2, kayma: -1, markaj: -1, guc: -1, kurtarma: -3 }
            },
            { 
                id: "gs_10", name: "Ziyech", number: 22, role: "RW", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: 0, hizlanma: 0, sut: +3, kayma: -2, markaj: -1, guc: 0, kurtarma: -3 }
            },
            { 
                id: "gs_11", name: "M. Icardi", number: 9, role: "ST", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: +1, hizlanma: +1, sut: +3, kayma: -2, markaj: 0, guc: +2, kurtarma: -3 }
            }
        ]
    },

    fenerbahce: {
        id: "fb",
        name: "Fenerbahçe",
        colors: { primary: "#001E61", secondary: "#FFED00", text: "#FFFFFF" },
        formation: "4-2-3-1",
        squad: [
            { 
                id: "fb_1", name: "Livakovic", number: 40, role: "GK", isGK: true, 
                stats: { pas: +1, topSurme: -2, hiz: -1, hizlanma: -1, sut: -3, kayma: 0, markaj: 0, guc: +1, kurtarma: +3 }
            },
            { 
                id: "fb_2", name: "Oosterwolde", number: 24, role: "LB", isGK: false, 
                stats: { pas: +1, topSurme: +1, hiz: +3, hizlanma: +3, sut: -1, kayma: +2, markaj: +1, guc: +3, kurtarma: -3 }
            },
            { 
                id: "fb_3", name: "Djiku", number: 6, role: "LCB", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: +1, hizlanma: +1, sut: 0, kayma: +3, markaj: +2, guc: +2, kurtarma: -3 }
            },
            { 
                id: "fb_4", name: "Çağlar S.", number: 4, role: "RCB", isGK: false, 
                stats: { pas: +1, topSurme: 0, hiz: +1, hizlanma: +1, sut: 0, kayma: +2, markaj: +2, guc: +3, kurtarma: -3 }
            },
            { 
                id: "fb_5", name: "Osayi-Samuel", number: 21, role: "RB", isGK: false, 
                stats: { pas: +1, topSurme: +2, hiz: +3, hizlanma: +3, sut: +1, kayma: +2, markaj: +1, guc: +2, kurtarma: -3 }
            },
            { 
                id: "fb_6", name: "İsmail", number: 5, role: "LDM", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: +1, hizlanma: +1, sut: 0, kayma: +3, markaj: +3, guc: +2, kurtarma: -3 }
            },
            { 
                id: "fb_7", name: "Fred", number: 35, role: "RDM", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: +2, hizlanma: +2, sut: +2, kayma: +2, markaj: +2, guc: +1, kurtarma: -3 }
            },
            { 
                id: "fb_8", name: "Maximin", number: 97, role: "LW", isGK: false, 
                stats: { pas: +1, topSurme: +3, hiz: +3, hizlanma: +3, sut: +2, kayma: -1, markaj: -1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "fb_9", name: "Szymanski", number: 53, role: "CAM", isGK: false, 
                stats: { pas: +2, topSurme: +2, hiz: +2, hizlanma: +2, sut: +2, kayma: +1, markaj: +2, guc: 0, kurtarma: -3 }
            },
            { 
                id: "fb_10", name: "Tadic", number: 10, role: "RW", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: -1, hizlanma: -1, sut: +2, kayma: +1, markaj: +1, guc: +2, kurtarma: -3 }
            },
            { 
                id: "fb_11", name: "Dzeko", number: 9, role: "ST", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: -1, hizlanma: 0, sut: +3, kayma: 0, markaj: 0, guc: +3, kurtarma: -3 }
            }
        ]
    }
};

// ============================================================================
// YARDIMCI FONKSİYONLAR (Veriye dışarıdan kolay erişim için)
// ============================================================================

/**
 * ID'si verilen takımın tüm verilerini döner.
 * @param {string} teamId - "gs" veya "fb"
 * @returns {Object} Takım objesi
 */
export function getTeam(teamId) {
    if (teamId === "gs") return TEAMS.galatasaray;
    if (teamId === "fb") return TEAMS.fenerbahce;
    return null;
}

/**
 * Belirli bir oyuncunun tüm istatistiklerini getirir.
 * Menüde oyuncu seçimi yapılırken veya Worker'a veri yollanırken kullanılır.
 * @param {string} playerId - Örn: "gs_11"
 * @returns {Object} Oyuncu objesi
 */
export function getPlayerById(playerId) {
    const gsPlayer = TEAMS.galatasaray.squad.find(p => p.id === playerId);
    if (gsPlayer) return { ...gsPlayer, teamId: "gs" };

    const fbPlayer = TEAMS.fenerbahce.squad.find(p => p.id === playerId);
    if (fbPlayer) return { ...fbPlayer, teamId: "fb" };

    return null;
}