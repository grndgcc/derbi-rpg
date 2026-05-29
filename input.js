/**
 * ============================================================================
 * DERBİ RPG - OYUNCU KONTROLLERİ VE GİRDİ YÖNETİMİ (input.js)
 * ============================================================================
 * Bu modül, insanın (oyuncunun) klavye veya Gamepad üzerinden verdiği komutları
 * dinler. Ham girdileri (Keydown/Keyup) oyun motorunun anlayabileceği "niyetlere"
 * (Hareket Vektörü, Pas İstemi, Şut İstemi vb.) dönüştürür.
 */

import { Vector2D } from './physics.js';

// Tuş haritası (Klavye tuşlarının oyun içi aksiyonlara atanması)
const KEY_MAP = {
    // WASD veya Yön Tuşları (Hareket)
    'KeyW': 'up',       'ArrowUp': 'up',
    'KeyS': 'down',     'ArrowDown': 'down',
    'KeyA': 'left',     'ArrowLeft': 'left',
    'KeyD': 'right',    'ArrowRight': 'right',
    
    // Aksiyon Tuşları (FIFA Tarzı Klasik Düzen)
    'KeyK': 'pass',     // K: Kısa Pas
    'KeyL': 'shot',     // L: Şut
    'KeyJ': 'tackle',   // J: Kayarak Müdahale / Top Çalma
    'ShiftLeft': 'sprint', // Shift: Hızlı Koşu / İvmelenme
    'ShiftRight': 'sprint'
};

export class InputManager {
    constructor() {
        // Tuşların anlık durumlarını (Basılı, Serbest) tutan sözlük
        this.keys = {
            up: false, down: false, left: false, right: false,
            pass: false, shot: false, tackle: false, sprint: false
        };

        // Tuşa "ilk basıldığı anı" (Just Pressed) yakalamak için (Spam koruması)
        this.previousKeys = { ...this.keys };

        // Son hesaplanan hareket vektörü (X, Y)
        this.moveVector = new Vector2D(0, 0);

        // Gamepad index'i (Takılıysa)
        this.gamepadIndex = null;
        
        // Analog çubuklar için ölü bölge (Deadzone) - Hafif titremeleri yok sayar
        this.GAMEPAD_DEADZONE = 0.2;

        this._initListeners();
    }

    /**
     * Olay dinleyicilerini (Event Listeners) başlatır.
     * @private
     */
    _initListeners() {
        // Klavye tuşuna basıldığında
        window.addEventListener('keydown', (e) => {
            const action = KEY_MAP[e.code];
            if (action) {
                this.keys[action] = true;
                // Oyun tuşlarına basıldığında tarayıcının varsayılan hareketini (sayfa kaydırma vb) engelle
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                    e.preventDefault();
                }
            }
        });

        // Klavye tuşu bırakıldığında
        window.addEventListener('keyup', (e) => {
            const action = KEY_MAP[e.code];
            if (action) {
                this.keys[action] = false;
            }
        });

        // Gamepad bağlantılarını dinle
        window.addEventListener('gamepadconnected', (e) => {
            console.log(`🎮 Gamepad Bağlandı: ${e.gamepad.id}`);
            this.gamepadIndex = e.gamepad.index;
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            console.log(`🎮 Gamepad Çıkarıldı: ${e.gamepad.id}`);
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
            }
        });
    }

    /**
     * Gamepad API üzerinden analog çubukları ve butonları okur.
     * Bu fonksiyon her frame'de (requestAnimationFrame) çağrılmalıdır.
     * @private
     */
    _pollGamepad() {
        if (this.gamepadIndex === null) return;

        const gamepads = navigator.getGamepads();
        const gp = gamepads[this.gamepadIndex];
        
        if (!gp) return;

        // 1. Sol Analog Çubuk (Hareket) okuması
        const axesX = gp.axes[0];
        const axesY = gp.axes[1];

        // Deadzone hesaplaması (Çubuk tam merkezde değilken hafif titriyorsa yoksay)
        if (Math.abs(axesX) > this.GAMEPAD_DEADZONE) {
            this.keys.right = axesX > 0;
            this.keys.left = axesX < 0;
        } else {
            // Analog kullanılmıyorsa klavye öncelikli kalsın diye doğrudan false yapmıyoruz,
            // ama gamepad'den gelen net bir sıfırlama varsa klavyeyi ezebilir.
            // Biz basit bir kontrol yazıyoruz:
            if (!this.keys.right && !this.keys.left) {
                this.keys.right = false; 
                this.keys.left = false;
            }
        }

        if (Math.abs(axesY) > this.GAMEPAD_DEADZONE) {
            this.keys.down = axesY > 0;
            this.keys.up = axesY < 0;
        } else {
            if (!this.keys.up && !this.keys.down) {
                this.keys.up = false; 
                this.keys.down = false;
            }
        }

        // 2. Buton Okumaları (PlayStation/Xbox Standardı)
        // Düğme 0 (A/Cross) -> Pas
        // Düğme 1 (B/Circle) veya Düğme 2 (X/Square) -> Şut veya Kayma
        // Düğme 7 (R2/RT) -> Sprint (Hızlı Koşu)
        
        this.keys.pass = gp.buttons[0]?.pressed || this.keys.pass;
        this.keys.tackle = gp.buttons[1]?.pressed || this.keys.tackle; 
        this.keys.shot = gp.buttons[2]?.pressed || this.keys.shot;
        this.keys.sprint = gp.buttons[7]?.pressed || this.keys.sprint; 
    }

    /**
     * Tüm girdileri okuyup oyun motoruna sunulacak Nihai Niyetleri (Intent) hesaplar.
     * Bu fonksiyon Main Loop (Ana Döngü) tarafından her karede (frame) 1 kez çağrılır.
     * @returns {Object} Oyuncunun o anki durumu ve eylemleri
     */
    updateAndGetIntent() {
        // Gamepad verilerini güncelle
        this._pollGamepad();

        // Hareket Vektörünü (X, Y) hesapla
        let dx = 0;
        let dy = 0;

        if (this.keys.right) dx += 1;
        if (this.keys.left) dx -= 1;
        if (this.keys.down) dy += 1;
        if (this.keys.up) dy -= 1;

        // Çapraz gidişlerde hızı dengelemek için normalizasyon işlemi.
        // Eğer normalize etmezsek sağ (1) ve alt (1) basıldığında hipotenüs 1.41 olur, oyuncu daha hızlı koşar!
        const rawVector = new Vector2D(dx, dy);
        this.moveVector = rawVector.mag() > 0 ? rawVector.normalize() : new Vector2D(0, 0);

        // Aksiyonların "Sadece Bu Frame'de" (Just Pressed) basılıp basılmadığını kontrol et
        const isPassPressed = this.keys.pass && !this.previousKeys.pass;
        const isShotPressed = this.keys.shot && !this.previousKeys.shot;
        const isTacklePressed = this.keys.tackle && !this.previousKeys.tackle;
        
        // Sprint (Hızlı Koşu) basılı tutulabilen (Held) bir aksiyondur
        const isSprinting = this.keys.sprint;

        // Bir sonraki frame için mevcut tuş durumlarını "önceki" olarak kaydet
        this.previousKeys = { ...this.keys };

        // Oyun motoruna (ActionHandler ve Physics) gönderilecek DTO (Data Transfer Object)
        return {
            moveVector: this.moveVector,     // Hangi yöne gidilmek isteniyor? (Vector2D)
            isSprinting: isSprinting,        // Hızlanma/Sprint aktif mi? (boolean)
            actionPass: isPassPressed,       // Pas tuşuna "şu an" basıldı mı? (boolean)
            actionShot: isShotPressed,       // Şut tuşuna "şu an" basıldı mı? (boolean)
            actionTackle: isTacklePressed    // Kayma tuşuna "şu an" basıldı mı? (boolean)
        };
    }

    /**
     * Devre arası veya gol sonrası girdileri tamamen sıfırlamak (reset) için kullanılır.
     */
    resetInputs() {
        for (let key in this.keys) {
            this.keys[key] = false;
            this.previousKeys[key] = false;
        }
        this.moveVector = new Vector2D(0, 0);
    }
}

// Oyunda tek bir giriş yöneticisi (Singleton) olacağı için doğrudan instance export edilebilir.
export const inputManager = new InputManager();