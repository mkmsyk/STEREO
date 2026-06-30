-- MONORAL / ENGINEv4 - Game Boy Cartridge (Lua)
-- 4色パレット制描画 & ゼロコピーフレームバッファ直接操作の実証

local px, py, pvy
local is_grounded
local score
local hi_score
local state -- "TITLE", "PLAYING", "GAMEOVER"
local flash_timer
local title_y
local demo_timer

-- オブジェクトプールの事前定義 (ゼロ・アロケーション原則)
local MAX_STARS = 15
local stars = {}

local MAX_METEORS = 6
local meteors = {}
local spawn_timer

-- パレット定数
-- 0: 最も明るい緑, 1: 明るい緑, 2: 暗い緑, 3: 最も暗い緑
local COLOR_BG = 0
local COLOR_LITE = 1
local COLOR_DARK = 2
local COLOR_TEXT = 3

-- UFOのドット絵を描画するヘルパー
local function draw_ufo(x, y)
    screen.rect(x + 2, y, 4, 1, COLOR_TEXT)
    screen.rect(x + 1, y + 1, 6, 1, COLOR_TEXT)
    screen.rect(x, y + 2, 8, 1, COLOR_TEXT)
    screen.rect(x + 2, y + 2, 4, 1, COLOR_BG) -- キャノピー
    screen.rect(x, y + 3, 8, 1, COLOR_TEXT)
    screen.rect(x + 1, y + 4, 1, 1, COLOR_TEXT)
    screen.rect(x + 3, y + 4, 2, 1, COLOR_TEXT)
    screen.rect(x + 6, y + 4, 1, 1, COLOR_TEXT)
    screen.rect(x + 3, y + 5, 2, 1, COLOR_TEXT)
end

-- 隕石のドット絵を描画するヘルパー
local function draw_meteor(x, y, size)
    screen.rect(x, y, size, size, COLOR_TEXT)
    -- 中を少し明るくして立体感を出す
    if size > 4 then
        screen.rect(x + 1, y + 1, size - 2, size - 2, COLOR_LITE)
    end
end

function init()
    px = 80 - 4
    py = 144 - 20
    pvy = 0
    is_grounded = true
    score = 0
    state = "TITLE"
    flash_timer = 0
    title_y = -30
    demo_timer = 0
    spawn_timer = 0

    -- ストレージからハイスコアの取得
    hi_score = storage.read("hi_score", 0)

    -- 星プールの初期化 (ピクセル直接描画用)
    for i = 1, MAX_STARS do
        stars[i] = { x = math.random(0, 159), y = math.random(0, 131), speed = 0.4 + math.random() * 0.8 }
    end

    -- 隕石プールの初期化
    for i = 1, MAX_METEORS do
        meteors[i] = { x = 0, y = 0, active = false, speed = 0, size = 6 }
    end
end

function update(dt)
    flash_timer = (flash_timer + 1) % 60
    demo_timer = demo_timer + dt

    if state == "TITLE" then
        -- タイトルの降下
        if title_y < 25 then
            title_y = title_y + 1.2
        end

        -- 星のスクロール
        for i = 1, MAX_STARS do
            local s = stars[i]
            s.y = s.y + s.speed
            if s.y >= 132 then
                s.y = 0
                s.x = math.random(0, 159)
            end
        end

        -- スタートボタンまたはAボタンでゲーム開始
        if input.btnp("start") or input.btnp("a") then
            state = "PLAYING"
            px = 80 - 4
            py = 144 - 20
            pvy = 0
            is_grounded = true
            score = 0
            spawn_timer = 0
            audio.play(880, 0.05, 0.04, 'square')
            audio.play(1320, 0.12, 0.04, 'square')
            -- 隕石プールをクリア
            for i = 1, MAX_METEORS do
                meteors[i].active = false
            end
        end
    elseif state == "PLAYING" then
        -- スコア加算
        score = score + 1
 
        -- 左右移動
        if input.btn("left") then
            px = px - 1.5
        elseif input.btn("right") then
            px = px + 1.5
        end
 
        -- ジャンプ
        if input.btnp("a") and is_grounded then
            pvy = -3.8
            is_grounded = false
            audio.play(440, 0.08, 0.03, 'triangle')
        end

        -- 物理演算 (重力と地面当たり判定)
        pvy = pvy + 0.22
        py = py + pvy

        if px < 4 then px = 4 end
        if px > 156 - 8 then px = 156 - 8 end

        if py >= 144 - 20 then
            py = 144 - 20
            pvy = 0
            is_grounded = true
        end

        -- 星のスクロール
        for i = 1, MAX_STARS do
            local s = stars[i]
            s.y = s.y + s.speed
            if s.y >= 132 then
                s.y = 0
                s.x = math.random(0, 159)
            end
        end

        -- 隕石の生成
        spawn_timer = spawn_timer + dt
        if spawn_timer > 0.8 then
            spawn_timer = 0
            for i = 1, MAX_METEORS do
                local m = meteors[i]
                if not m.active then
                    m.active = true
                    m.size = math.random() > 0.5 and 6 or 4
                    m.x = math.random(4, 156 - m.size)
                    m.y = -8
                    m.speed = 0.8 + math.random() * 1.2
                    break
                end
            end
        end

        -- 隕石の更新と衝突判定
        for i = 1, MAX_METEORS do
            local m = meteors[i]
            if m.active then
                m.y = m.y + m.speed
                if m.y > 132 then
                    m.active = false
                else
                    -- UFO のサイズは 8x6 (中心 px, py)
                    local px1, py1, px2, py2 = px, py, px + 8, py + 6
                    local mx1, my1, mx2, my2 = m.x, m.y, m.x + m.size, m.y + m.size

                    if px1 < mx2 and px2 > mx1 and py1 < my2 and py2 > my1 then
                        state = "GAMEOVER"
                        audio.play(120, 0.35, 0.08, 'sawtooth')
                        if score > hi_score then
                            hi_score = score
                            storage.write("hi_score", hi_score)
                        end
                    end
                end
            end
        end
    elseif state == "GAMEOVER" then
        if input.btnp("start") or input.btnp("a") then
            state = "TITLE"
            title_y = -30
            audio.play(523.25, 0.06, 0.04, 'square')
        end
    end
end

function draw()
    -- 1. 抽象コマンドAPIで背景をクリア (COLOR_BG)
    screen.clear(COLOR_BG)

    -- 2. ドット絵風の飾り外枠
    screen.rect(2, 2, 156, 140, COLOR_TEXT, false)

    -- 3. ゼロコピー直接バッファ描画による星くずレンダリング
    -- パレットインデックス 2 (暗い緑: RGB 48, 98, 48) で星を打つ
    for i = 1, MAX_STARS do
        local s = stars[i]
        local sx = math.floor(s.x)
        local sy = math.floor(s.y)
        if sx >= 3 and sx < 157 and sy >= 3 and sy < 131 then
            local idx = (sy * 160 + sx) * 4
            pixelBuffer[idx + 1] = 48  -- R
            pixelBuffer[idx + 2] = 98  -- G
            pixelBuffer[idx + 3] = 48  -- B
            pixelBuffer[idx + 4] = 255 -- A
        end
    end

    if state == "TITLE" then
        -- (注: 画面内テキストは、現状の screen API はクリア・矩形描画に特化しているため、
        --  テキストやタイトルロゴは screen.rect 等で簡易レイアウトしつつ、
        --  詳細なテキスト描画は JS 側の高機能 Canvas API に委譲します)
        
        -- UFO の左右往復デモ
        local demox = 80 - 4 + math.sin(demo_timer * 2.0) * 40
        draw_ufo(demox, 144 - 30)

        -- デモ用の地面ライン
        screen.rect(2, 144 - 12, 156, 10, COLOR_DARK)
        screen.rect(2, 144 - 12, 156, 1, COLOR_TEXT)
    elseif state == "PLAYING" then
        -- 地面の描画 (COLOR_DARK & 上部にライン)
        screen.rect(2, 144 - 12, 156, 10, COLOR_DARK)
        screen.rect(2, 144 - 12, 156, 1, COLOR_TEXT)

        -- プレイヤーのUFO
        draw_ufo(px, py)

        -- 障害物
        for i = 1, MAX_METEORS do
            local m = meteors[i]
            if m.active then
                draw_meteor(m.x, m.y, m.size)
            end
        end
    elseif state == "GAMEOVER" then
        -- ゲームオーバー時の看板プレート
        screen.rect(20, 35, 120, 60, COLOR_DARK)
        screen.rect(20, 35, 120, 60, COLOR_TEXT, false)
    end
end
