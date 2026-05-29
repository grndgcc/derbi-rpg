/**
 * ============================================================================
 * DERBİ RPG - ÇOKLU ÇEKİRDEK YAPAY ZEKA MOTORU (aiWorker.js)
 * ============================================================================
 * Bu dosya ana thread'den (UI ve Çizim) tamamen bağımsız bir CPU çekirdeğinde çalışır.
 * Amacı: Her frame'de (saniyede 60 kez) 21 yapay zeka oyuncusunun taktiksel
 * pozisyonlarını, karar alma (pas, şut, top sürme, pres) mekanizmalarını hesaplayıp
 * ana oyuna sadece "niyetleri" (intents) geri göndermektir.
 */

// Worker'lar module olarak yüklendiğinde import destekler
import { GAME_CONFIG, FORMATIONS } from './data.js';

/**
 * İki nokta arası mesafe hesaplama (Vektör matematiği Worker içinde tekrarlanır
 * çünkü Worker'a obje kopyalanarak gelir, class metodları silinir).
 */
function getDistance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Ana oyundan (Main Thread) oyun durumunu (State) alır.
 */
self.onmessage = function (e) {
    const gameState = e.detail || e.data;
    
    // AI motorunun hesapladığı sonuçların (hamlelerin) tutulacağı dizi
    const aiIntents = [];

    // Oyun durumunu analiz et
    const ballPos = gameState.ball;
    const possessionTeam = gameState.possessionTeamId; // "gs", "fb" veya null (boşta)
    
    // Her bir oyuncu için AI döngüsü başlat
    gameState.players.forEach(player => {
        // İnsan tarafından kontrol edilen oyuncuyu AI hesaplamaz (Geç)
        if (player.id === gameState.humanPlayerId) return;

        let intent = {
            id: player.id,
            targetX: player.x,
            targetY: player.y,
            action: "MOVE", // MOVE, PASS, SHOT, TACKLE
            actionTargetId: null // Pas verilecek oyuncu ID'si
        };

        const isMyTeamInPossession = possessionTeam === player.teamId;
        const isBallNeutral = possessionTeam === null;
        const iHaveBall = gameState.playerWithBallId === player.id;

        const myTeam = gameState.players.filter(p => p.teamId === player.teamId);
        const opponents = gameState.players.filter(p => p.teamId !== player.teamId);

        // --------------------------------------------------------------------
        // DURUM 1: TOP BENİM AYAĞIMDA (KARAR ALMA AĞACI)
        // --------------------------------------------------------------------
        if (iHaveBall) {
            // 1. ŞUT İHTİMALİ KONTROLÜ
            // "sut" statı yüksek olan (+2, +3) oyuncular uzaktan şut denemekten çekinmez.
            const enemyGoalX = player.teamId === "gs" ? GAME_CONFIG.pitch.width : 0;
            const enemyGoalY = GAME_CONFIG.pitch.height / 2;
            const distanceToGoal = getDistance(player.x, player.y, enemyGoalX, enemyGoalY);
            
            // Şut menzili statlara göre esner. Max uzaklık = 300 piksel, Şut +3 ise +90 piksel ekle
            const maxShotRange = 300 + (player.stats.sut * 30);
            
            if (distanceToGoal < maxShotRange) {
                // Kaleye doğru önüm boş mu?
                const blocks = opponents.filter(opp => getDistance(player.x, player.y, opp.x, opp.y) < 50 
                                                  && getDistance(opp.x, opp.y, enemyGoalX, enemyGoalY) < distanceToGoal);
                
                if (blocks.length === 0 || player.stats.sut === 3) {
                    intent.action = "SHOT";
                    intent.targetX = enemyGoalX;
                    intent.targetY = enemyGoalY;
                    aiIntents.push(intent);
                    return; // Şut kararı alındı, döngüden çık
                }
            }

            // 2. PAS İHTİMALİ KONTROLÜ
            // "pas" statı AI'ın vizyonunu (görüş açısını) belirler.
            const bestPass = findBestPassingOption(player, myTeam, opponents, enemyGoalX);
            // Zarımsı/Rastgele bir karar faktörü: Yüksek pas statı daha çok pas demektir
            const passPropensity = Math.random() * 10 + player.stats.pas; 

            if (bestPass && passPropensity > 5) {
                intent.action = "PASS";
                intent.actionTargetId = bestPass.id;
                intent.targetX = bestPass.x;
                intent.targetY = bestPass.y;
                aiIntents.push(intent);
                return;
            }

            // 3. TOP SÜRME (Dribbling)
            // Ne şut ne de pas kararı alındıysa, rakip kaleye doğru top sür!
            intent.action = "MOVE";
            intent.targetX = enemyGoalX;
            intent.targetY = player.y; // Düz ilerle
            aiIntents.push(intent);
            return;
        }

        // --------------------------------------------------------------------
        // DURUM 2: KALECİ (GK) YAPAY ZEKASI
        // --------------------------------------------------------------------
        if (player.role === "GK") {
            const myGoalX = player.teamId === "gs" ? 0 : GAME_CONFIG.pitch.width;
            const myGoalY = GAME_CONFIG.pitch.height / 2;
            
            // Top kendi yarı alanına gelene kadar kale çizgisinde bekle
            if (getDistance(myGoalX, myGoalY, ballPos.x, ballPos.y) < 300) {
                // Topa göre kale önünde açı kapat
                const angle = Math.atan2(ballPos.y - myGoalY, ballPos.x - myGoalX);
                const rushDistance = 30; // Çizgiden 30px öne çık
                intent.targetX = myGoalX + Math.cos(angle) * rushDistance;
                intent.targetY = myGoalY + Math.sin(angle) * rushDistance;
            } else {
                intent.targetX = myGoalX + (player.teamId === "gs" ? 10 : -10);
                intent.targetY = myGoalY;
            }
            aiIntents.push(intent);
            return;
        }

        // --------------------------------------------------------------------
        // DURUM 3: BOŞTAKİ TOPA HÜCUM (Inisiyatif ve Hızlanma)
        // --------------------------------------------------------------------
        if (isBallNeutral) {
            // Takımımdan topa en yakın kişi ben miyim?
            const distances = myTeam.map(t => ({ id: t.id, dist: getDistance(t.x, t.y, ballPos.x, ballPos.y) }));
            distances.sort((a, b) => a.dist - b.dist);
            
            if (distances[0].id === player.id) {
                // En yakın benim, topa depar at!
                intent.action = "MOVE";
                intent.targetX = ballPos.x;
                intent.targetY = ballPos.y;
                aiIntents.push(intent);
                return;
            }
        }

        // --------------------------------------------------------------------
        // DURUM 4: TAKIMIM HÜCUMDA (Top bende değil, ofansif yerleşim)
        // --------------------------------------------------------------------
        if (isMyTeamInPossession && !iHaveBall) {
            // Formasyondaki Attack koordinatlarını al (0-1 arası oranlar)
            const formObj = FORMATIONS[gameState.teams[player.teamId].formation].attack[player.role];
            
            // Oranları sahaya uyarla
            let baseTargetX = formObj[0] * GAME_CONFIG.pitch.width;
            let baseTargetY = formObj[1] * GAME_CONFIG.pitch.height;

            // Eğer takım sağdan sola hücum ediyorsa (FB ise) X eksenini ters çevir
            if (player.teamId === "fb") {
                baseTargetX = GAME_CONFIG.pitch.width - baseTargetX;
            }

            // Topun olduğu bölgeye göre dinamik olarak öne koşu (Dynamic Forward Runs)
            // Eğer topla oynayan takım arkadaşım bana doğru bakıyorsa, boşluğa kaç
            if (ballPos.x > baseTargetX === (player.teamId === "gs")) {
                // Top benden ileride, hücuma destek ver
                baseTargetX += (player.teamId === "gs" ? 1 : -1) * 100;
            }

            intent.targetX = baseTargetX;
            intent.targetY = baseTargetY;
            aiIntents.push(intent);
            return;
        }

        // --------------------------------------------------------------------
        // DURUM 5: TAKIMIM SAVUNMADA (Top rakipte, Zonal Marking ve Pres)
        // --------------------------------------------------------------------
        if (!isMyTeamInPossession && !isBallNeutral) {
            // Takımımdan topa (veya topla oynayan rakibe) en yakın ben miyim?
            const distancesToBall = myTeam.filter(t => t.role !== "GK").map(t => ({ id: t.id, dist: getDistance(t.x, t.y, ballPos.x, ballPos.y) }));
            distancesToBall.sort((a, b) => a.dist - b.dist);

            const isClosestToBall = distancesToBall[0].id === player.id;
            
            if (isClosestToBall) {
                // EN YAKIN BENİM: Pres yap veya Kayarak müdahale et (Tackle)
                intent.targetX = ballPos.x;
                intent.targetY = ballPos.y;
                
                // Rakibe yaklaştıysam ve "kayma" (Tackle) statım yüksekse müdahale et!
                if (distancesToBall[0].dist < 30) {
                    const tackleAggression = Math.random() * 10 + player.stats.kayma; // Stat bonusu agresifliği artırır
                    if (tackleAggression > 7) {
                        intent.action = "TACKLE";
                    }
                }
            } else {
                // EN YAKIN BEN DEĞİLİM: Formasyon savunmasına (Zonal Marking) dön
                const formObj = FORMATIONS[gameState.teams[player.teamId].formation].defense[player.role];
                let defTargetX = formObj[0] * GAME_CONFIG.pitch.width;
                let defTargetY = formObj[1] * GAME_CONFIG.pitch.height;

                if (player.teamId === "fb") {
                    defTargetX = GAME_CONFIG.pitch.width - defTargetX;
                }

                // Top neredeyse, defans bloğu o tarafa doğru (X ve Y ekseninde) kayar (Defensive Shifting)
                const ballInfluenceX = (ballPos.x - (GAME_CONFIG.pitch.width / 2)) * 0.15;
                const ballInfluenceY = (ballPos.y - (GAME_CONFIG.pitch.height / 2)) * 0.2;

                // "markaj" statı (Marking) yüksek olan oyuncular rakibe daha yakın durarak ofsayt taktiği yapar
                const markingBonus = player.stats.markaj * 5; 

                intent.targetX = defTargetX + ballInfluenceX + (player.teamId === "gs" ? markingBonus : -markingBonus);
                intent.targetY = defTargetY + ballInfluenceY;
            }
            
            aiIntents.push(intent);
        }
    });

    // Hesaplanan tüm hamleleri (intents) Ana Thread'e geri gönder
    self.postMessage({ intents: aiIntents });
};

// ============================================================================
// YARDIMCI YAPAY ZEKA FONKSİYONLARI
// ============================================================================

/**
 * Topa sahip olan oyuncu için en iyi pas opsiyonunu hesaplar.
 * Passing Lane (Pas Kanalı) mantığını içerir.
 */
function findBestPassingOption(passer, teammates, opponents, enemyGoalX) {
    let bestOption = null;
    let highestScore = -Infinity;

    teammates.forEach(teammate => {
        // Kendime veya kaleciye (zorunda kalmadıkça) pas vermem
        if (teammate.id === passer.id || teammate.role === "GK") return;

        const distance = getDistance(passer.x, passer.y, teammate.x, teammate.y);
        
        // Mörk Borg Pas statına göre çok uzağa bakamayabilir (-3 ise yakını, +3 ise sahanın öbür ucunu görür)
        const visionRange = 400 + (passer.stats.pas * 100);
        if (distance > visionRange) return;

        // Pas Skoru Hesaplama
        let score = 1000 - distance; // Yakın paslar genel olarak daha güvenlidir

        // Arkadaşım rakip kaleye benden daha mı yakın? (İleri pası ödüllendir)
        const myDistToGoal = Math.abs(passer.x - enemyGoalX);
        const hisDistToGoal = Math.abs(teammate.x - enemyGoalX);
        if (hisDistToGoal < myDistToGoal) {
            score += 500; // İleriye dönük pozitif puan
        }

        // Pas kanalı kontrolü (Passing Lane Interception Check)
        // Arkadaşımla aramdaki hayali çizgiye çok yakın bir rakip var mı?
        let isLaneBlocked = false;
        opponents.forEach(opp => {
            const distToPasser = getDistance(passer.x, passer.y, opp.x, opp.y);
            const distToTeammate = getDistance(teammate.x, teammate.y, opp.x, opp.y);
            
            // Eğer rakip ikimizin arasına bizden daha yakınsa ve üçgen oluşturuyorsa kanal kapalıdır
            if (distToPasser < distance && distToTeammate < distance) {
                // Basit bir dik uzaklık matematiği (Dot product mantığı)
                const area = Math.abs( (teammate.x - passer.x)*(passer.y - opp.y) - (passer.x - opp.x)*(teammate.y - passer.y) );
                const perpDistance = area / distance; // Rakibin pas çizgisine dik mesafesi

                if (perpDistance < 40) { // Pas kanalına 40 pikselden yakın bir rakip varsa riskli
                    isLaneBlocked = true;
                }
            }
        });

        // Eğer kanal kapalıysa ve pas statım efsane değilse (+3) pas atma
        if (isLaneBlocked) {
            score -= 2000; // Devasa ceza puanı (Riskli pas)
        }

        if (score > highestScore) {
            highestScore = score;
            bestOption = teammate;
        }
    });

    // Sadece skor belli bir güvenilirlik sınırını geçerse pası at
    return highestScore > 0 ? bestOption : null;
}