import pygame
import pygame.gfxdraw
import math
import random
import sys
import os
from pygame import surfarray
import numpy as np

# ── Константы ────────────────────────────────────────────────────────────────

W, H = 1280, 800
TOOLBAR_W = 64
TOPBAR_H = 48
PALETTE_H = 52
CANVAS_X = TOOLBAR_W
CANVAS_Y = TOPBAR_H
CANVAS_W = W - TOOLBAR_W
CANVAS_H = H - TOPBAR_H - PALETTE_H

# Тёмная тема
BG         = (30, 30, 30)
PANEL      = (42, 42, 42)
PANEL2     = (50, 50, 50)
BORDER     = (22, 22, 22)
ACCENT     = (80, 140, 220)
TEXT_COL   = (200, 200, 200)
TEXT_DIM   = (120, 120, 120)
BTN_HOV    = (65, 65, 65)
BTN_SEL    = (55, 100, 170)
WHITE      = (255, 255, 255)
BLACK      = (0, 0, 0)

PALETTE = [
    (0,0,0),(255,255,255),(128,128,128),(192,192,192),
    (128,0,0),(255,0,0),(255,102,0),(255,153,0),
    (255,255,0),(0,255,0),(0,128,0),(0,255,255),
    (0,0,255),(0,0,128),(128,0,128),(255,0,255),
    (255,105,180),(255,215,0),(165,42,42),(222,184,135),
    (95,158,160),(127,255,0),(210,105,30),(100,149,237),
    (220,20,60),(0,206,209),(255,20,147),(30,144,255),
    (173,255,47),(255,69,0),(218,112,214),(238,232,170),
]

TOOLS = [
    ("brush",      "✏",  "Кисть"),
    ("pencil",     "╱",  "Карандаш"),
    ("airbrush",   "◎",  "Аэрограф"),
    ("calligraphy","▬",  "Каллиграфия"),
    ("eraser",     "□",  "Ластик"),
    ("fill",       "▓",  "Заливка"),
    ("eyedropper", "◈",  "Пипетка"),
    ("text",       "A",  "Текст"),
    ("line",       "╲",  "Линия"),
    ("rect",       "▭",  "Прямоугольник"),
    ("ellipse",    "○",  "Эллипс"),
    ("triangle",   "△",  "Треугольник"),
    ("star",       "★",  "Звезда"),
    ("spray",      "∷",  "Распылитель"),
]

# ── Вспомогательные функции ───────────────────────────────────────────────────

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def lerp(a, b, t):
    return a + (b - a) * t

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hex(r, g, b):
    return f"#{r:02x}{g:02x}{b:02x}"

def blend_color(src, dst, alpha):
    a = alpha / 255
    return tuple(int(src[i] * a + dst[i] * (1 - a)) for i in range(3))

def draw_rounded_rect(surf, color, rect, r, width=0):
    pygame.draw.rect(surf, color, rect, width, border_radius=r)

def star_points(cx, cy, outer, inner, n=5):
    pts = []
    for i in range(n * 2):
        angle = math.pi * i / n - math.pi / 2
        radius = outer if i % 2 == 0 else inner
        pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return pts

# ── Диалоги ──────────────────────────────────────────────────────────────────

class TextInputDialog:
    """Простой диалог ввода текста поверх экрана."""
    def __init__(self, surf, prompt, default=""):
        self.surf = surf
        self.prompt = prompt
        self.text = default
        self.active = True
        self.font = pygame.font.SysFont("consolas", 18)
        self.w, self.h = 460, 100
        self.x = (W - self.w) // 2
        self.y = (H - self.h) // 2

    def run(self):
        clock = pygame.time.Clock()
        overlay = pygame.Surface((W, H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 160))
        while self.active:
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    return None
                if ev.type == pygame.KEYDOWN:
                    if ev.key == pygame.K_RETURN:
                        return self.text
                    elif ev.key == pygame.K_ESCAPE:
                        return None
                    elif ev.key == pygame.K_BACKSPACE:
                        self.text = self.text[:-1]
                    else:
                        if ev.unicode and ord(ev.unicode) >= 32:
                            self.text += ev.unicode
            self.surf.blit(overlay, (0, 0))
            box = pygame.Rect(self.x, self.y, self.w, self.h)
            draw_rounded_rect(self.surf, PANEL2, box, 8)
            pygame.draw.rect(self.surf, ACCENT, box, 2, border_radius=8)
            label = self.font.render(self.prompt, True, TEXT_COL)
            self.surf.blit(label, (self.x + 14, self.y + 14))
            inp = self.font.render(self.text + "│", True, WHITE)
            self.surf.blit(inp, (self.x + 14, self.y + 56))
            pygame.display.flip()
            clock.tick(60)
        return None


class NumberDialog:
    def __init__(self, surf, prompt, default=24, lo=6, hi=200):
        self.surf = surf
        self.prompt = prompt
        self.text = str(default)
        self.lo, self.hi = lo, hi
        self.font = pygame.font.SysFont("consolas", 18)
        self.w, self.h = 340, 100
        self.x = (W - self.w) // 2
        self.y = (H - self.h) // 2

    def run(self):
        clock = pygame.time.Clock()
        overlay = pygame.Surface((W, H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 160))
        while True:
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    return None
                if ev.type == pygame.KEYDOWN:
                    if ev.key == pygame.K_RETURN:
                        try:
                            return clamp(int(self.text), self.lo, self.hi)
                        except ValueError:
                            return None
                    elif ev.key == pygame.K_ESCAPE:
                        return None
                    elif ev.key == pygame.K_BACKSPACE:
                        self.text = self.text[:-1]
                    elif ev.unicode.isdigit():
                        self.text += ev.unicode
            self.surf.blit(overlay, (0, 0))
            box = pygame.Rect(self.x, self.y, self.w, self.h)
            draw_rounded_rect(self.surf, PANEL2, box, 8)
            pygame.draw.rect(self.surf, ACCENT, box, 2, border_radius=8)
            label = self.font.render(self.prompt, True, TEXT_COL)
            self.surf.blit(label, (self.x + 14, self.y + 14))
            inp = self.font.render(self.text + "│", True, WHITE)
            self.surf.blit(inp, (self.x + 14, self.y + 56))
            pygame.display.flip()
            clock.tick(60)


class ColorPickerDialog:
    """HSV color picker."""
    def __init__(self, surf, initial=(255, 0, 0)):
        self.surf = surf
        self.font = pygame.font.SysFont("consolas", 14)
        self.w, self.h = 400, 340
        self.x = (W - self.w) // 2
        self.y = (H - self.h) // 2
        # initial rgb → hsv
        r, g, b = [c / 255 for c in initial]
        mx = max(r, g, b); mn = min(r, g, b)
        d = mx - mn
        self.s = d / mx if mx else 0
        self.v = mx
        if d == 0:
            self.h_ = 0
        elif mx == r:
            self.h_ = (g - b) / d % 6
        elif mx == g:
            self.h_ = (b - r) / d + 2
        else:
            self.h_ = (r - g) / d + 4
        self.h_ = self.h_ / 6

        self.sv_size = 240
        self.hue_w = 24
        self.dragging_sv = False
        self.dragging_h = False

    def _hsv_to_rgb(self, h, s, v):
        h6 = h * 6
        i = int(h6) % 6
        f = h6 - int(h6)
        p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
        r, g, b = [(v,t,p),(q,v,p),(p,v,t),(p,q,v),(t,p,v),(v,p,q)][i]
        return int(r * 255), int(g * 255), int(b * 255)

    def _render_sv(self):
        sz = self.sv_size
        surf = pygame.Surface((sz, sz))
        hue_rgb = self._hsv_to_rgb(self.h_, 1, 1)
        for bx in range(sz):
            for by in range(sz):
                s = bx / sz; v = 1 - by / sz
                r = int((hue_rgb[0] * s + 255 * (1 - s)) * v)
                g = int((hue_rgb[1] * s + 255 * (1 - s)) * v)
                b = int((hue_rgb[2] * s + 255 * (1 - s)) * v)
                surf.set_at((bx, by), (r, g, b))
        return surf

    def _render_hue_bar(self):
        surf = pygame.Surface((self.hue_w, self.sv_size))
        for py in range(self.sv_size):
            h = py / self.sv_size
            r, g, b = self._hsv_to_rgb(h, 1, 1)
            pygame.draw.line(surf, (r, g, b), (0, py), (self.hue_w, py))
        return surf

    def run(self):
        clock = pygame.time.Clock()
        overlay = pygame.Surface((W, H), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 180))

        sv_x = self.x + 16
        sv_y = self.y + 50
        h_x = sv_x + self.sv_size + 12

        while True:
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    return None
                if ev.type == pygame.KEYDOWN:
                    if ev.key == pygame.K_RETURN:
                        return self._hsv_to_rgb(self.h_, self.s, self.v)
                    if ev.key == pygame.K_ESCAPE:
                        return None
                if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                    mx, my = ev.pos
                    if sv_x <= mx < sv_x + self.sv_size and sv_y <= my < sv_y + self.sv_size:
                        self.dragging_sv = True
                    if h_x <= mx < h_x + self.hue_w and sv_y <= my < sv_y + self.sv_size:
                        self.dragging_h = True
                    # OK button
                    ok = pygame.Rect(self.x + self.w - 90, self.y + self.h - 44, 76, 30)
                    if ok.collidepoint(mx, my):
                        return self._hsv_to_rgb(self.h_, self.s, self.v)
                    cancel = pygame.Rect(self.x + 14, self.y + self.h - 44, 76, 30)
                    if cancel.collidepoint(mx, my):
                        return None
                if ev.type == pygame.MOUSEBUTTONUP:
                    self.dragging_sv = self.dragging_h = False
                if ev.type == pygame.MOUSEMOTION:
                    mx, my = ev.pos
                    if self.dragging_sv:
                        self.s = clamp((mx - sv_x) / self.sv_size, 0, 1)
                        self.v = clamp(1 - (my - sv_y) / self.sv_size, 0, 1)
                    if self.dragging_h:
                        self.h_ = clamp((my - sv_y) / self.sv_size, 0, 1)

            self.surf.blit(overlay, (0, 0))
            box = pygame.Rect(self.x, self.y, self.w, self.h)
            draw_rounded_rect(self.surf, PANEL, box, 10)
            pygame.draw.rect(self.surf, ACCENT, box, 2, border_radius=10)

            title = self.font.render("Выбор цвета  [Enter = OK, Esc = отмена]", True, TEXT_COL)
            self.surf.blit(title, (self.x + 14, self.y + 16))

            sv_surf = self._render_sv()
            self.surf.blit(sv_surf, (sv_x, sv_y))
            pygame.draw.rect(self.surf, WHITE, (sv_x, sv_y, self.sv_size, self.sv_size), 1)

            cx = sv_x + int(self.s * self.sv_size)
            cy = sv_y + int((1 - self.v) * self.sv_size)
            pygame.draw.circle(self.surf, WHITE, (cx, cy), 7, 2)
            pygame.draw.circle(self.surf, BLACK, (cx, cy), 5, 1)

            hue_surf = self._render_hue_bar()
            self.surf.blit(hue_surf, (h_x, sv_y))
            pygame.draw.rect(self.surf, WHITE, (h_x, sv_y, self.hue_w, self.sv_size), 1)
            hy = sv_y + int(self.h_ * self.sv_size)
            pygame.draw.rect(self.surf, WHITE, (h_x - 3, hy - 2, self.hue_w + 6, 4), 2)

            cur_rgb = self._hsv_to_rgb(self.h_, self.s, self.v)
            preview_rect = pygame.Rect(h_x + self.hue_w + 12, sv_y, 56, 56)
            pygame.draw.rect(self.surf, cur_rgb, preview_rect, border_radius=6)
            pygame.draw.rect(self.surf, WHITE, preview_rect, 1, border_radius=6)

            hex_str = rgb_to_hex(*cur_rgb)
            hl = self.font.render(hex_str, True, TEXT_COL)
            self.surf.blit(hl, (h_x + self.hue_w + 12, sv_y + 64))

            ok_r = pygame.Rect(self.x + self.w - 90, self.y + self.h - 44, 76, 30)
            draw_rounded_rect(self.surf, ACCENT, ok_r, 6)
            ok_t = self.font.render("OK", True, WHITE)
            self.surf.blit(ok_t, ok_t.get_rect(center=ok_r.center))

            cn_r = pygame.Rect(self.x + 14, self.y + self.h - 44, 76, 30)
            draw_rounded_rect(self.surf, PANEL2, cn_r, 6)
            cn_t = self.font.render("Отмена", True, TEXT_COL)
            self.surf.blit(cn_t, cn_t.get_rect(center=cn_r.center))

            pygame.display.flip()
            clock.tick(60)

# ── Основной класс ────────────────────────────────────────────────────────────

class PaintApp:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((W, H))
        pygame.display.set_caption("Paint  |  pygame")

        self.font_ui   = pygame.font.SysFont("consolas", 13)
        self.font_tool = pygame.font.SysFont("segoeuisymbol", 18, bold=True)
        self.font_draw = pygame.font.SysFont("arial", 24)

        self.tool = "brush"
        self.color     = (0, 0, 0)
        self.bg_color  = (255, 255, 255)
        self.brush_size = 6
        self.opacity    = 255
        self.fill_shapes = False

        self.canvas = pygame.Surface((CANVAS_W, CANVAS_H))
        self.canvas.fill(WHITE)

        self.history = []
        self.redo_stack = []

        self.drawing = False
        self.start_pos = None
        self.last_pos  = None
        self.temp_canvas = None

        self.filepath = None
        self.status_msg = ""

        self.show_grid = False

        # Tooltip
        self.tooltip = ""
        self.tooltip_timer = 0

        self.clock = pygame.time.Clock()

    # ── История ──────────────────────────────────────────────────────────────

    def _push(self):
        self.history.append(self.canvas.copy())
        if len(self.history) > 50:
            self.history.pop(0)
        self.redo_stack.clear()

    def _undo(self):
        if self.history:
            self.redo_stack.append(self.canvas.copy())
            self.canvas = self.history.pop()

    def _redo(self):
        if self.redo_stack:
            self.history.append(self.canvas.copy())
            self.canvas = self.redo_stack.pop()

    # ── Координаты ───────────────────────────────────────────────────────────

    def _canvas_pos(self, sx, sy):
        return clamp(sx - CANVAS_X, 0, CANVAS_W - 1), clamp(sy - CANVAS_Y, 0, CANVAS_H - 1)

    def _in_canvas(self, sx, sy):
        return CANVAS_X <= sx < CANVAS_X + CANVAS_W and CANVAS_Y <= sy < CANVAS_Y + CANVAS_H

    # ── Инструменты рисования ─────────────────────────────────────────────────

    def _draw_brush(self, surf, x1, y1, x2, y2, col, size):
        steps = max(1, int(math.hypot(x2 - x1, y2 - y1)))
        r = max(1, size // 2)
        for i in range(steps + 1):
            t = i / steps
            cx = int(lerp(x1, x2, t))
            cy = int(lerp(y1, y2, t))
            pygame.draw.circle(surf, col, (cx, cy), r)

    def _draw_pencil(self, surf, x1, y1, x2, y2, col, size):
        w = max(1, size // 4)
        pygame.draw.line(surf, col, (x1, y1), (x2, y2), w)

    def _draw_eraser(self, surf, x1, y1, x2, y2, size):
        steps = max(1, int(math.hypot(x2 - x1, y2 - y1)))
        r = max(2, size)
        for i in range(steps + 1):
            t = i / steps
            cx = int(lerp(x1, x2, t))
            cy = int(lerp(y1, y2, t))
            pygame.draw.circle(surf, WHITE, (cx, cy), r)

    def _draw_airbrush(self, surf, x, y, col, size):
        r = size * 4
        count = size * 3
        for _ in range(count):
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(0, r) ** 0.7
            px = int(x + dist * math.cos(angle))
            py = int(y + dist * math.sin(angle))
            if 0 <= px < CANVAS_W and 0 <= py < CANVAS_H:
                alpha = int(180 * (1 - dist / r))
                c = blend_color(col, surf.get_at((px, py))[:3], alpha)
                surf.set_at((px, py), c)

    def _draw_calligraphy(self, surf, x1, y1, x2, y2, col, size):
        dx = x2 - x1; dy = y2 - y1
        length = math.hypot(dx, dy) or 1
        nx = -dy / length; ny = dx / length
        w = max(2, size); h = max(1, size // 3)
        pts = [
            (int(x1 + nx * w), int(y1 + ny * w)),
            (int(x1 - nx * h), int(y1 - ny * h)),
            (int(x2 - nx * h), int(y2 - ny * h)),
            (int(x2 + nx * w), int(y2 + ny * w)),
        ]
        pygame.draw.polygon(surf, col, pts)

    def _draw_spray(self, surf, x, y, col, size):
        for _ in range(size * 5):
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(0, size * 3)
            px = int(x + dist * math.cos(angle))
            py = int(y + dist * math.sin(angle))
            if 0 <= px < CANVAS_W and 0 <= py < CANVAS_H:
                surf.set_at((px, py), col)

    def _flood_fill(self, x, y, new_col):
        old_col = self.canvas.get_at((x, y))[:3]
        if old_col == new_col[:3]:
            return
        stack = [(x, y)]
        visited = set()
        pxarr = pygame.PixelArray(self.canvas)
        nc = self.canvas.map_rgb(*new_col[:3])
        oc = pxarr[x, y]
        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in visited:
                continue
            if not (0 <= cx < CANVAS_W and 0 <= cy < CANVAS_H):
                continue
            if pxarr[cx, cy] != oc:
                continue
            visited.add((cx, cy))
            pxarr[cx, cy] = nc
            stack += [(cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)]
        del pxarr

    def _draw_shape_preview(self, surf, x0, y0, x1, y1):
        col = self.color
        size = self.brush_size
        fill = col if self.fill_shapes else None

        if self.tool == "line":
            pygame.draw.line(surf, col, (x0, y0), (x1, y1), size)
        elif self.tool == "rect":
            r = pygame.Rect(min(x0,x1), min(y0,y1), abs(x1-x0), abs(y1-y0))
            if fill:
                pygame.draw.rect(surf, fill, r)
            pygame.draw.rect(surf, col, r, size)
        elif self.tool == "ellipse":
            r = pygame.Rect(min(x0,x1), min(y0,y1), abs(x1-x0), abs(y1-y0))
            if r.width > 0 and r.height > 0:
                if fill:
                    pygame.draw.ellipse(surf, fill, r)
                pygame.draw.ellipse(surf, col, r, size)
        elif self.tool == "triangle":
            cx = (x0 + x1) // 2
            pts = [(cx, y0), (x0, y1), (x1, y1)]
            if fill:
                pygame.draw.polygon(surf, fill, pts)
            pygame.draw.polygon(surf, col, pts, size)
        elif self.tool == "star":
            cx = (x0 + x1) // 2; cy = (y0 + y1) // 2
            outer = max(1, min(abs(x1-x0), abs(y1-y0)) // 2)
            inner = max(1, outer // 2)
            pts = [(int(px), int(py)) for px, py in star_points(cx, cy, outer, inner)]
            if fill:
                pygame.draw.polygon(surf, fill, pts)
            pygame.draw.polygon(surf, col, pts, size)

    def _commit_shape(self, x0, y0, x1, y1):
        self._draw_shape_preview(self.canvas, x0, y0, x1, y1)

    def _add_text(self, x, y):
        text = TextInputDialog(self.screen, "Введите текст:").run()
        if not text:
            return
        size = NumberDialog(self.screen, "Размер шрифта:", 32, 6, 200).run()
        if not size:
            size = 32
        font = pygame.font.SysFont("arial", size)
        surf = font.render(text, True, self.color)
        self._push()
        self.canvas.blit(surf, (x, y))

    def _eyedropper(self, x, y):
        self.color = self.canvas.get_at((x, y))[:3]

    # ── Файлы ────────────────────────────────────────────────────────────────

    def _save(self):
        if self.filepath:
            pygame.image.save(self.canvas, self.filepath)
            self.status_msg = f"Сохранено: {os.path.basename(self.filepath)}"
        else:
            self._save_as()

    def _save_as(self):
        # pygame не имеет диалогов - используем tkinter минимально
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk(); root.withdraw()
            path = filedialog.asksaveasfilename(
                defaultextension=".png",
                filetypes=[("PNG","*.png"),("JPEG","*.jpg"),("BMP","*.bmp")]
            )
            root.destroy()
            if path:
                self.filepath = path
                pygame.image.save(self.canvas, path)
                self.status_msg = f"Сохранено: {os.path.basename(path)}"
        except Exception as e:
            self.status_msg = f"Ошибка: {e}"

    def _open(self):
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk(); root.withdraw()
            path = filedialog.askopenfilename(
                filetypes=[("Изображения","*.png *.jpg *.jpeg *.bmp *.gif"),("Все","*.*")]
            )
            root.destroy()
            if path:
                img = pygame.image.load(path).convert()
                img = pygame.transform.scale(img, (CANVAS_W, CANVAS_H))
                self._push()
                self.canvas.blit(img, (0, 0))
                self.filepath = path
                self.status_msg = f"Открыто: {os.path.basename(path)}"
        except Exception as e:
            self.status_msg = f"Ошибка: {e}"

    def _clear(self):
        self._push()
        self.canvas.fill(WHITE)

    # ── UI ───────────────────────────────────────────────────────────────────

    def _draw_toolbar(self):
        pygame.draw.rect(self.screen, PANEL, (0, TOPBAR_H, TOOLBAR_W, H - TOPBAR_H))
        pygame.draw.line(self.screen, BORDER, (TOOLBAR_W, TOPBAR_H), (TOOLBAR_W, H), 1)

        for i, (name, icon, tip) in enumerate(TOOLS):
            bx, by = 4, TOPBAR_H + 4 + i * 46
            br = pygame.Rect(bx, by, TOOLBAR_W - 8, 40)
            sel = self.tool == name
            col = BTN_SEL if sel else PANEL2
            draw_rounded_rect(self.screen, col, br, 6)
            if sel:
                pygame.draw.rect(self.screen, ACCENT, br, 2, border_radius=6)

            ic = self.font_tool.render(icon, True, WHITE if sel else TEXT_COL)
            self.screen.blit(ic, ic.get_rect(center=br.center))

            mx, my = pygame.mouse.get_pos()
            if br.collidepoint(mx, my):
                self.tooltip = tip
                self.tooltip_timer = 90

        # fill toggle
        fy = TOPBAR_H + 4 + len(TOOLS) * 46 + 4
        fr = pygame.Rect(4, fy, TOOLBAR_W - 8, 22)
        draw_rounded_rect(self.screen, BTN_SEL if self.fill_shapes else PANEL2, fr, 4)
        ft = self.font_ui.render("Залить", True, WHITE)
        self.screen.blit(ft, ft.get_rect(center=fr.center))

    def _draw_topbar(self):
        pygame.draw.rect(self.screen, PANEL, (0, 0, W, TOPBAR_H))
        pygame.draw.line(self.screen, BORDER, (0, TOPBAR_H), (W, TOPBAR_H), 1)

        x = TOOLBAR_W + 8

        # Файл
        for label, key in [("Новый","N"), ("Открыть","O"), ("Сохранить","S")]:
            bw = 80
            r = pygame.Rect(x, 8, bw, 32)
            mx, my = pygame.mouse.get_pos()
            col = BTN_HOV if r.collidepoint(mx, my) else PANEL2
            draw_rounded_rect(self.screen, col, r, 6)
            t = self.font_ui.render(label, True, TEXT_COL)
            self.screen.blit(t, t.get_rect(center=r.center))
            x += bw + 4

        x += 12
        pygame.draw.line(self.screen, BORDER, (x, 8), (x, TOPBAR_H - 8), 1)
        x += 12

        # Undo / Redo
        for label in ["← Undo", "Redo →"]:
            bw = 72
            r = pygame.Rect(x, 8, bw, 32)
            mx, my = pygame.mouse.get_pos()
            col = BTN_HOV if r.collidepoint(mx, my) else PANEL2
            draw_rounded_rect(self.screen, col, r, 6)
            t = self.font_ui.render(label, True, TEXT_COL)
            self.screen.blit(t, t.get_rect(center=r.center))
            x += bw + 4

        x += 12
        pygame.draw.line(self.screen, BORDER, (x, 8), (x, TOPBAR_H - 8), 1)
        x += 16

        # Размер кисти
        lbl = self.font_ui.render("Размер:", True, TEXT_DIM)
        self.screen.blit(lbl, (x, 16))
        x += lbl.get_width() + 8
        # Слайдер
        sx = x; sw = 100; sh = 6; sy = 24
        pygame.draw.rect(self.screen, BORDER, (sx, sy, sw, sh), border_radius=3)
        fill_w = int(self.brush_size / 80 * sw)
        pygame.draw.rect(self.screen, ACCENT, (sx, sy, fill_w, sh), border_radius=3)
        knob_x = sx + fill_w
        pygame.draw.circle(self.screen, WHITE, (knob_x, sy + sh // 2), 7)
        self.slider_rect = pygame.Rect(sx, sy - 8, sw, sh + 16)
        x += sw + 12

        sv = self.font_ui.render(str(self.brush_size), True, TEXT_COL)
        self.screen.blit(sv, (x, 16))
        x += 28

        # Прозрачность
        lbl2 = self.font_ui.render("Прозр:", True, TEXT_DIM)
        self.screen.blit(lbl2, (x, 16))
        x += lbl2.get_width() + 8
        sx2 = x; sy2 = 24
        pygame.draw.rect(self.screen, BORDER, (sx2, sy2, sw, sh), border_radius=3)
        op_pct = self.opacity / 255
        pygame.draw.rect(self.screen, ACCENT, (sx2, sy2, int(op_pct * sw), sh), border_radius=3)
        pygame.draw.circle(self.screen, WHITE, (sx2 + int(op_pct * sw), sy2 + sh // 2), 7)
        self.opacity_slider = pygame.Rect(sx2, sy2 - 8, sw, sh + 16)
        x += sw + 8

        op_v = self.font_ui.render(f"{int(op_pct*100)}%", True, TEXT_COL)
        self.screen.blit(op_v, (x, 16))
        x += 44

        # Цвета
        pygame.draw.rect(self.screen, self.color, (x, 8, 32, 32), border_radius=4)
        pygame.draw.rect(self.screen, WHITE, (x, 8, 32, 32), 1, border_radius=4)
        self.color_btn = pygame.Rect(x, 8, 32, 32)
        x += 36

        pygame.draw.rect(self.screen, self.bg_color, (x, 8, 32, 32), border_radius=4)
        pygame.draw.rect(self.screen, TEXT_DIM, (x, 8, 32, 32), 1, border_radius=4)
        self.bg_btn = pygame.Rect(x, 8, 32, 32)
        x += 44

        # Сетка
        gr = pygame.Rect(x, 8, 56, 32)
        mx, my = pygame.mouse.get_pos()
        draw_rounded_rect(self.screen, BTN_SEL if self.show_grid else PANEL2, gr, 6)
        gt = self.font_ui.render("Сетка", True, WHITE)
        self.screen.blit(gt, gt.get_rect(center=gr.center))
        self.grid_btn = gr
        x += 64

        # Очистить
        cr = pygame.Rect(x, 8, 72, 32)
        draw_rounded_rect(self.screen, (80, 40, 40), cr, 6)
        ct = self.font_ui.render("Очистить", True, (255, 120, 120))
        self.screen.blit(ct, ct.get_rect(center=cr.center))
        self.clear_btn = cr

    def _draw_palette(self):
        py = H - PALETTE_H
        pygame.draw.rect(self.screen, PANEL, (0, py, W, PALETTE_H))
        pygame.draw.line(self.screen, BORDER, (0, py), (W, py), 1)

        lbl = self.font_ui.render("Палитра:", True, TEXT_DIM)
        self.screen.blit(lbl, (TOOLBAR_W + 6, py + 16))
        px = TOOLBAR_W + 70

        sz = 20; gap = 3
        row2 = len(PALETTE) // 2

        for i, col in enumerate(PALETTE):
            row = i // row2
            col_idx = i % row2
            bx = px + col_idx * (sz + gap)
            by = py + 4 + row * (sz + gap // 2 + 1)
            r = pygame.Rect(bx, by, sz, sz)
            pygame.draw.rect(self.screen, col, r, border_radius=3)
            if col == self.color:
                pygame.draw.rect(self.screen, WHITE, r, 2, border_radius=3)
            elif col == self.bg_color:
                pygame.draw.rect(self.screen, TEXT_DIM, r, 1, border_radius=3)

        # + кнопка
        add_x = px + row2 * (sz + gap) + 8
        add_r = pygame.Rect(add_x, py + 12, 28, 28)
        draw_rounded_rect(self.screen, PANEL2, add_r, 4)
        at = self.font_tool.render("+", True, ACCENT)
        self.screen.blit(at, at.get_rect(center=add_r.center))
        self.palette_add_btn = add_r

        # Статус справа
        st = self.font_ui.render(self.status_msg, True, TEXT_DIM)
        self.screen.blit(st, (W - st.get_width() - 12, py + 18))

    def _draw_canvas_area(self):
        # Серый фон вокруг холста
        pygame.draw.rect(self.screen, (55, 55, 55),
                         (CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H))

        if self.temp_canvas and self.drawing and self.tool in ("line","rect","ellipse","triangle","star"):
            disp = self.temp_canvas.copy()
        else:
            disp = self.canvas

        self.screen.blit(disp, (CANVAS_X, CANVAS_Y))

        # Сетка
        if self.show_grid:
            grid_step = 32
            for gx in range(0, CANVAS_W, grid_step):
                pygame.draw.line(self.screen, (100,100,100),
                                 (CANVAS_X + gx, CANVAS_Y),
                                 (CANVAS_X + gx, CANVAS_Y + CANVAS_H), 1)
            for gy in range(0, CANVAS_H, grid_step):
                pygame.draw.line(self.screen, (100,100,100),
                                 (CANVAS_X, CANVAS_Y + gy),
                                 (CANVAS_X + CANVAS_W, CANVAS_Y + gy), 1)

        # Рамка холста
        pygame.draw.rect(self.screen, BORDER,
                         (CANVAS_X - 1, CANVAS_Y - 1, CANVAS_W + 2, CANVAS_H + 2), 1)

    def _draw_cursor_preview(self):
        mx, my = pygame.mouse.get_pos()
        if self._in_canvas(mx, my) and self.tool in ("brush","eraser","pencil","airbrush","calligraphy","spray"):
            r = max(2, self.brush_size // 2 if self.tool != "eraser" else self.brush_size)
            pygame.draw.circle(self.screen, (200, 200, 200), (mx, my), r, 1)

    def _draw_tooltip(self):
        if self.tooltip_timer > 0 and self.tooltip:
            self.tooltip_timer -= 1
            mx, my = pygame.mouse.get_pos()
            surf = self.font_ui.render(self.tooltip, True, WHITE)
            bx = mx + 14; by = my - 6
            br = pygame.Rect(bx - 4, by - 2, surf.get_width() + 8, surf.get_height() + 4)
            draw_rounded_rect(self.screen, (30, 30, 30), br, 4)
            pygame.draw.rect(self.screen, ACCENT, br, 1, border_radius=4)
            self.screen.blit(surf, (bx, by))
        else:
            self.tooltip = ""

    # ── Клики топбара ────────────────────────────────────────────────────────

    def _handle_topbar_click(self, mx, my):
        x = TOOLBAR_W + 8
        labels = [("Новый", 80), ("Открыть", 80), ("Сохранить", 80)]
        for label, bw in labels:
            r = pygame.Rect(x, 8, bw, 32)
            if r.collidepoint(mx, my):
                if label == "Новый":
                    self._push(); self.canvas.fill(WHITE); self.filepath = None
                elif label == "Открыть":
                    self._open()
                elif label == "Сохранить":
                    self._save()
                return
            x += bw + 4

        x += 24
        for label, bw in [("← Undo", 72), ("Redo →", 72)]:
            r = pygame.Rect(x, 8, bw, 32)
            if r.collidepoint(mx, my):
                if "Undo" in label:
                    self._undo()
                else:
                    self._redo()
                return
            x += bw + 4

        if hasattr(self, "color_btn") and self.color_btn.collidepoint(mx, my):
            result = ColorPickerDialog(self.screen, self.color).run()
            if result:
                self.color = result

        if hasattr(self, "bg_btn") and self.bg_btn.collidepoint(mx, my):
            result = ColorPickerDialog(self.screen, self.bg_color).run()
            if result:
                self.bg_color = result

        if hasattr(self, "grid_btn") and self.grid_btn.collidepoint(mx, my):
            self.show_grid = not self.show_grid

        if hasattr(self, "clear_btn") and self.clear_btn.collidepoint(mx, my):
            self._clear()

    def _handle_slider(self, mx, my):
        if hasattr(self, "slider_rect") and self.slider_rect.collidepoint(mx, my):
            rel = clamp((mx - self.slider_rect.x) / self.slider_rect.width, 0, 1)
            self.brush_size = max(1, int(rel * 80))
            return True
        if hasattr(self, "opacity_slider") and self.opacity_slider.collidepoint(mx, my):
            rel = clamp((mx - self.opacity_slider.x) / self.opacity_slider.width, 0, 1)
            self.opacity = int(rel * 255)
            return True
        return False

    def _handle_palette_click(self, mx, my, right=False):
        py = H - PALETTE_H
        px = TOOLBAR_W + 70
        sz = 20; gap = 3
        row2 = len(PALETTE) // 2

        for i, col in enumerate(PALETTE):
            row = i // row2
            col_idx = i % row2
            bx = px + col_idx * (sz + gap)
            by = py + 4 + row * (sz + gap // 2 + 1)
            r = pygame.Rect(bx, by, sz, sz)
            if r.collidepoint(mx, my):
                if right:
                    self.bg_color = col
                else:
                    self.color = col
                return

        if hasattr(self, "palette_add_btn") and self.palette_add_btn.collidepoint(mx, my):
            result = ColorPickerDialog(self.screen, self.color).run()
            if result:
                PALETTE.append(result)
                if not right:
                    self.color = result

    def _handle_toolbar_click(self, mx, my):
        for i, (name, icon, tip) in enumerate(TOOLS):
            bx, by = 4, TOPBAR_H + 4 + i * 46
            br = pygame.Rect(bx, by, TOOLBAR_W - 8, 40)
            if br.collidepoint(mx, my):
                self.tool = name
                return

        fy = TOPBAR_H + 4 + len(TOOLS) * 46 + 4
        fr = pygame.Rect(4, fy, TOOLBAR_W - 8, 22)
        if fr.collidepoint(mx, my):
            self.fill_shapes = not self.fill_shapes

    # ── Главный цикл ─────────────────────────────────────────────────────────

    def run(self):
        dragging_slider = None

        while True:
            self.screen.fill(BG)
            self._draw_canvas_area()
            self._draw_toolbar()
            self._draw_topbar()
            self._draw_palette()
            self._draw_cursor_preview()
            self._draw_tooltip()
            pygame.display.flip()
            self.clock.tick(60)

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit(); sys.exit()

                # ── Клавиши ──
                if event.type == pygame.KEYDOWN:
                    ctrl = pygame.key.get_mods() & pygame.KMOD_CTRL
                    if ctrl and event.key == pygame.K_z:
                        self._undo()
                    elif ctrl and event.key == pygame.K_y:
                        self._redo()
                    elif ctrl and event.key == pygame.K_s:
                        self._save()
                    elif ctrl and event.key == pygame.K_o:
                        self._open()
                    elif ctrl and event.key == pygame.K_n:
                        self._push(); self.canvas.fill(WHITE); self.filepath = None
                    elif event.key == pygame.K_EQUALS or event.key == pygame.K_PLUS:
                        self.brush_size = min(80, self.brush_size + 1)
                    elif event.key == pygame.K_MINUS:
                        self.brush_size = max(1, self.brush_size - 1)
                    elif event.key == pygame.K_b:
                        self.tool = "brush"
                    elif event.key == pygame.K_e:
                        self.tool = "eraser"
                    elif event.key == pygame.K_f:
                        self.tool = "fill"
                    elif event.key == pygame.K_t:
                        self.tool = "text"
                    elif event.key == pygame.K_p:
                        self.tool = "pencil"
                    elif event.key == pygame.K_i:
                        self.tool = "eyedropper"
                    elif event.key == pygame.K_l:
                        self.tool = "line"
                    elif event.key == pygame.K_r:
                        self.tool = "rect"
                    elif event.key == pygame.K_c:
                        self.tool = "ellipse"
                    elif event.key == pygame.K_g:
                        self.show_grid = not self.show_grid

                # ── Колесо ──
                if event.type == pygame.MOUSEWHEEL:
                    self.brush_size = clamp(self.brush_size + event.y, 1, 80)

                # ── LMB ──
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    mx, my = event.pos

                    # Слайдеры
                    if self._handle_slider(mx, my):
                        dragging_slider = "size" if self.slider_rect.collidepoint(mx, my) else "opacity"
                        continue

                    # Топбар
                    if my < TOPBAR_H:
                        self._handle_topbar_click(mx, my)
                        continue

                    # Тулбар
                    if mx < TOOLBAR_W:
                        self._handle_toolbar_click(mx, my)
                        continue

                    # Палитра
                    if my >= H - PALETTE_H:
                        self._handle_palette_click(mx, my, right=False)
                        continue

                    # Холст
                    if self._in_canvas(mx, my):
                        cx, cy = self._canvas_pos(mx, my)
                        if self.tool == "fill":
                            self._push()
                            self._flood_fill(cx, cy, self.color)
                        elif self.tool == "eyedropper":
                            self._eyedropper(cx, cy)
                        elif self.tool == "text":
                            self._add_text(cx, cy)
                        else:
                            self._push()
                            self.drawing = True
                            self.start_pos = (cx, cy)
                            self.last_pos = (cx, cy)
                            if self.tool in ("line","rect","ellipse","triangle","star"):
                                self.temp_canvas = self.canvas.copy()

                # ── RMB - цвет фона ──
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 3:
                    mx, my = event.pos
                    if my >= H - PALETTE_H:
                        self._handle_palette_click(mx, my, right=True)
                    elif self._in_canvas(mx, my) and self.tool == "eyedropper":
                        cx, cy = self._canvas_pos(mx, my)
                        self.bg_color = self.canvas.get_at((cx, cy))[:3]

                if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    dragging_slider = None
                    if self.drawing:
                        mx, my = event.pos
                        if self._in_canvas(mx, my):
                            cx, cy = self._canvas_pos(mx, my)
                            if self.tool in ("line","rect","ellipse","triangle","star"):
                                self._commit_shape(*self.start_pos, cx, cy)
                                self.temp_canvas = None
                        self.drawing = False

                if event.type == pygame.MOUSEMOTION:
                    mx, my = event.pos

                    # Слайдеры
                    if dragging_slider:
                        if dragging_slider == "size":
                            rel = clamp((mx - self.slider_rect.x) / self.slider_rect.width, 0, 1)
                            self.brush_size = max(1, int(rel * 80))
                        else:
                            rel = clamp((mx - self.opacity_slider.x) / self.opacity_slider.width, 0, 1)
                            self.opacity = int(rel * 255)
                        continue

                    if self.drawing and self._in_canvas(mx, my):
                        cx, cy = self._canvas_pos(mx, my)
                        col = blend_color(self.color,
                                          self.canvas.get_at((cx, cy))[:3],
                                          self.opacity) if self.opacity < 255 else self.color

                        if self.tool == "brush":
                            self._draw_brush(self.canvas, *self.last_pos, cx, cy, col, self.brush_size)
                        elif self.tool == "pencil":
                            self._draw_pencil(self.canvas, *self.last_pos, cx, cy, col, self.brush_size)
                        elif self.tool == "eraser":
                            self._draw_eraser(self.canvas, *self.last_pos, cx, cy, self.brush_size)
                        elif self.tool == "airbrush":
                            self._draw_airbrush(self.canvas, cx, cy, col, self.brush_size)
                        elif self.tool == "calligraphy":
                            self._draw_calligraphy(self.canvas, *self.last_pos, cx, cy, col, self.brush_size)
                        elif self.tool == "spray":
                            self._draw_spray(self.canvas, cx, cy, col, self.brush_size)
                        elif self.tool in ("line","rect","ellipse","triangle","star"):
                            disp = self.temp_canvas.copy()
                            self._draw_shape_preview(disp, *self.start_pos, cx, cy)
                            self.canvas.blit(disp, (0, 0))

                        self.last_pos = (cx, cy)


def main():
    app = PaintApp()
    print("Горячие клавиши:")
    print("  B=кисть, P=карандаш, E=ластик, F=заливка")
    print("  T=текст, I=пипетка, L=линия, R=прямоугольник, C=эллипс")
    print("  G=сетка, +/-=размер кисти, колесо=размер")
    print("  Ctrl+Z/Y=undo/redo, Ctrl+S=сохранить, Ctrl+O=открыть, Ctrl+N=новый")
    app.run()


if __name__ == "__main__":
    main()
