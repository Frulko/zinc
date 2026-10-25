extends Node2D

var ball = Vector2(400,320)
var velocity = Vector2(180,130)
var paddle = 260.0
var score = 0
var paused = false
var speed = 1.0

func command(action: String):
    if action == "pause":
        paused = not paused
    elif action == "reset":
        ball = Vector2(400,320)
        score = 0
    elif action == "faster":
        speed = min(3.0,speed+0.25)
    queue_redraw()

func snapshot() -> int:
    return score

func _process(delta):
    if not paused:
        paddle = clamp(paddle + (float(Input.is_key_pressed(KEY_DOWN))-float(Input.is_key_pressed(KEY_UP)))*delta*300,40,480)
        ball += velocity * delta * speed
        if ball.y < 25 or ball.y > 615:
            velocity.y = -velocity.y
        if ball.x > 775:
            velocity.x = -abs(velocity.x)
            score += 1
        if ball.x < 50:
            if ball.y >= paddle and ball.y <= paddle+120:
                velocity.x = abs(velocity.x)
                score += 1
            else:
                ball = Vector2(400,320)
    queue_redraw()

func _draw():
    draw_rect(Rect2(20,20,760,600),Color("253e4b"),false,3)
    for index in range(12):
        draw_rect(Rect2(398,index*50+25,4,25),Color("37545d"))
    draw_rect(Rect2(28,paddle,14,120),Color("66d8c7"))
    draw_circle(ball,12,Color("f3ca79"))
