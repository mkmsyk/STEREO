-- MONORAL / GB CLOCK - Stop 10.00s Game (Lua)
-- 10秒ジャストを狙って止めるタイムアタック・ミニゲーム
-- 0: 最も明るい緑, 1: 明るい緑, 2: 暗い緑, 3: 最も暗い緑

local state -- "TITLE", "PLAYING", "STOPPED"
local timer
local record -- 最小誤差レコード
local flash_timer
local title_y

function init()
    state = "TITLE"
    timer = 0.0
    record = storage.read("best_diff", 9.99) -- 初期ベストは9.99秒
    flash_timer = 0
    title_y = -30
end

function update(dt)
    flash_timer = (flash_timer + 1) % 60

    if state == "TITLE" then
        if title_y < 25 then
            title_y = title_y + 1.2
        end

        if input.btnp("start") or input.btnp("a") then
            state = "PLAYING"
            timer = 0.0
            audio.play(880, 0.08, 0.04, 'square')
        end
    elseif state == "PLAYING" then
        timer = timer + dt
        
        -- AボタンまたはSTARTでストップ
        if input.btnp("a") or input.btnp("start") then
            state = "STOPPED"
            
            -- 誤差計算
            local diff = math.abs(timer - 10.00)
            if diff < record then
                record = diff
                storage.write("best_diff", record)
            end
            
            -- 音演出
            if diff < 0.05 then
                audio.play(1320, 0.3, 0.05, 'sine') -- ピーン（高音）
            elseif diff < 0.3 then
                audio.play(880, 0.2, 0.04, 'square') -- ピコッ
            else
                audio.play(220, 0.3, 0.06, 'sawtooth') -- ブー
            end
        end
    elseif state == "STOPPED" then
        -- Bボタンでリトライ
        if input.btnp("b") or input.btnp("start") then
            state = "PLAYING"
            timer = 0.0
            audio.play(880, 0.08, 0.04, 'square')
        end
    end
end

function draw()
    screen.clear(0) -- COLOR_BG
    
    -- 飾り外枠
    screen.rect(2, 2, 156, 140, 3, false) -- COLOR_TEXT

    if state == "TITLE" then
        -- タイトル画面
        -- 飾りサイン波
        for x = 3, 156 do
            local y = 72 + math.sin(x * 0.1) * 8
            screen.rect(x, math.floor(y), 1, 1, 2)
        end
        
        screen.rect(15, 25, 130, 94, 0)
        screen.rect(15, 25, 130, 94, 3, false)
        screen.rect(17, 27, 126, 90, 1, false)
    elseif state == "PLAYING" then
        -- プレイ中の時計表示プレート
        screen.rect(15, 35, 130, 74, 0)
        screen.rect(15, 35, 130, 74, 3, false)
        screen.rect(17, 37, 126, 70, 1, false)
    elseif state == "STOPPED" then
        -- リザルト表示プレート
        screen.rect(15, 25, 130, 94, 0)
        screen.rect(15, 25, 130, 94, 3, false)
        screen.rect(17, 27, 126, 90, 1, false)
    end
end
