/**
 * ============================================================================
 * DERBİ RPG - VERİ VE KONFİGÜRASYON MERKEZİ (data.js)
 * EFSANELER SÜRÜMÜ (DREAM TEAM)
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
    pitch: {
        width: 1200,      
        height: 800,      
        margin: 50,       
        centerCircleRadius: 80,
        penaltyBoxWidth: 165,
        penaltyBoxHeight: 320,
        goalBoxWidth: 55,
        goalBoxHeight: 140,
        goalWidth: 20,    
        goalHeight: 100   
    },
    ball: {
        radius: 6,
        mass: 1,          
        friction: 0.985,  
        bounce: 0.7       
    },
    player: {
        radius: 12,       
        mass: 10,         
        baseSpeed: 2.5,   
        maxSpeed: 5.5     
    }
};

// ============================================================================
// 2. MÖRK BORG D20 SİSTEMİ ZORLUK DERECELERİ (DIFFICULTY CLASSES - DC)
// ============================================================================

export const D20_RULES = {
    actions: {
        shortPass: { dc: 10, statUsed: 'pas' },        
        longPass:  { dc: 15, statUsed: 'pas' },        
        dribbling: { dc: 12, statUsed: 'topSurme' },   
        tackle:    { dc: 14, statUsed: 'kayma' },      
        shot:      { dc: 16, statUsed: 'sut' }         
    },
    critical: {
        success: 20, 
        fail: 1      
    }
};

// ============================================================================
// 3. YAPAY ZEKA (AI) FORMASYON VE POZİSYON MATRİSİ
// ============================================================================

export const FORMATIONS = {
    "4-2-3-1": {
        attack: {
            GK:  [0.05, 0.50],  
            LB:  [0.40, 0.15],  
            LCB: [0.30, 0.35],  
            RCB: [0.30, 0.65],  
            RB:  [0.40, 0.85],  
            LDM: [0.50, 0.35],  
            RDM: [0.50, 0.65],  
            LW:  [0.85, 0.15],  
            CAM: [0.75, 0.50],  
            RW:  [0.85, 0.85],  
            ST:  [0.90, 0.50]   
        },
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
            ST:  [0.55, 0.50]   
        }
    }
};

// ============================================================================
// 4. TAKIM VE OYUNCU STATLARI (MÖRK BORG SİSTEMİ: -3 ile +3 Arası)
// ============================================================================

export const TEAMS = {
    galatasaray: {
        id: "gs",
        name: "Galatasaray",
        colors: { primary: "#A32638", secondary: "#FDB913", text: "#FFFFFF" },
        formation: "4-2-3-1",
        squad: [
            { 
                id: "gs_1", name: "Taffarel", number: 1, role: "GK", isGK: true, 
                stats: { pas: +1, topSurme: -2, hiz: -1, hizlanma: -1, sut: -3, kayma: 0, markaj: 0, guc: +1, kurtarma: +3 }
            },
            { 
                id: "gs_2", name: "Ergün Penbe", number: 67, role: "LB", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: +1, hizlanma: +1, sut: +1, kayma: +1, markaj: +1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "gs_3", name: "Popescu", number: 5, role: "LCB", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: 0, hizlanma: 0, sut: 0, kayma: +2, markaj: +3, guc: +2, kurtarma: -3 }
            },
            { 
                id: "gs_4", name: "Bülent K.", number: 3, role: "RCB", isGK: false, 
                stats: { pas: +1, topSurme: 0, hiz: 0, hizlanma: +1, sut: -1, kayma: +3, markaj: +3, guc: +3, kurtarma: -3 }
            },
            { 
                id: "gs_5", name: "Eboue", number: 27, role: "RB", isGK: false, 
                stats: { pas: +2, topSurme: +2, hiz: +3, hizlanma: +3, sut: +1, kayma: +2, markaj: +1, guc: +2, kurtarma: -3 }
            },
            { 
                id: "gs_6", name: "Melo", number: 4, role: "LDM", isGK: false, 
                stats: { pas: +2, topSurme: +1, hiz: +1, hizlanma: +1, sut: +2, kayma: +3, markaj: +2, guc: +3, kurtarma: -3 }
            },
            { 
                id: "gs_7", name: "Prekazi", number: 8, role: "RDM", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: 0, hizlanma: +1, sut: +3, kayma: +1, markaj: +1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "gs_8", name: "Sneijder", number: 14, role: "LW", isGK: false, 
                stats: { pas: +3, topSurme: +2, hiz: +1, hizlanma: +2, sut: +3, kayma: 0, markaj: 0, guc: +1, kurtarma: -3 }
            },
            { 
                id: "gs_9", name: "G. Hagi", number: 10, role: "CAM", isGK: false, 
                stats: { pas: +3, topSurme: +3, hiz: +1, hizlanma: +2, sut: +3, kayma: -1, markaj: -1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "gs_10", name: "Osimhen", number: 45, role: "RW", isGK: false, 
                stats: { pas: +1, topSurme: +2, hiz: +3, hizlanma: +3, sut: +2, kayma: 0, markaj: 0, guc: +3, kurtarma: -3 }
            },
            { 
                id: "gs_11", name: "Jardel", number: 9, role: "ST", isGK: false, 
                // Yavaş ama tam bir gol makinesi
                stats: { pas: +1, topSurme: +1, hiz: -2, hizlanma: -1, sut: +3, kayma: -2, markaj: 0, guc: +2, kurtarma: -3 }
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
                id: "fb_1", name: "Volkan D.", number: 1, role: "GK", isGK: true, 
                stats: { pas: +1, topSurme: -2, hiz: -1, hizlanma: -1, sut: -3, kayma: 0, markaj: 0, guc: +2, kurtarma: +3 }
            },
            { 
                id: "fb_2", name: "R. Carlos", number: 3, role: "LB", isGK: false, 
                stats: { pas: +2, topSurme: +2, hiz: +3, hizlanma: +3, sut: +3, kayma: +2, markaj: +1, guc: +2, kurtarma: -3 }
            },
            { 
                id: "fb_3", name: "Lugano", number: 2, role: "LCB", isGK: false, 
                stats: { pas: +1, topSurme: 0, hiz: -1, hizlanma: 0, sut: 0, kayma: +3, markaj: +3, guc: +3, kurtarma: -3 }
            },
            { 
                id: "fb_4", name: "Skrinar", number: 37, role: "RCB", isGK: false, 
                stats: { pas: +1, topSurme: 0, hiz: 0, hizlanma: +1, sut: 0, kayma: +2, markaj: +2, guc: +3, kurtarma: -3 }
            },
            { 
                id: "fb_5", name: "Gökhan G.", number: 77, role: "RB", isGK: false, 
                stats: { pas: +2, topSurme: +2, hiz: +2, hizlanma: +3, sut: +1, kayma: +2, markaj: +1, guc: +1, kurtarma: -3 }
            },
            { 
                id: "fb_6", name: "Appiah", number: 4, role: "LDM", isGK: false, 
                stats: { pas: +2, topSurme: +2, hiz: +2, hizlanma: +2, sut: +2, kayma: +2, markaj: +2, guc: +3, kurtarma: -3 }
            },
            { 
                id: "fb_7", name: "Ferdi K.", number: 7, role: "RDM", isGK: false, 
                stats: { pas: +2, topSurme: +3, hiz: +3, hizlanma: +3, sut: +1, kayma: +2, markaj: +1, guc: 0, kurtarma: -3 }
            },
            { 
                id: "fb_8", name: "Rıdvan", number: 8, role: "LW", isGK: false, 
                // İnanılmaz hızlı ve çalımcı
                stats: { pas: +2, topSurme: +3, hiz: +3, hizlanma: +3, sut: +2, kayma: 0, markaj: 0, guc: -1, kurtarma: -3 }
            },
            { 
                id: "fb_9", name: "Alex", number: 10, role: "CAM", isGK: false, 
                // Saf yetenek
                stats: { pas: +3, topSurme: +3, hiz: -1, hizlanma: 0, sut: +3, kayma: -2, markaj: -1, guc: 0, kurtarma: -3 }
            },
            { 
                id: "fb_10", name: "Ortega", number: 23, role: "RW", isGK: false, 
                stats: { pas: +3, topSurme: +3, hiz: +2, hizlanma: +2, sut: +2, kayma: -1, markaj: -1, guc: -1, kurtarma: -3 }
            },
            { 
                id: "fb_11", name: "Anelka", number: 39, role: "ST", isGK: false, 
                stats: { pas: +1, topSurme: +3, hiz: +3, hizlanma: +3, sut: +3, kayma: -1, markaj: 0, guc: +1, kurtarma: -3 }
            }
        ]
    }
};

// ============================================================================
// YARDIMCI FONKSİYONLAR (Veriye dışarıdan kolay erişim için)
// ============================================================================

export function getTeam(teamId) {
    if (teamId === "gs") return TEAMS.galatasaray;
    if (teamId === "fb") return TEAMS.fenerbahce;
    return null;
}

export function getPlayerById(playerId) {
    const gsPlayer = TEAMS.galatasaray.squad.find(p => p.id === playerId);
    if (gsPlayer) return { ...gsPlayer, teamId: "gs" };

    const fbPlayer = TEAMS.fenerbahce.squad.find(p => p.id === playerId);
    if (fbPlayer) return { ...fbPlayer, teamId: "fb" };

    return null;
}
