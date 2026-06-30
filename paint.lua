-- MONORAL / LUA PAINT - Cartridge (Lua)
-- 40x36 解像度のドットペイントツール (1ドット = 4x4ピクセル)
-- ゼロ・アロケーション原則対応

local cx, cy
local grid = {}
local grid_w = 40
local grid_h = 36
local scale = 4

local cursor_timer
local state -- "TITLE", "PLAYING"
local title_y
local flash_timer

-- パレット定数
local COLOR_BG = 0
local COLOR_LITE = 1
local COLOR_DARK = 2
local COLOR_TEXT = 3

function init()
    cx = 20
    cy = 18
    cursor_timer = 0
    state = "TITLE"
    title_y = -30
    flash_timer = 0

    -- グリッドデータの事前アロケート (1440要素を0で初期化)
    for i = 1, grid_w * grid_h do
        grid[i] = COLOR_BG
    end
end

function update(dt)
    flash_timer = (flash_timer + 1) % 60
    cursor_timer = cursor_timer + dt

    if state == "TITLE" then
        if title_y < 25 then
            title_y = title_y + 1.2
        end

        if input.btnp("start") or input.btnp("a") then
            state = "PLAYING"
            cx = 20
            cy = 18
            audio.play(880, 0.06, 0.04, 'square')
            -- グリッドクリア
            for i = 1, grid_w * grid_h do
                grid[i] = COLOR_BG
            end
        end
    elseif state == "PLAYING" then
        -- スタートボタンでタイトルへ戻る
        if input.btnp("start") then
            state = "TITLE"
            title_y = -30
            audio.play(440, 0.06, 0.04, 'square')
        end

        -- 方向キーでカーソル移動 (押しっぱなしで連続移動するようにタイマー制御)
        local moved = false
        if input.btnp("left") or (input.btn("left") and cursor_timer > 0.15) then
            cx = cx - 1
            cursor_timer = 0
            moved = true
        elseif input.btnp("right") or (input.btn("right") and cursor_timer > 0.15) then
            cx = cx + 1
            cursor_timer = 0
            moved = true
        end

        if input.btnp("up") or (input.btn("up") and cursor_timer > 0.15) then
            cy = cy - 1
            cursor_timer = 0
            moved = true
        elseif input.btnp("down") or (input.btn("down") and cursor_timer > 0.15) then
            cy = cy + 1
            cursor_timer = 0
            moved = true
        end

        if moved then
            audio.play(1500, 0.015, 0.01, 'triangle')
        end

        -- 画面外制限
        -- 飾り枠(2px)を考慮し、描画可能エリアは X:1〜38, Y:1〜34 グリッドに制限
        if cx < 1 then cx = 1 end
        if cx > grid_w - 2 then cx = grid_w - 2 end
        if cy < 1 then cy = 1 end
        if cy > grid_h - 2 then cy = grid_h - 2 end

        -- ペイント操作 (A: 描く, B: 消す)
        local idx = cy * grid_w + cx + 1
        if input.btn("a") then
            if grid[idx] ~= COLOR_TEXT then
                grid[idx] = COLOR_TEXT
                audio.play(659.25, 0.02, 0.02, 'square') -- E5
            end
        elseif input.btn("b") then
            if grid[idx] ~= COLOR_BG then
                grid[idx] = COLOR_BG
                audio.play(523.25, 0.02, 0.02, 'square') -- C5
            end
        end
    end
end

function draw()
    screen.clear(COLOR_BG)

    -- 飾り外枠
    screen.rect(2, 2, 156, 140, COLOR_TEXT, false)

    if state == "TITLE" then
        -- タイトルのウネウネ背景 (ペイントキャンバスのデモ)
        -- (タイトル中は JS 側の高レイヤーテキストがオーバーレイされます)
        
        -- アートデモ風に中央に何点か描画
        screen.rect(60, 70, 40, 20, COLOR_DARK)
        screen.rect(62, 72, 36, 16, COLOR_LITE)
    elseif state == "PLAYING" then
        -- グリッドキャンバスの描画
        for gy = 1, grid_h - 2 do
            for gx = 1, grid_w - 2 do
                local idx = gy * grid_w + gx + 1
                local val = grid[idx]
                if val ~= COLOR_BG then
                    screen.rect(gx * scale, gy * scale, scale, scale, val)
                end
            end
        end

        -- カーソルの描画 (点滅する枠線)
        if math.floor(cursor_timer * 8) % 2 == 0 then
            -- カーソルの周り枠を COLOR_DARK (暗い緑) で描画
            screen.rect(cx * scale, cy * scale, scale, scale, COLOR_DARK, false)
        end
    end
end
