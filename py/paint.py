import tkinter as tk
from tkinter import colorchooser, filedialog, simpledialog, ttk
from PIL import Image, ImageDraw, ImageFont, ImageTk, ImageFilter
import math

class Paint:
    def __init__(self, root):
        self.root = root
        self.root.title("Paint")
        self.root.state("zoomed")

        # Состояние
        self.tool = "brush"
        self.color = "#000000"
        self.bg_color = "#ffffff"
        self.brush_size = 4
        self.canvas_w = 1200
        self.canvas_h = 800
        self.opacity = 255

        self.history = []
        self.redo_stack = []
        self.start_x = self.start_y = 0
        self.last_x = self.last_y = None
        self.temp_item = None
        self.text_item = None
        self.fill_shape = tk.BooleanVar(value=False)

        self._build_ui()
        self._new_canvas()
        self._bind_events()

    def _build_ui(self):
        self.root.configure(bg="#2b2b2b")

        # Меню
        menubar = tk.Menu(self.root)
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="Новый", accelerator="Ctrl+N", command=self._new_canvas)
        file_menu.add_command(label="Открыть", accelerator="Ctrl+O", command=self._open)
        file_menu.add_separator()
        file_menu.add_command(label="Сохранить", accelerator="Ctrl+S", command=self._save)
        file_menu.add_command(label="Сохранить как...", command=self._save_as)
        file_menu.add_separator()
        file_menu.add_command(label="Выход", command=self.root.quit)
        menubar.add_cascade(label="Файл", menu=file_menu)

        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Отменить", accelerator="Ctrl+Z", command=self._undo)
        edit_menu.add_command(label="Повторить", accelerator="Ctrl+Y", command=self._redo)
        edit_menu.add_separator()
        edit_menu.add_command(label="Очистить холст", command=self._clear)
        menubar.add_cascade(label="Правка", menu=edit_menu)

        image_menu = tk.Menu(menubar, tearoff=0)
        image_menu.add_command(label="Размытие", command=lambda: self._apply_filter("blur"))
        image_menu.add_command(label="Резкость", command=lambda: self._apply_filter("sharpen"))
        image_menu.add_command(label="Контур", command=lambda: self._apply_filter("edges"))
        image_menu.add_separator()
        image_menu.add_command(label="Перевернуть по горизонтали", command=lambda: self._flip("h"))
        image_menu.add_command(label="Перевернуть по вертикали", command=lambda: self._flip("v"))
        image_menu.add_command(label="Повернуть 90°", command=self._rotate)
        menubar.add_cascade(label="Изображение", menu=image_menu)

        self.root.config(menu=menubar)

        # Горячие клавиши
        self.root.bind("<Control-n>", lambda e: self._new_canvas())
        self.root.bind("<Control-o>", lambda e: self._open())
        self.root.bind("<Control-s>", lambda e: self._save())
        self.root.bind("<Control-z>", lambda e: self._undo())
        self.root.bind("<Control-y>", lambda e: self._redo())

        # Основной layout
        outer = tk.Frame(self.root, bg="#2b2b2b")
        outer.pack(fill=tk.BOTH, expand=True)

        # Левая панель инструментов
        left = tk.Frame(outer, bg="#3c3c3c", width=70, relief=tk.FLAT)
        left.pack(side=tk.LEFT, fill=tk.Y, padx=(4, 0), pady=4)
        left.pack_propagate(False)
        self._build_tools(left)

        # Правая часть
        right = tk.Frame(outer, bg="#2b2b2b")
        right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=4, pady=4)

        # Верхняя панель настроек
        top = tk.Frame(right, bg="#3c3c3c", height=48)
        top.pack(side=tk.TOP, fill=tk.X, pady=(0, 4))
        top.pack_propagate(False)
        self._build_top(top)

        # Холст с прокруткой
        canvas_frame = tk.Frame(right, bg="#1a1a1a")
        canvas_frame.pack(fill=tk.BOTH, expand=True)

        self.hbar = tk.Scrollbar(canvas_frame, orient=tk.HORIZONTAL)
        self.hbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.vbar = tk.Scrollbar(canvas_frame, orient=tk.VERTICAL)
        self.vbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.canvas = tk.Canvas(
            canvas_frame,
            bg="#888888",
            cursor="crosshair",
            xscrollcommand=self.hbar.set,
            yscrollcommand=self.vbar.set,
            scrollregion=(0, 0, self.canvas_w + 40, self.canvas_h + 40)
        )
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.hbar.config(command=self.canvas.xview)
        self.vbar.config(command=self.canvas.yview)

        # Строка статуса
        self.status = tk.Label(right, text="", bg="#2b2b2b", fg="#aaaaaa",
                               anchor=tk.W, font=("Consolas", 9))
        self.status.pack(side=tk.BOTTOM, fill=tk.X)

        # Нижняя палитра
        bottom = tk.Frame(right, bg="#3c3c3c", height=44)
        bottom.pack(side=tk.BOTTOM, fill=tk.X, pady=(4, 0))
        bottom.pack_propagate(False)
        self._build_palette(bottom)

    def _build_tools(self, parent):
        tools = [
            ("✏️", "brush", "Кисть"),
            ("✒️", "pencil", "Карандаш"),
            ("🖌️", "airbrush", "Аэрограф"),
            ("🖊️", "calligraphy", "Каллиграфия"),
            ("⬜", "rect", "Прямоугольник"),
            ("⭕", "ellipse", "Эллипс"),
            ("📐", "line", "Линия"),
            ("△", "triangle", "Треугольник"),
            ("⭐", "star", "Звезда"),
            ("🪣", "fill", "Заливка"),
            ("💧", "eyedropper", "Пипетка"),
            ("🔤", "text", "Текст"),
            ("🩹", "eraser", "Ластик"),
            ("🔲", "select", "Выделение"),
        ]

        self.tool_btns = {}
        tk.Label(parent, text="Инструменты", bg="#3c3c3c", fg="#aaaaaa",
                 font=("Arial", 7)).pack(pady=(6, 2))

        for icon, name, tip in tools:
            btn = tk.Button(
                parent, text=icon, width=3, height=1,
                relief=tk.FLAT, bg="#3c3c3c", fg="white",
                activebackground="#555", font=("Arial", 14),
                command=lambda n=name: self._set_tool(n)
            )
            btn.pack(padx=4, pady=1)
            btn.bind("<Enter>", lambda e, t=tip: self.status.config(text=t))
            btn.bind("<Leave>", lambda e: self.status.config(text=""))
            self.tool_btns[name] = btn

        tk.Checkbutton(
            parent, text="Залить", variable=self.fill_shape,
            bg="#3c3c3c", fg="#cccccc", selectcolor="#555",
            activebackground="#3c3c3c", font=("Arial", 8)
        ).pack(pady=(8, 0))

        self._set_tool("brush")

    def _build_top(self, parent):
        tk.Label(parent, text="Размер:", bg="#3c3c3c", fg="#ccc",
                 font=("Arial", 9)).pack(side=tk.LEFT, padx=(10, 4))

        self.size_var = tk.IntVar(value=4)
        size_scale = tk.Scale(
            parent, from_=1, to=80, orient=tk.HORIZONTAL,
            variable=self.size_var, bg="#3c3c3c", fg="#ccc",
            troughcolor="#555", highlightthickness=0, length=120,
            command=lambda v: setattr(self, "brush_size", int(v))
        )
        size_scale.pack(side=tk.LEFT)

        tk.Label(parent, text="Прозрачность:", bg="#3c3c3c", fg="#ccc",
                 font=("Arial", 9)).pack(side=tk.LEFT, padx=(16, 4))

        self.opacity_var = tk.IntVar(value=100)
        opacity_scale = tk.Scale(
            parent, from_=1, to=100, orient=tk.HORIZONTAL,
            variable=self.opacity_var, bg="#3c3c3c", fg="#ccc",
            troughcolor="#555", highlightthickness=0, length=100,
            command=lambda v: setattr(self, "opacity", int(int(v) * 2.55))
        )
        opacity_scale.pack(side=tk.LEFT)

        # Текущий цвет (ПКМ - фоновый)
        tk.Label(parent, text="   Цвет:", bg="#3c3c3c", fg="#ccc",
                 font=("Arial", 9)).pack(side=tk.LEFT, padx=(16, 4))

        self.color_btn = tk.Button(
            parent, bg=self.color, width=3, height=1,
            relief=tk.RAISED, command=self._pick_color
        )
        self.color_btn.pack(side=tk.LEFT, padx=2)

        tk.Label(parent, text="Фон:", bg="#3c3c3c", fg="#ccc",
                 font=("Arial", 9)).pack(side=tk.LEFT, padx=(8, 4))

        self.bg_btn = tk.Button(
            parent, bg=self.bg_color, width=3, height=1,
            relief=tk.RAISED, command=self._pick_bg_color
        )
        self.bg_btn.pack(side=tk.LEFT, padx=2)

        # Размер холста
        tk.Label(parent, text="  Холст:", bg="#3c3c3c", fg="#ccc",
                 font=("Arial", 9)).pack(side=tk.LEFT, padx=(16, 4))

        self.w_var = tk.IntVar(value=1200)
        self.h_var = tk.IntVar(value=800)

        tk.Entry(parent, textvariable=self.w_var, width=5,
                 bg="#555", fg="white", insertbackground="white").pack(side=tk.LEFT)
        tk.Label(parent, text="×", bg="#3c3c3c", fg="#ccc").pack(side=tk.LEFT, padx=2)
        tk.Entry(parent, textvariable=self.h_var, width=5,
                 bg="#555", fg="white", insertbackground="white").pack(side=tk.LEFT)

        tk.Button(parent, text="Применить", bg="#555", fg="white",
                  relief=tk.FLAT, font=("Arial", 9),
                  command=self._resize_canvas).pack(side=tk.LEFT, padx=8)

    def _build_palette(self, parent):
        colors = [
            "#000000", "#ffffff", "#808080", "#c0c0c0",
            "#800000", "#ff0000", "#ff6600", "#ff9900",
            "#ffff00", "#00ff00", "#008000", "#00ffff",
            "#0000ff", "#000080", "#800080", "#ff00ff",
            "#ff69b4", "#ffd700", "#a52a2a", "#deb887",
            "#5f9ea0", "#7fff00", "#d2691e", "#6495ed",
            "#dc143c", "#00ced1", "#ff1493", "#1e90ff",
            "#adff2f", "#ff4500", "#da70d6", "#eee8aa",
        ]

        tk.Label(parent, text="Палитра:", bg="#3c3c3c", fg="#aaa",
                 font=("Arial", 8)).pack(side=tk.LEFT, padx=6)

        palette_frame = tk.Frame(parent, bg="#3c3c3c")
        palette_frame.pack(side=tk.LEFT)

        row1 = tk.Frame(palette_frame, bg="#3c3c3c")
        row1.pack()
        row2 = tk.Frame(palette_frame, bg="#3c3c3c")
        row2.pack()

        for i, c in enumerate(colors):
            row = row1 if i < 16 else row2
            btn = tk.Button(row, bg=c, width=2, height=1, relief=tk.RAISED,
                            command=lambda col=c: self._set_color(col))
            btn.pack(side=tk.LEFT, padx=1, pady=1)
            btn.bind("<Button-3>", lambda e, col=c: self._set_bg_color(col))

        tk.Button(parent, text="+ Цвет", bg="#444", fg="white", relief=tk.FLAT,
                  font=("Arial", 8), command=self._pick_color).pack(side=tk.LEFT, padx=8)

    def _bind_events(self):
        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.canvas.bind("<Motion>", self._on_move)
        self.canvas.bind("<Button-3>", self._on_right_press)
        self.canvas.bind("<B3-Motion>", self._on_right_drag)
        self.canvas.bind("<MouseWheel>", self._on_scroll)

    # ── Холст ────────────────────────────────────────────────
    def _new_canvas(self):
        w = getattr(self, "w_var", None)
        h = getattr(self, "h_var", None)
        self.canvas_w = w.get() if w else 1200
        self.canvas_h = h.get() if h else 800
        self.image = Image.new("RGBA", (self.canvas_w, self.canvas_h), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.history.clear()
        self.redo_stack.clear()
        self.filepath = None
        self._refresh()

    def _refresh(self):
        self.tk_image = ImageTk.PhotoImage(self.image)
        self.canvas.delete("all")
        self.canvas.create_image(20, 20, anchor=tk.NW, image=self.tk_image)
        self.canvas.config(scrollregion=(0, 0, self.canvas_w + 40, self.canvas_h + 40))

    def _canvas_coords(self, event):
        x = self.canvas.canvasx(event.x) - 20
        y = self.canvas.canvasy(event.y) - 20
        return int(x), int(y)

    def _push_history(self):
        self.history.append(self.image.copy())
        if len(self.history) > 50:
            self.history.pop(0)
        self.redo_stack.clear()

    def _undo(self):
        if self.history:
            self.redo_stack.append(self.image.copy())
            self.image = self.history.pop()
            self.draw = ImageDraw.Draw(self.image)
            self._refresh()

    def _redo(self):
        if self.redo_stack:
            self.history.append(self.image.copy())
            self.image = self.redo_stack.pop()
            self.draw = ImageDraw.Draw(self.image)
            self._refresh()

    def _clear(self):
        self._push_history()
        self.draw.rectangle([0, 0, self.canvas_w, self.canvas_h], fill="white")
        self._refresh()

    def _resize_canvas(self):
        new_w = self.w_var.get()
        new_h = self.h_var.get()
        new_img = Image.new("RGBA", (new_w, new_h), "white")
        new_img.paste(self.image, (0, 0))
        self._push_history()
        self.image = new_img
        self.draw = ImageDraw.Draw(self.image)
        self.canvas_w = new_w
        self.canvas_h = new_h
        self._refresh()

    # ── Инструменты ──────────────────────────────────────────
    def _set_tool(self, name):
        self.tool = name
        for n, btn in self.tool_btns.items():
            btn.config(relief=tk.SUNKEN if n == name else tk.FLAT,
                       bg="#666" if n == name else "#3c3c3c")

    def _set_color(self, color):
        self.color = color
        self.color_btn.config(bg=color)

    def _set_bg_color(self, color):
        self.bg_color = color
        self.bg_btn.config(bg=color)

    def _pick_color(self):
        c = colorchooser.askcolor(color=self.color, title="Выбор цвета")[1]
        if c:
            self._set_color(c)

    def _pick_bg_color(self):
        c = colorchooser.askcolor(color=self.bg_color, title="Цвет фона")[1]
        if c:
            self._set_bg_color(c)

    def _rgba(self, hex_color):
        r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
        return (r, g, b, self.opacity)

    # ── События мыши ─────────────────────────────────────────
    def _on_press(self, event):
        x, y = self._canvas_coords(event)
        self.start_x, self.start_y = x, y
        self.last_x, self.last_y = x, y
        self._push_history()

        if self.tool == "fill":
            self._flood_fill(x, y, self._rgba(self.color))
            self._refresh()
        elif self.tool == "eyedropper":
            self._eyedropper(x, y)
        elif self.tool == "text":
            self._add_text(x, y)
        elif self.tool == "select":
            self.sel_start = (x, y)

    def _on_drag(self, event):
        x, y = self._canvas_coords(event)
        self.status.config(text=f"x={x}, y={y}")

        if self.tool == "brush":
            self._draw_brush(self.last_x, self.last_y, x, y, self.color)
        elif self.tool == "pencil":
            self._draw_pencil(self.last_x, self.last_y, x, y)
        elif self.tool == "eraser":
            self._draw_eraser(self.last_x, self.last_y, x, y)
        elif self.tool == "airbrush":
            self._draw_airbrush(x, y)
        elif self.tool == "calligraphy":
            self._draw_calligraphy(self.last_x, self.last_y, x, y)
        elif self.tool in ("rect", "ellipse", "line", "triangle", "star"):
            self._preview_shape(x, y)

        self.last_x, self.last_y = x, y
        if self.tool not in ("rect", "ellipse", "line", "triangle", "star"):
            self._refresh()

    def _on_release(self, event):
        x, y = self._canvas_coords(event)
        if self.tool in ("rect", "ellipse", "line", "triangle", "star"):
            self._commit_shape(x, y)
            self._refresh()
        self.last_x = self.last_y = None

    def _on_right_press(self, event):
        x, y = self._canvas_coords(event)
        self.start_x, self.start_y = x, y
        self.last_x, self.last_y = x, y
        self._push_history()

    def _on_right_drag(self, event):
        x, y = self._canvas_coords(event)
        if self.tool in ("brush", "pencil"):
            self._draw_brush(self.last_x, self.last_y, x, y, self.bg_color)
        elif self.tool == "eraser":
            self._draw_eraser(self.last_x, self.last_y, x, y)
        self.last_x, self.last_y = x, y
        self._refresh()

    def _on_move(self, event):
        x, y = self._canvas_coords(event)
        self.status.config(text=f"x={x}, y={y}")

    def _on_scroll(self, event):
        if event.delta > 0:
            self.size_var.set(min(80, self.size_var.get() + 1))
        else:
            self.size_var.set(max(1, self.size_var.get() - 1))
        self.brush_size = self.size_var.get()

    # ── Рисование ────────────────────────────────────────────
    def _draw_brush(self, x1, y1, x2, y2, color):
        if x1 is None:
            return
        r = self.brush_size // 2
        color_rgba = self._rgba(color)
        steps = max(abs(x2 - x1), abs(y2 - y1)) or 1
        for i in range(steps + 1):
            t = i / steps
            cx = int(x1 + (x2 - x1) * t)
            cy = int(y1 + (y2 - y1) * t)
            self.draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color_rgba)

    def _draw_pencil(self, x1, y1, x2, y2):
        if x1 is None:
            return
        self.draw.line([x1, y1, x2, y2], fill=self._rgba(self.color), width=max(1, self.brush_size // 3))

    def _draw_eraser(self, x1, y1, x2, y2):
        if x1 is None:
            return
        r = self.brush_size
        steps = max(abs(x2 - x1), abs(y2 - y1)) or 1
        for i in range(steps + 1):
            t = i / steps
            cx = int(x1 + (x2 - x1) * t)
            cy = int(y1 + (y2 - y1) * t)
            self.draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))

    def _draw_airbrush(self, x, y):
        import random
        r = self.brush_size * 3
        count = self.brush_size * 2
        color_rgba = self._rgba(self.color)
        for _ in range(count):
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(0, r)
            px = int(x + dist * math.cos(angle))
            py = int(y + dist * math.sin(angle))
            alpha = int(color_rgba[3] * (1 - dist / r))
            self.draw.point([px, py], fill=(*color_rgba[:3], alpha))

    def _draw_calligraphy(self, x1, y1, x2, y2):
        if x1 is None:
            return
        w = max(1, self.brush_size)
        h = max(1, self.brush_size // 3)
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy) or 1
        nx = -dy / length
        ny = dx / length
        pts = [
            (x1 + nx * w, y1 + ny * w),
            (x1 - nx * h, y1 - ny * h),
            (x2 - nx * h, y2 - ny * h),
            (x2 + nx * w, y2 + ny * w),
        ]
        self.draw.polygon(pts, fill=self._rgba(self.color))

    # ── Фигуры ───────────────────────────────────────────────
    def _preview_shape(self, x, y):
        self._refresh()
        x0, y0 = self.start_x, self.start_y
        color = self.color
        size = self.brush_size

        if self.tool == "rect":
            outline = color if not self.fill_shape.get() else None
            fill = color if self.fill_shape.get() else None
            self.canvas.create_rectangle(
                x0 + 20, y0 + 20, x + 20, y + 20,
                outline=color, fill=fill or "", width=size
            )
        elif self.tool == "ellipse":
            fill = color if self.fill_shape.get() else ""
            self.canvas.create_oval(
                x0 + 20, y0 + 20, x + 20, y + 20,
                outline=color, fill=fill, width=size
            )
        elif self.tool == "line":
            self.canvas.create_line(x0 + 20, y0 + 20, x + 20, y + 20,
                                    fill=color, width=size)
        elif self.tool == "triangle":
            cx = (x0 + x) // 2
            pts = [cx + 20, y0 + 20, x0 + 20, y + 20, x + 20, y + 20]
            fill = color if self.fill_shape.get() else ""
            self.canvas.create_polygon(pts, outline=color, fill=fill, width=size)
        elif self.tool == "star":
            pts = self._star_points(x0, y0, x, y)
            flat = [c + 20 for p in pts for c in p]
            fill = color if self.fill_shape.get() else ""
            self.canvas.create_polygon(flat, outline=color, fill=fill, width=size)

    def _commit_shape(self, x, y):
        x0, y0 = self.start_x, self.start_y
        color = self._rgba(self.color)
        size = self.brush_size
        fill = color if self.fill_shape.get() else None

        if self.tool == "rect":
            self.draw.rectangle([x0, y0, x, y], outline=color, fill=fill, width=size)
        elif self.tool == "ellipse":
            self.draw.ellipse([x0, y0, x, y], outline=color, fill=fill, width=size)
        elif self.tool == "line":
            self.draw.line([x0, y0, x, y], fill=color, width=size)
        elif self.tool == "triangle":
            cx = (x0 + x) // 2
            self.draw.polygon([(cx, y0), (x0, y), (x, y)], outline=color, fill=fill, width=size)
        elif self.tool == "star":
            pts = self._star_points(x0, y0, x, y)
            self.draw.polygon(pts, outline=color, fill=fill, width=size)

    def _star_points(self, x0, y0, x1, y1):
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2
        rx = abs(x1 - x0) / 2
        ry = abs(y1 - y0) / 2
        outer = max(rx, ry)
        inner = outer * 0.4
        pts = []
        for i in range(10):
            angle = math.pi * i / 5 - math.pi / 2
            r = outer if i % 2 == 0 else inner
            pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
        return pts

    # ── Специальные инструменты ──────────────────────────────
    def _flood_fill(self, x, y, new_color):
        if not (0 <= x < self.canvas_w and 0 <= y < self.canvas_h):
            return
        px = self.image.load()
        old_color = px[x, y]
        if old_color == new_color:
            return

        stack = [(x, y)]
        while stack:
            cx, cy = stack.pop()
            if not (0 <= cx < self.canvas_w and 0 <= cy < self.canvas_h):
                continue
            if px[cx, cy] != old_color:
                continue
            px[cx, cy] = new_color
            stack.extend([(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)])

    def _eyedropper(self, x, y):
        if 0 <= x < self.canvas_w and 0 <= y < self.canvas_h:
            r, g, b, a = self.image.getpixel((x, y))
            hex_color = f"#{r:02x}{g:02x}{b:02x}"
            self._set_color(hex_color)

    def _add_text(self, x, y):
        text = simpledialog.askstring("Текст", "Введите текст:")
        if not text:
            return
        size = simpledialog.askinteger("Размер шрифта", "Размер:", initialvalue=24, minvalue=6, maxvalue=200)
        if not size:
            size = 24
        try:
            font = ImageFont.truetype("arial.ttf", size)
        except Exception:
            font = ImageFont.load_default()
        self.draw.text((x, y), text, fill=self._rgba(self.color), font=font)
        self._refresh()

    # ── Фильтры ──────────────────────────────────────────────
    def _apply_filter(self, name):
        self._push_history()
        rgb = self.image.convert("RGB")
        if name == "blur":
            rgb = rgb.filter(ImageFilter.GaussianBlur(radius=2))
        elif name == "sharpen":
            rgb = rgb.filter(ImageFilter.SHARPEN)
        elif name == "edges":
            rgb = rgb.filter(ImageFilter.FIND_EDGES)
        self.image = rgb.convert("RGBA")
        self.draw = ImageDraw.Draw(self.image)
        self._refresh()

    def _flip(self, direction):
        self._push_history()
        method = Image.FLIP_LEFT_RIGHT if direction == "h" else Image.FLIP_TOP_BOTTOM
        self.image = self.image.transpose(method)
        self.draw = ImageDraw.Draw(self.image)
        self._refresh()

    def _rotate(self):
        self._push_history()
        self.image = self.image.rotate(-90, expand=True)
        self.draw = ImageDraw.Draw(self.image)
        self.canvas_w, self.canvas_h = self.image.size
        self._refresh()

    # ── Файлы ────────────────────────────────────────────────
    def _open(self):
        path = filedialog.askopenfilename(
            filetypes=[("Изображения", "*.png *.jpg *.jpeg *.bmp *.gif *.webp"), ("Все", "*.*")]
        )
        if not path:
            return
        self.image = Image.open(path).convert("RGBA")
        self.canvas_w, self.canvas_h = self.image.size
        self.draw = ImageDraw.Draw(self.image)
        self.w_var.set(self.canvas_w)
        self.h_var.set(self.canvas_h)
        self.filepath = path
        self.history.clear()
        self.redo_stack.clear()
        self._refresh()

    def _save(self):
        if hasattr(self, "filepath") and self.filepath:
            self._save_to(self.filepath)
        else:
            self._save_as()

    def _save_as(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG", "*.png"), ("JPEG", "*.jpg"), ("BMP", "*.bmp"), ("Все", "*.*")]
        )
        if path:
            self.filepath = path
            self._save_to(path)

    def _save_to(self, path):
        save_img = self.image.convert("RGB") if path.lower().endswith((".jpg", ".jpeg", ".bmp")) else self.image
        save_img.save(path)
        self.status.config(text=f"Сохранено: {path}")


if __name__ == "__main__":
    root = tk.Tk()
    app = Paint(root)
    root.mainloop()
