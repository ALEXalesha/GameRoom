"""
Python95 — объединённая ОС-симуляция
Приложения: Notepad, Paint, Explorer, Telegram, Compiler IDE, Recycle Bin
"""

import tkinter as tk
from tkinter import ttk, colorchooser, filedialog, simpledialog
import time
import math
import os
import shutil
import random
import subprocess
import sys
from pathlib import Path
from datetime import datetime

# ── палитра ───────────────────────────────────────────────────────────────────
BG        = "#008080"
BAR_BG    = "#c0c0c0"
TITLE_BG  = "#000080"
TITLE_FG  = "white"
BTN_BG    = "#c0c0c0"
SHADOW    = "#808080"

win_counter = 0
z_order     = []


# ── Window ────────────────────────────────────────────────────────────────────
class Window(tk.Frame):
    def __init__(self, desktop, title="Untitled", width=360, height=260,
                 x=60, y=60, content_fn=None, resizable=True):
        super().__init__(desktop, bd=2, relief="raised", bg=BAR_BG, highlightthickness=0)
        self.desktop    = desktop
        self.title_text = title
        self._drag_x = self._drag_y = 0
        self.minimized  = False
        self.w = width
        self.h = height
        self._resizable = resizable
        self._build_titlebar()
        self._build_body(content_fn)
        self.place(x=x, y=y, width=width, height=height)
        self.lift()

    def _build_titlebar(self):
        bar = tk.Frame(self, bg=TITLE_BG, height=20)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        self.title_lbl = tk.Label(bar, text=self.title_text, bg=TITLE_BG, fg=TITLE_FG,
                                  font=("MS Sans Serif", 8, "bold"), anchor="w", padx=4)
        self.title_lbl.pack(side="left", fill="both", expand=True)

        for sym, cmd in [("_", self._minimize), ("□", self._maximize), ("✕", self._close)]:
            b = tk.Button(bar, text=sym, command=cmd, bg=BTN_BG,
                          relief="raised", bd=2, width=2,
                          font=("MS Sans Serif", 8, "bold"), cursor="arrow")
            b.pack(side="right", padx=1, pady=1)

        for w in (bar, self.title_lbl):
            w.bind("<ButtonPress-1>", self._on_drag_start)
            w.bind("<B1-Motion>",     self._on_drag)
            w.bind("<ButtonPress-1>", lambda e: self._bring_to_front(), add="+")

    def _build_body(self, content_fn):
        menu = tk.Frame(self, bg=BAR_BG, height=2, bd=1, relief="groove")
        menu.pack(fill="x")
        self.body = tk.Frame(self, bg="white")
        self.body.pack(fill="both", expand=True, padx=2, pady=2)
        if content_fn:
            content_fn(self.body)

    def _on_drag_start(self, e):
        self._drag_x = e.x_root - self.winfo_x()
        self._drag_y = e.y_root - self.winfo_y()

    def _on_drag(self, e):
        x = max(0, e.x_root - self._drag_x)
        y = max(0, e.y_root - self._drag_y)
        self.place(x=x, y=y)

    def _bring_to_front(self):
        self.lift()
        if self in z_order: z_order.remove(self)
        z_order.append(self)

    def _minimize(self):
        self.minimized = True
        self.place_forget()

    def _maximize(self):
        dw = self.desktop.winfo_width()
        dh = self.desktop.winfo_height() - 40
        self.place(x=0, y=0, width=dw, height=dh)
        self._bring_to_front()

    def _close(self):
        if self in z_order: z_order.remove(self)
        self.destroy()

    def restore(self):
        self.minimized = False
        self.place(width=self.w, height=self.h)
        self._bring_to_front()


# ── PAINT ─────────────────────────────────────────────────────────────────────
def paint_content(body):
    try:
        from PIL import Image, ImageDraw, ImageTk, ImageFilter
        _paint_pil(body)
    except ImportError:
        _paint_simple(body)

def _paint_simple(body):
    """Fallback без Pillow"""
    color = ["black"]
    palette = ["black","white","red","lime","blue","yellow","cyan","magenta",
               "gray","orange","brown","pink"]
    top = tk.Frame(body, bg=BAR_BG)
    top.pack(fill="x")
    for c in palette:
        b = tk.Frame(top, bg=c, width=16, height=16, cursor="hand2", bd=1, relief="raised")
        b.pack(side="left", padx=1, pady=2)
        b.bind("<Button-1>", lambda e, c=c: color.__setitem__(0, c))
    canvas = tk.Canvas(body, bg="white", cursor="crosshair")
    canvas.pack(fill="both", expand=True)
    last = [None]
    def press(e): last[0] = (e.x, e.y)
    def drag(e):
        if last[0]:
            canvas.create_line(last[0][0], last[0][1], e.x, e.y,
                               fill=color[0], width=3, capstyle="round")
            last[0] = (e.x, e.y)
    def release(e): last[0] = None
    canvas.bind("<ButtonPress-1>", press)
    canvas.bind("<B1-Motion>", drag)
    canvas.bind("<ButtonRelease-1>", release)

def _paint_pil(body):
    from PIL import Image, ImageDraw, ImageTk, ImageFilter
    state = {
        "tool": "brush", "color": "#000000", "size": 4,
        "image": None, "draw": None, "tk_img": None,
        "last_x": None, "last_y": None,
        "start_x": 0, "start_y": 0, "fill": False,
        "history": [], "redo": []
    }

    def new_canvas():
        state["image"] = Image.new("RGB", (900, 560), "white")
        state["draw"] = ImageDraw.Draw(state["image"])
        state["history"].clear(); state["redo"].clear()
        refresh()

    def refresh():
        state["tk_img"] = ImageTk.PhotoImage(state["image"])
        canvas.delete("img")
        canvas.create_image(0, 0, anchor="nw", image=state["tk_img"], tags="img")

    def push():
        state["history"].append(state["image"].copy())
        if len(state["history"]) > 40: state["history"].pop(0)
        state["redo"].clear()

    # toolbar
    toolbar = tk.Frame(body, bg="#3c3c3c")
    toolbar.pack(fill="x")

    tools = [("✏️","brush"),("⬜","rect"),("⭕","ellipse"),("📐","line"),
             ("🪣","fill"),("💧","pick"),("🩹","eraser")]
    tool_btns = {}
    for icon, t in tools:
        b = tk.Button(toolbar, text=icon, width=3, bg="#3c3c3c", fg="white",
                      relief="flat", font=("Arial", 11),
                      command=lambda t=t: set_tool(t))
        b.pack(side="left", padx=1, pady=1)
        tool_btns[t] = b

    def set_tool(t):
        state["tool"] = t
        for k, b in tool_btns.items():
            b.config(bg="#666" if k == t else "#3c3c3c")
    set_tool("brush")

    # size
    tk.Label(toolbar, text="  Размер:", bg="#3c3c3c", fg="#ccc", font=("Arial",9)).pack(side="left")
    size_var = tk.IntVar(value=4)
    tk.Scale(toolbar, from_=1, to=40, orient="horizontal", variable=size_var,
             bg="#3c3c3c", fg="#ccc", troughcolor="#555", highlightthickness=0, length=80,
             command=lambda v: state.update(size=int(v))).pack(side="left")

    # color button
    tk.Label(toolbar, text="  Цвет:", bg="#3c3c3c", fg="#ccc", font=("Arial",9)).pack(side="left")
    col_btn = tk.Button(toolbar, bg="#000000", width=2, relief="raised",
                        command=lambda: pick_color())
    col_btn.pack(side="left", padx=4)

    def pick_color():
        c = colorchooser.askcolor(color=state["color"])[1]
        if c:
            state["color"] = c
            col_btn.config(bg=c)

    # palette
    for c in ["#000","#fff","#f00","#0f0","#00f","#ff0","#0ff","#f0f","#888","#f90"]:
        tk.Frame(toolbar, bg=c, width=14, height=14, cursor="hand2", bd=1, relief="raised")\
          .pack(side="left", padx=1, pady=3)\
          .__class__  # bind below
    # rebuild with bind:
    for w in toolbar.winfo_children()[-10:]:
        c = w.cget("bg")
        w.bind("<Button-1>", lambda e, c=c: [state.update(color=c), col_btn.config(bg=c)])

    # undo/redo
    tk.Button(toolbar, text="↩", bg="#3c3c3c", fg="white", relief="flat",
              command=lambda: undo()).pack(side="right", padx=2)
    tk.Button(toolbar, text="↪", bg="#3c3c3c", fg="white", relief="flat",
              command=lambda: redo()).pack(side="right", padx=2)

    def undo():
        if state["history"]:
            state["redo"].append(state["image"].copy())
            state["image"] = state["history"].pop()
            state["draw"] = ImageDraw.Draw(state["image"])
            refresh()

    def redo():
        if state["redo"]:
            state["history"].append(state["image"].copy())
            state["image"] = state["redo"].pop()
            state["draw"] = ImageDraw.Draw(state["image"])
            refresh()

    # canvas
    frame = tk.Frame(body)
    frame.pack(fill="both", expand=True)
    canvas = tk.Canvas(frame, bg="white", cursor="crosshair")
    canvas.pack(fill="both", expand=True)

    new_canvas()

    def coords(e): return int(e.x), int(e.y)

    def on_press(e):
        x, y = coords(e)
        state["start_x"], state["start_y"] = x, y
        state["last_x"], state["last_y"] = x, y
        push()
        if state["tool"] == "fill":
            flood(x, y)
            refresh()
        elif state["tool"] == "pick":
            try:
                r,g,b = state["image"].getpixel((x,y))
                c = f"#{r:02x}{g:02x}{b:02x}"
                state["color"] = c; col_btn.config(bg=c)
            except: pass

    def on_drag(e):
        x, y = coords(e)
        t = state["tool"]
        if t == "brush":
            draw_line(state["last_x"], state["last_y"], x, y, state["color"], state["size"])
            refresh()
        elif t == "eraser":
            draw_line(state["last_x"], state["last_y"], x, y, "white", state["size"]*2)
            refresh()
        elif t in ("rect","ellipse","line"):
            refresh()
            x0,y0 = state["start_x"], state["start_y"]
            if t == "rect":
                canvas.create_rectangle(x0,y0,x,y, outline=state["color"], width=state["size"])
            elif t == "ellipse":
                canvas.create_oval(x0,y0,x,y, outline=state["color"], width=state["size"])
            elif t == "line":
                canvas.create_line(x0,y0,x,y, fill=state["color"], width=state["size"])
        state["last_x"], state["last_y"] = x, y

    def on_release(e):
        x, y = coords(e)
        t = state["tool"]
        x0, y0 = state["start_x"], state["start_y"]
        if t == "rect":
            state["draw"].rectangle([x0,y0,x,y], outline=state["color"], width=state["size"])
        elif t == "ellipse":
            state["draw"].ellipse([x0,y0,x,y], outline=state["color"], width=state["size"])
        elif t == "line":
            state["draw"].line([x0,y0,x,y], fill=state["color"], width=state["size"])
        if t in ("rect","ellipse","line"):
            refresh()

    def draw_line(x1,y1,x2,y2,color,size):
        if x1 is None: return
        r = size//2
        steps = max(abs(x2-x1),abs(y2-y1),1)
        for i in range(steps+1):
            t = i/steps
            cx = int(x1+(x2-x1)*t); cy = int(y1+(y2-y1)*t)
            state["draw"].ellipse([cx-r,cy-r,cx+r,cy+r], fill=color)

    def flood(x, y):
        try:
            img = state["image"]
            w, h = img.size
            if not (0 <= x < w and 0 <= y < h): return
            px = img.load()
            old = px[x,y]
            nr,ng,nb = int(state["color"][1:3],16),int(state["color"][3:5],16),int(state["color"][5:7],16)
            new = (nr,ng,nb)
            if old == new: return
            stack = [(x,y)]
            while stack:
                cx,cy = stack.pop()
                if not (0<=cx<w and 0<=cy<h): continue
                if px[cx,cy] != old: continue
                px[cx,cy] = new
                stack += [(cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)]
        except: pass

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    canvas.bind("<MouseWheel>", lambda e: size_var.set(max(1,min(40,size_var.get()+(1 if e.delta>0 else -1)))))


# ── EXPLORER ──────────────────────────────────────────────────────────────────
def explorer_content(body):
    ROOT = Path.home()
    state = {"path": ROOT}

    ICONS = {"folder":"📁","image":"🖼️","video":"🎬","audio":"🎵",
              "archive":"📦","code":"💻","pdf":"📕","text":"📝","file":"📄"}
    EXT_MAP = {
        **{e:"image" for e in [".png",".jpg",".jpeg",".gif",".bmp",".webp"]},
        **{e:"video" for e in [".mp4",".mkv",".avi",".mov"]},
        **{e:"audio" for e in [".mp3",".wav",".flac",".ogg"]},
        **{e:"archive" for e in [".zip",".tar",".gz",".rar",".7z"]},
        **{e:"code" for e in [".py",".js",".ts",".html",".css",".c",".cpp"]},
        **{e:"pdf" for e in [".pdf"]},
        **{e:"text" for e in [".txt",".md",".json",".xml",".yaml",".csv"]},
    }

    def icon(p):
        if p.is_dir(): return ICONS["folder"]
        return ICONS.get(EXT_MAP.get(p.suffix.lower(),"file"), ICONS["file"])

    def fmt_size(s):
        for u in ["Б","КБ","МБ","ГБ"]:
            if s < 1024: return f"{s:.0f} {u}"
            s /= 1024
        return f"{s:.1f} ТБ"

    # nav bar
    nav = tk.Frame(body, bg="#16213e")
    nav.pack(fill="x")

    path_var = tk.StringVar(value=str(ROOT))
    for txt, cmd in [("◀", lambda: go_up()), ("▲", lambda: go_up()), ("⟳", lambda: refresh())]:
        tk.Button(nav, text=txt, bg="#16213e", fg="#e94560", relief="flat",
                  font=("Consolas",10,"bold"), command=cmd).pack(side="left", padx=2, pady=2)

    path_entry = tk.Entry(nav, textvariable=path_var, bg="#0f3460", fg="#e94560",
                          insertbackground="#e94560", relief="flat", font=("Consolas",9))
    path_entry.pack(side="left", fill="x", expand=True, padx=4, pady=4, ipady=2)
    path_entry.bind("<Return>", lambda e: navigate(Path(path_var.get())))

    # file list
    cols = ("icon","name","size","date")
    tree = ttk.Treeview(body, columns=cols, show="headings", selectmode="browse")
    tree.heading("icon", text="")
    tree.heading("name", text="Имя")
    tree.heading("size", text="Размер")
    tree.heading("date", text="Дата")
    tree.column("icon", width=30, minwidth=30, stretch=False, anchor="center")
    tree.column("name", width=200, minwidth=100)
    tree.column("size", width=70, minwidth=60, anchor="e")
    tree.column("date", width=110, minwidth=80)

    style = ttk.Style()
    style.configure("Explorer.Treeview", background="#1a1a2e", foreground="#e0e0f0",
                    fieldbackground="#1a1a2e", rowheight=22, font=("Consolas",9))
    style.map("Explorer.Treeview", background=[("selected","#0f3460")], foreground=[("selected","#e94560")])
    style.configure("Explorer.Treeview.Heading", background="#0a0a1a", foreground="#e94560",
                    font=("Consolas",9,"bold"))
    tree.configure(style="Explorer.Treeview")

    vsb = ttk.Scrollbar(body, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=vsb.set)
    vsb.pack(side="right", fill="y")
    tree.pack(fill="both", expand=True)

    # status
    status = tk.Label(body, text="", bg="#0a0a1a", fg="#888aaa", font=("Consolas",8), anchor="w")
    status.pack(fill="x")

    def navigate(p):
        if not p.is_dir(): return
        state["path"] = p
        path_var.set(str(p))
        refresh()

    def go_up():
        p = state["path"].parent
        if p != state["path"]: navigate(p)

    def refresh():
        tree.delete(*tree.get_children())
        try:
            entries = sorted(state["path"].iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            status.config(text="⛔ Нет доступа"); return
        count = 0
        for p in entries:
            try:
                st = p.stat()
                sz = fmt_size(st.st_size) if p.is_file() else ""
                dt = datetime.fromtimestamp(st.st_mtime).strftime("%d.%m.%Y %H:%M")
            except: sz = dt = ""
            tree.insert("", "end", iid=str(p), values=(icon(p), p.name, sz, dt))
            count += 1
        status.config(text=f"📂 {state['path']}  —  {count} элементов")

    def on_open(e):
        sel = tree.selection()
        if not sel: return
        p = Path(sel[0])
        if p.is_dir(): navigate(p)
        else:
            try:
                if sys.platform=="win32": os.startfile(p)
                elif sys.platform=="darwin": subprocess.Popen(["open",str(p)])
                else: subprocess.Popen(["xdg-open",str(p)])
            except: pass

    tree.bind("<Double-1>", on_open)
    tree.bind("<Return>", on_open)
    tree.bind("<BackSpace>", lambda e: go_up())
    navigate(ROOT)


# ── TELEGRAM CLONE ────────────────────────────────────────────────────────────
BG_DARK   = "#17212b"
BG_PANEL  = "#232e3c"
BG_CHAT   = "#0d1117"
BG_INPUT  = "#182533"
BG_OUT    = "#2b5278"
BG_IN     = "#182533"
ACCENT_TG = "#5288c1"
TG_FG     = "#ffffff"
TG_SEC    = "#7d8e9e"
TG_TIME   = "#6c7883"
TG_ONLINE = "#4dcd5e"
DIVIDER   = "#0f1923"

CHATS = [
    {"name":"Алексей","last":"Привет, как дела?","time":"22:14","unread":3,"online":True},
    {"name":"Мама","last":"Позвони когда сможешь","time":"21:03","unread":0,"online":False},
    {"name":"Рабочий чат","last":"Завтра митинг в 10:00","time":"20:45","unread":12,"online":False},
    {"name":"Антон","last":"Окей, понял","time":"19:30","unread":0,"online":True},
    {"name":"Катя","last":"Фото отправлены 📷","time":"18:11","unread":1,"online":False},
    {"name":"Dev Group","last":"push в main сделан","time":"17:55","unread":0,"online":False},
]

MSGS = {
    "Алексей":[("in","Привет!","21:50"),("in","Как дела?","21:51"),
                ("out","Всё хорошо, работаю над проектом 😄","21:52"),
                ("in","Что за проект?","22:00"),("out","ОС-симулятор на Python 😎","22:05"),
                ("in","Привет, как дела?","22:14")],
    "Мама":[("in","Сынок, как ты?","20:00"),("out","Всё хорошо мам!","20:30"),
             ("in","Позвони когда сможешь","21:03")],
    "Рабочий чат":[("in","Всем привет!","09:00"),("in","Завтра митинг в 10:00","20:45")],
}

def telegram_content(body):
    body.configure(bg=BG_DARK)
    state = {"active": None, "msgs": {k: list(v) for k,v in MSGS.items()}}

    body.columnconfigure(1, weight=1)
    body.rowconfigure(0, weight=1)

    # left panel
    left = tk.Frame(body, bg=BG_PANEL, width=200)
    left.grid(row=0, column=0, sticky="nsew")
    left.grid_propagate(False)
    left.columnconfigure(0, weight=1)
    left.rowconfigure(1, weight=1)

    # search
    sf = tk.Frame(left, bg=BG_PANEL, pady=6, padx=8)
    sf.grid(row=0, column=0, sticky="ew")
    sf.columnconfigure(0, weight=1)
    se_frame = tk.Frame(sf, bg=BG_INPUT)
    se_frame.grid(sticky="ew", ipady=4)
    se_frame.columnconfigure(1, weight=1)
    tk.Label(se_frame, text="🔍", bg=BG_INPUT, fg=TG_SEC, font=("Segoe UI",9)).grid(row=0,column=0,padx=6)
    se = tk.Entry(se_frame, bg=BG_INPUT, fg=TG_FG, insertbackground=TG_FG,
                  font=("Segoe UI",9), bd=0, relief="flat")
    se.grid(row=0,column=1,sticky="ew",pady=2)
    se.insert(0,"Поиск")
    se.bind("<FocusIn>", lambda e: se.delete(0,"end") if se.get()=="Поиск" else None)
    se.bind("<FocusOut>", lambda e: se.insert(0,"Поиск") if not se.get() else None)

    # chat list
    cl_frame = tk.Frame(left, bg=BG_PANEL)
    cl_frame.grid(row=1, column=0, sticky="nsew")
    cl_frame.columnconfigure(0, weight=1)
    cl_frame.rowconfigure(0, weight=1)

    cl_canvas = tk.Canvas(cl_frame, bg=BG_PANEL, bd=0, highlightthickness=0)
    cl_sb = tk.Scrollbar(cl_frame, orient="vertical", command=cl_canvas.yview)
    cl_canvas.configure(yscrollcommand=cl_sb.set)
    cl_canvas.grid(row=0,column=0,sticky="nsew")
    cl_sb.grid(row=0,column=1,sticky="ns")

    cl_inner = tk.Frame(cl_canvas, bg=BG_PANEL)
    cl_inner.columnconfigure(0,weight=1)
    cl_win = cl_canvas.create_window((0,0), window=cl_inner, anchor="nw")
    cl_canvas.bind("<Configure>", lambda e: cl_canvas.itemconfig(cl_win, width=e.width))
    cl_inner.bind("<Configure>", lambda e: cl_canvas.configure(scrollregion=cl_canvas.bbox("all")))

    AVATAR_COLORS = ["#c03d2f","#e8a838","#2f7fc0","#2fa86e","#9c59b6","#e74c3c"]
    chat_frames = []

    for i, chat in enumerate(CHATS):
        fr = tk.Frame(cl_inner, bg=BG_PANEL, cursor="hand2")
        fr.grid(row=i, column=0, sticky="ew")
        fr.columnconfigure(1, weight=1)

        av_f = tk.Frame(fr, bg=BG_PANEL)
        av_f.grid(row=0,column=0,rowspan=2,padx=(8,6),pady=6)
        color = AVATAR_COLORS[i % len(AVATAR_COLORS)]
        av = tk.Canvas(av_f, width=40,height=40,bg=BG_PANEL,highlightthickness=0)
        av.pack()
        av.create_oval(1,1,39,39,fill=color,outline="")
        av.create_text(20,20,text=chat["name"][0],fill="white",font=("Segoe UI",14,"bold"))
        if chat["online"]:
            av.create_oval(29,29,39,39,fill=BG_PANEL,outline="")
            av.create_oval(31,31,37,37,fill=TG_ONLINE,outline="")

        top_r = tk.Frame(fr, bg=BG_PANEL)
        top_r.grid(row=0,column=1,sticky="ew",padx=(0,8),pady=(6,0))
        top_r.columnconfigure(0,weight=1)
        tk.Label(top_r,text=chat["name"],bg=BG_PANEL,fg=TG_FG,
                 font=("Segoe UI",9,"bold"),anchor="w").grid(row=0,column=0,sticky="w")
        tk.Label(top_r,text=chat["time"],bg=BG_PANEL,fg=TG_TIME,
                 font=("Segoe UI",8)).grid(row=0,column=1,sticky="e")

        bot_r = tk.Frame(fr, bg=BG_PANEL)
        bot_r.grid(row=1,column=1,sticky="ew",padx=(0,8),pady=(0,6))
        bot_r.columnconfigure(0,weight=1)
        last = chat["last"][:32]+"…" if len(chat["last"])>32 else chat["last"]
        tk.Label(bot_r,text=last,bg=BG_PANEL,fg=TG_SEC,font=("Segoe UI",8),anchor="w").grid(row=0,column=0,sticky="w")
        if chat["unread"]>0:
            tk.Label(bot_r,text=str(chat["unread"]),bg=ACCENT_TG,fg="white",
                     font=("Segoe UI",7,"bold"),padx=4,pady=0).grid(row=0,column=1)

        tk.Frame(fr,bg=DIVIDER,height=1).grid(row=2,column=0,columnspan=2,sticky="ew")

        for w in [fr,av_f,av,top_r,bot_r]+list(fr.winfo_children()):
            try: w.bind("<Button-1>", lambda e, idx=i: select_chat(idx))
            except: pass

        chat_frames.append(fr)

    # right panel
    right = tk.Frame(body, bg=BG_CHAT)
    right.grid(row=0, column=1, sticky="nsew")
    right.columnconfigure(0, weight=1)
    right.rowconfigure(1, weight=1)

    # header
    header = tk.Frame(right, bg=BG_PANEL, height=50)
    header.grid(row=0,column=0,sticky="ew")
    header.grid_propagate(False)
    header.columnconfigure(1,weight=1)

    h_av = tk.Canvas(header,width=34,height=34,bg=BG_PANEL,highlightthickness=0)
    h_av.grid(row=0,column=0,padx=(12,8),pady=8)
    h_name = tk.Label(header,text="",bg=BG_PANEL,fg=TG_FG,font=("Segoe UI",10,"bold"))
    h_name.grid(row=0,column=1,sticky="w")
    h_status = tk.Label(header,text="",bg=BG_PANEL,fg=TG_ONLINE,font=("Segoe UI",8))
    h_status.grid(row=0,column=2,sticky="e",padx=12)

    # messages area
    msg_canvas = tk.Canvas(right, bg=BG_CHAT, bd=0, highlightthickness=0)
    msg_sb = tk.Scrollbar(right, orient="vertical", command=msg_canvas.yview)
    msg_canvas.configure(yscrollcommand=msg_sb.set)
    msg_canvas.grid(row=1,column=0,sticky="nsew")
    msg_sb.grid(row=1,column=1,sticky="ns")

    msg_frame = tk.Frame(msg_canvas, bg=BG_CHAT)
    msg_frame.columnconfigure(0,weight=1)
    msg_win = msg_canvas.create_window((0,0), window=msg_frame, anchor="nw")
    msg_canvas.bind("<Configure>", lambda e: msg_canvas.itemconfig(msg_win, width=e.width))
    msg_frame.bind("<Configure>", lambda e: msg_canvas.configure(scrollregion=msg_canvas.bbox("all")))

    # input
    inp_panel = tk.Frame(right, bg=BG_PANEL, pady=8)
    inp_panel.grid(row=2,column=0,columnspan=2,sticky="ew")
    inp_panel.columnconfigure(1,weight=1)
    tk.Label(inp_panel,text="📎",bg=BG_PANEL,fg=TG_SEC,font=("Segoe UI",12)).grid(row=0,column=0,padx=(12,4))
    inp_box = tk.Frame(inp_panel,bg=BG_INPUT)
    inp_box.grid(row=0,column=1,sticky="ew",ipady=5,ipadx=8)
    inp_box.columnconfigure(0,weight=1)
    inp_var = tk.StringVar()
    inp_entry = tk.Entry(inp_box,textvariable=inp_var,bg=BG_INPUT,fg=TG_FG,
                         insertbackground=TG_FG,font=("Segoe UI",9),bd=0,relief="flat")
    inp_entry.grid(row=0,column=0,sticky="ew",padx=6,pady=3)

    send_btn = tk.Label(inp_panel,text="➤",bg=ACCENT_TG,fg="white",
                        font=("Segoe UI",11),padx=8,pady=3,cursor="hand2")
    send_btn.grid(row=0,column=2,padx=(4,12))

    def render_messages():
        for w in msg_frame.winfo_children(): w.destroy()
        msgs = state["msgs"].get(state["active"],[])
        tk.Label(msg_frame,text="Сегодня",bg="#1e2d3d",fg=TG_SEC,
                 font=("Segoe UI",8),padx=8,pady=2).grid(row=0,column=0,pady=8)
        for i,(direction,text,t) in enumerate(msgs):
            is_out = direction=="out"
            anchor = "e" if is_out else "w"
            bg = BG_OUT if is_out else BG_IN
            outer = tk.Frame(msg_frame,bg=BG_CHAT)
            outer.grid(row=i+1,column=0,sticky="ew",padx=12,pady=2)
            outer.columnconfigure(0,weight=1)
            bubble = tk.Frame(outer,bg=bg,padx=8,pady=5)
            bubble.grid(row=0,column=0,sticky=anchor)
            tk.Label(bubble,text=text,bg=bg,fg=TG_FG,font=("Segoe UI",9),
                     wraplength=280,justify="left",anchor="w").grid(row=0,column=0,sticky="w")
            tk.Label(bubble,text=t+("  ✓✓" if is_out else ""),bg=bg,fg=TG_TIME,
                     font=("Segoe UI",7)).grid(row=1,column=0,sticky="e")
        body.after(50, lambda: msg_canvas.yview_moveto(1.0))

    def send(e=None):
        text = inp_var.get().strip()
        if not text or not state["active"]: return
        now = time.strftime("%H:%M")
        state["msgs"].setdefault(state["active"],[]).append(("out",text,now))
        inp_var.set("")
        render_messages()
        body.after(900, lambda: auto_reply())

    def auto_reply():
        if not state["active"]: return
        r = random.choice(["Понял 👍","Окей!","Хорошо!","Ага","😄","Отлично!","Интересно..."])
        state["msgs"][state["active"]].append(("in",r,time.strftime("%H:%M")))
        render_messages()

    def select_chat(idx):
        for fr in chat_frames:
            fr.config(bg=BG_PANEL)
            for w in fr.winfo_children():
                try: w.config(bg=BG_PANEL)
                except: pass
        chat_frames[idx].config(bg="#1c2c3e")
        for w in chat_frames[idx].winfo_children():
            try: w.config(bg="#1c2c3e")
            except: pass
        chat = CHATS[idx]
        state["active"] = chat["name"]
        h_name.config(text=chat["name"])
        h_status.config(text="в сети" if chat["online"] else "не в сети",
                        fg=TG_ONLINE if chat["online"] else TG_SEC)
        color = AVATAR_COLORS[idx % len(AVATAR_COLORS)]
        h_av.delete("all")
        h_av.create_oval(1,1,33,33,fill=color,outline="")
        h_av.create_text(17,17,text=chat["name"][0],fill="white",font=("Segoe UI",11,"bold"))
        render_messages()

    inp_entry.bind("<Return>", send)
    send_btn.bind("<Button-1>", send)
    select_chat(0)


# ── COMPILER IDE ──────────────────────────────────────────────────────────────
DEMO_CODE = """\
# факториал числа 6
n = 6
result = 1
i = 1
while i <= n
  result = result * i
  i = i + 1
end
print result

# if/else
x = 100
y = 42
if x > y
  print x
else
  print y
end
"""

def compiler_content(body):
    body.configure(bg="#1e1e1e")

    # top toolbar
    toolbar = tk.Frame(body, bg="#252526")
    toolbar.pack(fill="x")

    def run_code():
        source = editor.get("1.0","end-1c")
        output.configure(state="normal")
        output.delete("1.0","end")
        try:
            code = compile_source(source)
            output.insert("end","── Python-код ─────────────\n","header")
            output.insert("end",code+"\n\n")
            output.insert("end","── Выполнение ─────────────\n","header")
            import io, contextlib
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                exec(compile(code,"<mini>","exec"), {})
            output.insert("end",buf.getvalue(),"result")
        except Exception as e:
            output.insert("end",f"Ошибка: {e}\n","error")
        output.configure(state="disabled")
        output.see("end")

    for text, cmd, bg in [("▶ Run","run",None),("🗑 Clear","clear",None)]:
        b = tk.Button(toolbar, text=text, bg="#007acc" if text.startswith("▶") else "#3c3c3c",
                      fg="white", relief="flat", font=("Consolas",9,"bold"),
                      padx=10, pady=3,
                      command=run_code if cmd=="run" else lambda: [editor.delete("1.0","end"), editor.insert("1.0","")])
        b.pack(side="left", padx=4, pady=4)

    tk.Label(toolbar, text="Мини-язык → Python", bg="#252526", fg="#888",
             font=("Consolas",8)).pack(side="right", padx=8)

    # paned
    paned = tk.PanedWindow(body, orient="vertical", bg="#1e1e1e", sashwidth=4,
                           sashrelief="flat", sashpad=0)
    paned.pack(fill="both", expand=True)

    # editor
    ed_frame = tk.Frame(paned, bg="#1e1e1e")
    tk.Label(ed_frame, text="  Исходник", bg="#252526", fg="#9cdcfe",
             font=("Consolas",8), anchor="w").pack(fill="x")
    editor = tk.Text(ed_frame, bg="#1e1e1e", fg="#d4d4d4", insertbackground="white",
                     font=("Consolas",10), bd=0, wrap="none",
                     selectbackground="#264f78", tabs=("  ",))
    editor.pack(fill="both", expand=True, padx=2)
    editor.insert("1.0", DEMO_CODE)
    paned.add(ed_frame, height=220)

    # output
    out_frame = tk.Frame(paned, bg="#1e1e1e")
    tk.Label(out_frame, text="  Вывод", bg="#252526", fg="#9cdcfe",
             font=("Consolas",8), anchor="w").pack(fill="x")
    output = tk.Text(out_frame, bg="#0d1117", fg="#b5e853", insertbackground="white",
                     font=("Consolas",9), bd=0, state="disabled")
    output.pack(fill="both", expand=True, padx=2)
    output.tag_config("header", foreground="#569cd6")
    output.tag_config("result", foreground="#4ec9b0")
    output.tag_config("error",  foreground="#f44747")
    paned.add(out_frame, height=130)

    # bind Ctrl+Enter
    editor.bind("<Control-Return>", lambda e: run_code())


def compile_source(source):
    """Лексер → Парсер → Кодогенератор (встроенный)"""
    import re
    KEYWORDS = {"if","else","end","while","print","true","false"}

    # Лексер
    tokens = []
    line = 1
    i = 0
    src = source
    two_char = {"<=",">=","==","!="}
    while i < len(src):
        c = src[i]
        if c in " \t\r": i += 1; continue
        if c == "\n": i += 1; line += 1; continue
        if c == "#":
            while i < len(src) and src[i] != "\n": i += 1
            continue
        if c == '"':
            i += 1; buf = ""
            while i < len(src) and src[i] != '"':
                buf += src[i]; i += 1
            i += 1
            tokens.append(("STR", buf, line)); continue
        if c.isdigit():
            buf = ""
            while i < len(src) and (src[i].isdigit() or src[i] == "."): buf += src[i]; i += 1
            tokens.append(("NUM", float(buf) if "." in buf else int(buf), line)); continue
        if c.isalpha() or c == "_":
            buf = ""
            while i < len(src) and (src[i].isalnum() or src[i] == "_"): buf += src[i]; i += 1
            t = buf if buf in KEYWORDS else "ID"
            tokens.append((t, buf, line)); continue
        two = src[i:i+2]
        if two in two_char:
            tokens.append((two, two, line)); i += 2; continue
        if c in "+-*/=<>()":
            tokens.append((c, c, line)); i += 1; continue
        raise ValueError(f"Неожиданный символ '{c}' на строке {line}")
    tokens.append(("EOF", None, line))

    # Парсер + кодогенератор (recursive descent)
    pos = [0]
    def cur(): return tokens[pos[0]]
    def eat(t):
        tok = cur()
        if tok[0] != t: raise ValueError(f"Ожидалось {t!r}, получено {tok[0]!r} на строке {tok[2]}")
        pos[0] += 1; return tok

    lines = []
    def emit(s): lines.append(s)

    def expr(): return comparison()
    def comparison():
        s = add()
        while cur()[0] in ("<",">","<=",">=","==","!="):
            op = cur()[0]; pos[0] += 1
            s = f"({s} {op} {add()})"
        return s
    def add():
        s = mul()
        while cur()[0] in ("+","-"):
            op = cur()[0]; pos[0] += 1
            s = f"({s} {op} {mul()})"
        return s
    def mul():
        s = unary()
        while cur()[0] in ("*","/"):
            op = cur()[0]; pos[0] += 1
            s = f"({s} {op} {unary()})"
        return s
    def unary():
        if cur()[0] == "-": pos[0] += 1; return f"(-{primary()})"
        return primary()
    def primary():
        t = cur(); pos[0] += 1
        if t[0] == "NUM": return str(t[1])
        if t[0] == "STR": return repr(t[1])
        if t[0] == "ID": return t[1]
        if t[0] == "(":
            e = expr(); eat(")"); return e
        raise ValueError(f"Неожиданное значение {t[1]!r} на строке {t[2]}")

    def stmt(indent=0):
        t = cur()
        pad = "    " * indent
        if t[0] == "if":
            eat("if"); cond = expr()
            emit(f"{pad}if {cond}:")
            while cur()[0] not in ("else","end","EOF"): stmt(indent+1)
            if cur()[0] == "else":
                eat("else"); emit(f"{pad}else:")
                while cur()[0] not in ("end","EOF"): stmt(indent+1)
            eat("end")
        elif t[0] == "while":
            eat("while"); cond = expr()
            emit(f"{pad}while {cond}:")
            while cur()[0] not in ("end","EOF"): stmt(indent+1)
            eat("end")
        elif t[0] == "print":
            eat("print"); emit(f"{pad}print({expr()})")
        elif t[0] == "ID":
            name = eat("ID")[1]; eat("="); emit(f"{pad}{name} = {expr()}")
        else:
            raise ValueError(f"Неожиданный токен {t[1]!r} на строке {t[2]}")

    while cur()[0] != "EOF": stmt()
    return "\n".join(lines)


# ── NOTEPAD ───────────────────────────────────────────────────────────────────
def notepad_content(body):
    txt = tk.Text(body, font=("Courier New",10), bd=0, wrap="word",
                  bg="white", fg="#222", insertbackground="black")
    txt.insert("1.0","Напишите что-нибудь...\n")
    sb = tk.Scrollbar(body, command=txt.yview)
    txt.config(yscrollcommand=sb.set)
    sb.pack(side="right", fill="y")
    txt.pack(fill="both", expand=True)


# ── RECYCLE BIN ───────────────────────────────────────────────────────────────
def recyclebin_content(body):
    tk.Label(body, text="\n🗑️\n\nКорзина пуста.",
             font=("MS Sans Serif",10), bg="white").pack(expand=True)


# ── Desktop ───────────────────────────────────────────────────────────────────
class Desktop(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Python95")
        self.geometry("1024x680")
        self.resizable(True, True)
        self.configure(bg=BG)

        self._build_desktop()
        self._build_taskbar()
        self._build_icons()

        self.after(200, self._open_notepad)
        self.after(400, self._open_telegram)

    def _build_desktop(self):
        self.desk = tk.Frame(self, bg=BG)
        self.desk.place(x=0, y=0, relwidth=1.0, relheight=1.0)

    def _build_taskbar(self):
        tb = tk.Frame(self, bg=BAR_BG, bd=2, relief="raised", height=36)
        tb.place(x=0, rely=1.0, anchor="sw", relwidth=1.0, height=36)
        tb.pack_propagate(False)

        start = tk.Button(tb, text="🪟  Start", bg=BTN_BG, relief="raised", bd=2,
                          font=("MS Sans Serif",9,"bold"), command=self._start_menu, cursor="arrow")
        start.pack(side="left", padx=4, pady=3, ipadx=4)
        tk.Frame(tb, bg=SHADOW, width=2).pack(side="left", fill="y", pady=4)

        self.clock_lbl = tk.Label(tb, text="", bg=BAR_BG,
                                  font=("MS Sans Serif",8), bd=1, relief="sunken")
        self.clock_lbl.pack(side="right", padx=4, pady=4, ipadx=6)
        self._tick()

        self.task_area = tk.Frame(tb, bg=BAR_BG)
        self.task_area.pack(side="left", fill="both", expand=True, padx=4, pady=3)
        self.taskbar = tb
        self.update_taskbar()

    def _tick(self):
        self.clock_lbl.config(text=time.strftime("%H:%M"))
        self.after(10000, self._tick)

    def update_taskbar(self):
        for w in self.task_area.winfo_children(): w.destroy()
        for win in z_order:
            b = tk.Button(self.task_area, text=win.title_text[:14],
                          bg=BTN_BG, relief="raised", bd=2,
                          font=("MS Sans Serif",8), width=10, cursor="arrow",
                          command=lambda w=win: self._toggle_win(w))
            b.pack(side="left", padx=2)
        self.after(500, self.update_taskbar)

    def _toggle_win(self, win):
        if win.minimized: win.restore()
        else: win.lift()

    def _build_icons(self):
        icons = [
            ("💻","My Computer", self._open_explorer),
            ("🗑️","Recycle Bin", self._open_recyclebin),
            ("📝","Notepad",      self._open_notepad),
            ("🎨","Paint",        self._open_paint),
            ("💬","Telegram",     self._open_telegram),
            ("⚙️","Compiler",     self._open_compiler),
        ]
        for i,(emoji,label,cmd) in enumerate(icons):
            f = tk.Frame(self.desk, bg=BG, cursor="hand2")
            f.place(x=16, y=16+i*76)
            e = tk.Label(f, text=emoji, font=("Segoe UI Emoji",26), bg=BG, fg="white", cursor="hand2")
            e.pack()
            l = tk.Label(f, text=label, font=("MS Sans Serif",8), bg=BG, fg="white", cursor="hand2")
            l.pack()
            for w in (f,e,l):
                w.bind("<Double-Button-1>", lambda ev, c=cmd: c())

    def _start_menu(self):
        m = tk.Menu(self, tearoff=0, font=("MS Sans Serif",9))
        m.add_command(label="📝  Notepad",     command=self._open_notepad)
        m.add_command(label="🎨  Paint",       command=self._open_paint)
        m.add_command(label="💻  My Computer", command=self._open_explorer)
        m.add_command(label="💬  Telegram",    command=self._open_telegram)
        m.add_command(label="⚙️  Compiler",    command=self._open_compiler)
        m.add_separator()
        m.add_command(label="🗑️  Recycle Bin", command=self._open_recyclebin)
        m.add_separator()
        m.add_command(label="🚪  Shut Down",   command=self.destroy)
        m.post(4, self.winfo_height()-76)

    def _new_win(self, title, w, h, content_fn):
        global win_counter
        win_counter += 1
        x = 50 + (win_counter % 7)*28
        y = 30 + (win_counter % 6)*22
        win = Window(self.desk, title=title, width=w, height=h,
                     x=x, y=y, content_fn=content_fn)
        z_order.append(win)
        return win

    def _open_notepad(self):   self._new_win("Notepad",     380, 280, notepad_content)
    def _open_recyclebin(self):self._new_win("Recycle Bin", 240, 160, recyclebin_content)
    def _open_paint(self):     self._new_win("Paint",       700, 480, paint_content)
    def _open_explorer(self):  self._new_win("My Computer", 600, 400, explorer_content)
    def _open_telegram(self):  self._new_win("Telegram",    720, 500, telegram_content)
    def _open_compiler(self):  self._new_win("Compiler IDE",640, 440, compiler_content)


if __name__ == "__main__":
    app = Desktop()
    app.mainloop()
