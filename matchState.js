/**
 * ============================================================================
 * DERBİ RPG - MAÇ DURUMU VE HAKEM SİSTEMİ (matchState.js)
 * ============================================================================
 * Bu modül oyunun Merkezi Gerçeklik (Source of Truth) noktasıdır. 
 * Oyuncuların X, Y koordinatları, topun durumu, maçın süresi ve skoru burada tutulur.
 * UI (Arayüz) ve AI (Yapay Zeka) bu dosyadan beslenir.
 */

import { GAME_CONFIG, TEAMS, FORMATIONS } from './data.js';
import { Vector2D } from './physics.js';

// Oyun Fazları (State Machine)
export const MATCH_PHASES = {
    MENU: 'MENU',
    KICK_OFF: 'KICK_OFF',
    PLAYING: 'PLAYING',
    GOAL_CELEBRATION: 'GOAL_CELEBRATION',
    OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
    HALF_TIME: 'HALF_TIME',
    FULL_TIME: 'FULL_TIME'
};

export class MatchState {
    constructor() {
        // --- TEMEL DURUM (CORE STATE) ---
        this.phase = MATCH_PHASES.MENU;
        this.timer = 0; // Saniye cinsinden
        this.maxTime = 90 * 60; // 90 dakika (Oyun içi hızlandırılmış simüle edilebilir)
        this.timeScale = 60; // Gerçek 1 saniye = Oyunda 60 saniye (Yani 1.5 dakikalık gerçek oyun süresi)
        
        // --- SKOR TABELASI ---
        this.score = {
            gs: 0,
            fb: 0
        };

        // --- AKTÖRLER ---
        this.players = []; // Sahanın içindeki 22 oyuncunun dinamik verisi
        this.ball = {
            x: GAME_CONFIG.pitch.width / 2,
            y: GAME_CONFIG.pitch.height / 2,
            z: 0,
            vx: 0, vy: 0, vz: 0
        };

        // --- TAKTİK VE KONTROL ---
        this.humanPlayerId = null; // Oyuncunun klavye ile kontrol ettiği karakter
        this.humanTeamId = null;   // Oyuncunun seçtiği takım ("gs" veya "fb")
        this.possessionTeamId = null; // Top o an hangi takımda?
        this.playerWithBallId = null; // Top tam olarak kimin ayağında?
        this.kickoffTeamId = "gs"; // Santrayı kim yapacak? (Varsayılan Galatasaray başlar)
    }

    // ========================================================================
    // 1. MAÇ BAŞLATMA VE SAHA KURULUMU
    // ========================================================================

    /**
     * Menüden takım ve oyuncu seçildikten sonra maçı başlatır.
     * @param {string} teamId - "gs" veya "fb"
     * @param {string} playerId - Örn: "gs_10"
     */
    initMatch(teamId, playerId) {
        this.humanTeamId = teamId;
        this.humanPlayerId = playerId;
        this.score = { gs: 0, fb: 0 };
        this.timer = 0;
        
        // Takım listelerini oluştur ve dinamik fizik/durum değişkenlerini ekle
        this._loadSquad("gs");
        this._loadSquad("fb");

        // Oyuncuları santra pozisyonuna diz
        this.kickoffTeamId = "gs"; 
        this.resetPitch(true);
        
        this.phase = MATCH_PHASES.KICK_OFF;

        // UI'a bilgi yolla
        this._dispatchEvent('matchStarted', { 
            teamId: this.humanTeamId, 
            playerId: this.humanPlayerId 
        });
    }

    /**
     * Statik veritabanından (data.js) kadroları çeker ve fizik motorunun
     * kullanacağı dinamik (X, Y, Hız) özelliklerle zenginleştirir.
     */
    _loadSquad(teamId) {
        const teamData = teamId === "gs" ? TEAMS.galatasaray : TEAMS.fenerbahce;
        
        teamData.squad.forEach(playerData => {
            this.players.push({
                // Temel Veriler
                id: playerData.id,
                teamId: teamId,
                name: playerData.name,
                role: playerData.role,
                isGK: playerData.isGK,
                stats: playerData.stats,
                
                // Dinamik Fizik Verileri
                x: 0, y: 0,
                vx: 0, vy: 0,
                
                // Yapay Zeka & Girdi Niyetleri
                moveIntent: new Vector2D(0, 0),
                targetMaxSpeed: GAME_CONFIG.player.baseSpeed
            });
        });
    }

    /**
     * Santra, Gol veya Taç durumlarında oyuncuları sahaya yeniden dizer.
     * @param {boolean} isKickoff - Santra düzeni mi?
     */
    resetPitch(isKickoff = true) {
        const { width, height } = GAME_CONFIG.pitch;

        // Topu sahanın tam ortasına koy
        this.ball.x = width / 2;
        this.ball.y = height / 2;
        this.ball.z = 0;
        this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;

        this.playerWithBallId = null;
        this.possessionTeamId = null;

        // Her bir oyuncuyu formasyonuna göre sahaya yerleştir
        this.players.forEach(player => {
            // Hızları sıfırla
            player.vx = 0;
            player.vy = 0;

            const isGS = player.teamId === "gs";
            const teamData = isGS ? TEAMS.galatasaray : TEAMS.fenerbahce;
            
            // Santra durumu savunma formasyonundan türer (Herkes kendi yarı alanında olmalı)
            const formObj = FORMATIONS[teamData.formation].defense[player.role];
            
            // Koordinatları hesapla (0-1 arası oranı piksele çevir)
            let targetX = formObj[0] * width;
            let targetY = formObj[1] * height;

            // Galatasaray soldan sağa, Fenerbahçe sağdan sola hücum eder (1. Yarı)
            // Dolayısıyla FB'nin X ekseni aynalanmalıdır (width - x)
            if (!isGS) {
                targetX = width - targetX;
            }

            // Eğer oyuncunun takımı santra yapıyorsa, Santrafor'u (ST) ve 10 Numara'yı (CAM) topun yanına koy
            if (isKickoff && player.teamId === this.kickoffTeamId) {
                if (player.role === "ST") {
                    targetX = (width / 2) - (isGS ? 10 : -10);
                    targetY = height / 2;
                }
                if (player.role === "CAM") {
                    targetX = (width / 2) - (isGS ? 25 : -25);
                    targetY = height / 2 + 20;
                }
            } else if (isKickoff && player.teamId !== this.kickoffTeamId) {
                // Santra yapmayan takım, topun kendi yarı alanına (orta yuvarlağa) gelmesini bekler
                if (player.role === "ST" || player.role === "CAM") {
                    targetX = (width / 2) + (isGS ? -70 : 70); 
                }
            }

            // Koordinatları uygula
            player.x = targetX;
            player.y = targetY;
        });
    }

    // ========================================================================
    // 2. OYUN DÖNGÜSÜ (GAME LOOP) GÜNCELLEMELERİ
    // ========================================================================

    /**
     * Zamanı günceller ve maçın bitip bitmediğini kontrol eder.
     * @param {number} deltaTime - Frameler arası geçen saniye (örn: 0.016)
     */
    updateTimer(deltaTime) {
        if (this.phase !== MATCH_PHASES.PLAYING) return;

        // Oyundaki 1 saniye gerçek hayatta `timeScale` kadar hızlı akar
        this.timer += (deltaTime * this.timeScale);

        // UI'a zaman bilgisini saniyede bir kez yolla (Optimizasyon için küsuratsız kontrol)
        const minutes = Math.floor(this.timer / 60);
        const seconds = Math.floor(this.timer % 60);
        
        // Zaman sınırını aştı mı?
        if (this.timer >= this.maxTime) {
            this.phase = MATCH_PHASES.FULL_TIME;
            this._dispatchEvent('matchOver', { score: this.score });
            return;
        }

        // Custom Event fırlatarak arayüzü sadece dakikalar/saniyeler değiştiğinde güncelle
        this._dispatchEvent('timeUpdate', { minutes, seconds });
    }

    /**
     * Topun anlık olarak kime ait olduğunu hesaplar.
     * Top bir oyuncunun kontrol mesafesine girerse mülkiyet ona geçer.
     */
    updatePossession() {
        // Top havadaysa (z ekseni > 10) mülkiyet kimseye geçemez
        if (this.ball.z > 10) {
            this.playerWithBallId = null;
            return;
        }

        let minDistance = Infinity;
        let closestPlayer = null;

        const bPos = new Vector2D(this.ball.x, this.ball.y);

        this.players.forEach(player => {
            const pPos = new Vector2D(player.x, player.y);
            const distance = pPos.distance(bPos);
            
            // Eğer top oyuncunun kontrol alanındaysa
            const controlRadius = GAME_CONFIG.player.radius + 15; // Topla temas mesafesi
            
            if (distance < controlRadius && distance < minDistance) {
                minDistance = distance;
                closestPlayer = player;
            }
        });

        if (closestPlayer) {
            // Eğer top başkasından bu oyuncuya geçiyorsa "Araya Girme" veya "Top Çalma" yaşanmıştır
            if (this.playerWithBallId !== closestPlayer.id) {
                this.playerWithBallId = closestPlayer.id;
                this.possessionTeamId = closestPlayer.teamId;
            }
        } else {
            // Top boştaysa oyuncu ID'sini temizle ama "takım" mülkiyetini son dokunana ait tut 
            // (Yapay zeka defans/hücum bloklarını bozmasın diye)
            this.playerWithBallId = null;
        }
    }

    // ========================================================================
    // 3. MAÇ OLAYLARI (GOL, TAÇ, KORNER)
    // ========================================================================

    /**
     * Fizik motoru topun çizgiyi geçtiğini bildirdiğinde çalışır.
     * @param {string} teamId - Golü atan takım ("gs" veya "fb")
     */
    scoreGoal(teamId) {
        if (this.phase !== MATCH_PHASES.PLAYING) return;

        this.phase = MATCH_PHASES.GOAL_CELEBRATION;
        this.score[teamId] += 1;

        // UI'a Gol haberini uçur (Ekrana kocaman GOOOOOOOL yazdıracağız)
        this._dispatchEvent('goalScored', { 
            scoringTeam: teamId, 
            scoreStr: `${this.score.gs} - ${this.score.fb}` 
        });

        // Gol yiyen takım santra yapacak
        this.kickoffTeamId = teamId === "gs" ? "fb" : "gs";

        // 3 saniye sonra santraya dön
        setTimeout(() => {
            if (this.phase !== MATCH_PHASES.FULL_TIME) {
                this.resetPitch(true);
                this.phase = MATCH_PHASES.KICK_OFF;
                this._dispatchEvent('phaseChanged', { phase: this.phase });
            }
        }, 3000);
    }

    /**
     * Taç, aut veya korner olduğunda topu ilgili yere taşır.
     * Minik oyun olduğu için şimdilik karmaşık taç atışları yerine 
     * topu oyun alanının 1 metre içine koyup takımları pozisyonlandıracağız.
     */
    handleOutOfBounds(eventType) {
        if (this.phase !== MATCH_PHASES.PLAYING) return;

        this.phase = MATCH_PHASES.OUT_OF_BOUNDS;
        
        // Son dokunanın rakibine topu ver
        const attackingTeam = this.possessionTeamId === "gs" ? "fb" : "gs";
        this.kickoffTeamId = attackingTeam;

        // UI'da "TAÇ" veya "AUT" yazması için
        this._dispatchEvent('outOfBounds', { type: eventType });

        setTimeout(() => {
            this.resetPitch(false); // Herkes defans/hücum pozisyonuna geçer
            
            // Topu eventType'a göre saha kenarına taşı (Kısa çözüm)
            if (eventType === "throw_in_top") this.ball.y = GAME_CONFIG.pitch.margin + 10;
            if (eventType === "throw_in_bottom") this.ball.y = GAME_CONFIG.pitch.height - GAME_CONFIG.pitch.margin - 10;
            
            this.phase = MATCH_PHASES.PLAYING;
        }, 2000);
    }

    // ========================================================================
    // 4. VERİ İLETİŞİMİ (WEB WORKER İÇİN DTO)
    // ========================================================================

    /**
     * AI (Web Worker) sadece JSON serileştirilebilir verileri okuyabilir.
     * (İçinde Class, metod olan karmaşık objeler Worker'a gönderilemez).
     * Bu yüzden State'in temizlenmiş, hafif bir kopyasını oluştururuz.
     * Saniyede 60 kez çalışacağı için sadece gerekli veriler gönderilir.
     */
    getGameStateDTO() {
        return {
            phase: this.phase,
            possessionTeamId: this.possessionTeamId,
            playerWithBallId: this.playerWithBallId,
            humanPlayerId: this.humanPlayerId,
            
            // Topun sadece koordinatları
            ball: { 
                x: this.ball.x, 
                y: this.ball.y, 
                z: this.ball.z 
            },
            
            // Oyuncuların koordinatları ve rolleri
            players: this.players.map(p => ({
                id: p.id,
                teamId: p.teamId,
                role: p.role,
                x: p.x,
                y: p.y,
                stats: p.stats // AI kararları için Mörk Borg statları gerekli
            })),

            // Formasyon haritası (Worker'da sürekli import etmemek için)
            teams: {
                gs: { formation: TEAMS.galatasaray.formation },
                fb: { formation: TEAMS.fenerbahce.formation }
            }
        };
    }

    // ========================================================================
    // 5. YARDIMCI FONKSİYON (CUSTOM EVENTS)
    // ========================================================================
    
    /**
     * UI (index.html'deki Arayüz) dosyasının durumu bilmesi için
     * DOM üzerine güvenli ve soyutlanmış olay fırlatır.
     */
    _dispatchEvent(eventName, detailData) {
        const event = new CustomEvent(eventName, { detail: detailData });
        window.dispatchEvent(event);
    }
}

// Global Singleton Obje
export const matchState = new MatchState();