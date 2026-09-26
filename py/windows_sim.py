import tkinter as tk
from tkinter import ttk
import time
import threading

# ── palette ──────────────────────────────────────────────────────────────────
BG       = "#008080"   # classic teal desktop
BAR_BG   = "#c0c0c0"
TITLE_BG = "#000080"
TITLE_FG = "white"
BTN_BG   = "#c0c0c0"
BTN_HL   = "#ffffff"
SHADOW   = "#808080"
DARK     = "#404040"

win_counter = 0
z_order     = []        # list of Window frames, back→front


# ── helpers ──────────────────────────────────────────────────────────────────
def raised_frame(parent, **kw):
    f = tk.Frame(parent, bd=0, **kw)
    return f

def win95_button(parent, text, command=None, width=None):
    b = tk.Button(
        parent, text=text, command=command,
        bg=BTN_BG, activebackground=BTN_BG,
        relief="raised", bd=2,
        font=("MS Sans Serif", 8),
        cursor="arrow",
    )
    if width:
        b.config(width=width)
    return b


# ── Window widget ─────────────────────────────────────────────────────────────
class Window(tk.Frame):
    def __init__(self, desktop, title="Untitled", width=320, height=220,
                 x=60, y=60, content_fn=None):
        super().__init__(desktop, bd=2, relief="raised",
                         bg=BAR_BG, highlightthickness=0)
        self.desktop    = desktop
        self.title_text = title
        self._drag_x    = 0
        self._drag_y    = 0
        self.minimized  = False
        self.w          = width
        self.h          = height

        self._build_titlebar()
        self._build_body(content_fn)
        self.place(x=x, y=y, width=width, height=height)
        self.lift()

    # ── title bar ─────────────────────────────────────────────────────────────
    def _build_titlebar(self):
        bar = tk.Frame(self, bg=TITLE_BG, height=20)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        self.title_lbl = tk.Label(
            bar, text=self.title_text, bg=TITLE_BG, fg=TITLE_FG,
            font=("MS Sans Serif", 8, "bold"), anchor="w", padx=4,
        )
        self.title_lbl.pack(side="left", fill="both", expand=True)

        for sym, cmd in [("_", self._minimize), ("□", self._maximize), ("✕", self._close)]:
            b = tk.Button(
                bar, text=sym, command=cmd,
                bg=BTN_BG, activebackground="#e0e0e0",
                relief="raised", bd=2, width=2,
                font=("MS Sans Serif", 8, "bold"),
                cursor="arrow",
            )
            b.pack(side="right", padx=1, pady=1)

        bar.bind("<ButtonPress-1>",   self._on_drag_start)
        bar.bind("<B1-Motion>",       self._on_drag)
        self.title_lbl.bind("<ButtonPress-1>",   self._on_drag_start)
        self.title_lbl.bind("<B1-Motion>",       self._on_drag)
        bar.bind("<ButtonPress-1>",   lambda e: self._bring_to_front(), add="+")

    def _build_body(self, content_fn):
        # menu bar line
        menu = tk.Frame(self, bg=BAR_BG, height=2, bd=1, relief="groove")
        menu.pack(fill="x")

        self.body = tk.Frame(self, bg="white")
        self.body.pack(fill="both", expand=True, padx=2, pady=2)

        if content_fn:
            content_fn(self.body)

    # ── drag ──────────────────────────────────────────────────────────────────
    def _on_drag_start(self, e):
        self._drag_x = e.x_root - self.winfo_x()
        self._drag_y = e.y_root - self.winfo_y()

    def _on_drag(self, e):
        x = e.x_root - self._drag_x
        y = e.y_root - self._drag_y
        self.place(x=max(0, x), y=max(0, y))

    # ── controls ──────────────────────────────────────────────────────────────
    def _bring_to_front(self):
        self.lift()
        if self in z_order:
            z_order.remove(self)
        z_order.append(self)

    def _minimize(self):
        self.minimized = True
        self.place_forget()

    def _maximize(self):
        dw = self.desktop.winfo_width()
        dh = self.desktop.winfo_height() - 40  # leave taskbar
        self.place(x=0, y=0, width=dw, height=dh)
        self._bring_to_front()

    def _close(self):
        if self in z_order:
            z_order.remove(self)
        self.destroy()

    def restore(self):
        self.minimized = False
        self.place(width=self.w, height=self.h)
        self._bring_to_front()


# ── Desktop ───────────────────────────────────────────────────────────────────
class Desktop(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Python 95")
        self.geometry("800x560")
        self.resizable(True, True)
        self.configure(bg=BG)

        self._build_desktop()
        self._build_taskbar()
        self._build_icons()

        # open a couple of windows on start
        self.after(200, self._open_notepad)
        self.after(400, self._open_explorer)

    # ── desktop canvas ────────────────────────────────────────────────────────
    def _build_desktop(self):
        self.desk = tk.Frame(self, bg=BG)
        self.desk.place(x=0, y=0, relwidth=1.0, relheight=1.0)

    # ── taskbar ───────────────────────────────────────────────────────────────
    def _build_taskbar(self):
        tb = tk.Frame(self, bg=BAR_BG, bd=2, relief="raised", height=36)
        tb.place(x=0, rely=1.0, anchor="sw", relwidth=1.0, height=36)
        tb.pack_propagate(False)

        # Start button
        start = tk.Button(
            tb, text="🪟  Start", bg=BTN_BG,
            relief="raised", bd=2,
            font=("MS Sans Serif", 9, "bold"),
            command=self._start_menu,
            cursor="arrow",
        )
        start.pack(side="left", padx=4, pady=3, ipadx=4)

        # separator
        tk.Frame(tb, bg=SHADOW, width=2).pack(side="left", fill="y", pady=4)

        # clock
        self.clock_lbl = tk.Label(
            tb, text="", bg=BAR_BG,
            font=("MS Sans Serif", 8), bd=1, relief="sunken",
        )
        self.clock_lbl.pack(side="right", padx=4, pady=4, ipadx=6)
        self._tick()

        # running-windows bar
        self.task_area = tk.Frame(tb, bg=BAR_BG)
        self.task_area.pack(side="left", fill="both", expand=True, padx=4, pady=3)

        self.taskbar = tb
        self.update_taskbar()

    def _tick(self):
        self.clock_lbl.config(text=time.strftime("%H:%M"))
        self.after(10000, self._tick)

    def update_taskbar(self):
        for w in self.task_area.winfo_children():
            w.destroy()
        for win in z_order:
            title = win.title_text[:16]
            b = tk.Button(
                self.task_area, text=title,
                bg=BTN_BG, relief="raised", bd=2,
                font=("MS Sans Serif", 8),
                width=12, cursor="arrow",
                command=lambda w=win: self._toggle_win(w),
            )
            b.pack(side="left", padx=2)
        self.after(500, self.update_taskbar)

    def _toggle_win(self, win):
        if win.minimized:
            win.restore()
        else:
            win.lift()

    # ── desktop icons ─────────────────────────────────────────────────────────
    def _build_icons(self):
        icons = [
            ("💻", "My Computer",  self._open_explorer),
            ("🗑️", "Recycle Bin",  self._open_recyclebin),
            ("📝", "Notepad",       self._open_notepad),
            ("🎨", "Paint",         self._open_paint),
        ]
        for i, (emoji, label, cmd) in enumerate(icons):
            f = tk.Frame(self.desk, bg=BG, cursor="hand2")
            f.place(x=16, y=16 + i * 80)
            e = tk.Label(f, text=emoji, font=("Segoe UI Emoji", 28), bg=BG,
                         fg="white", cursor="hand2")
            e.pack()
            l = tk.Label(f, text=label, font=("MS Sans Serif", 8), bg=BG,
                         fg="white", cursor="hand2")
            l.pack()
            for w in (f, e, l):
                w.bind("<Double-Button-1>", lambda e, c=cmd: c())

    # ── Start menu (simple) ───────────────────────────────────────────────────
    def _start_menu(self):
        m = tk.Menu(self, tearoff=0, font=("MS Sans Serif", 9))
        m.add_command(label="📝  Notepad",     command=self._open_notepad)
        m.add_command(label="💻  My Computer", command=self._open_explorer)
        m.add_command(label="🎨  Paint",       command=self._open_paint)
        m.add_separator()
        m.add_command(label="🚪  Shut Down",   command=self.destroy)
        m.post(4, self.winfo_height() - 76)

    # ── window factories ──────────────────────────────────────────────────────
    def _new_win(self, title, w, h, content_fn):
        global win_counter
        win_counter += 1
        x = 40 + (win_counter % 6) * 30
        y = 30 + (win_counter % 5) * 24
        win = Window(self.desk, title=title, width=w, height=h,
                     x=x, y=y, content_fn=content_fn)
        z_order.append(win)
        return win

    def _open_notepad(self):
        def content(body):
            txt = tk.Text(body, font=("Courier New", 10), bd=0, wrap="word")
            txt.insert("1.0", "Type something here...\n")
            sb = tk.Scrollbar(body, command=txt.yview)
            txt.config(yscrollcommand=sb.set)
            sb.pack(side="right", fill="y")
            txt.pack(fill="both", expand=True)
        self._new_win("Notepad", 360, 260, content)

    def _open_explorer(self):
        files = ["C:\\", "  📁 Program Files", "  📁 Windows", "  📁 Users",
                 "  📄 autoexec.bat", "  📄 config.sys"]
        def content(body):
            lb = tk.Listbox(body, font=("MS Sans Serif", 9), bd=0,
                            selectbackground=TITLE_BG, selectforeground="white")
            for f in files:
                lb.insert("end", f)
            sb = tk.Scrollbar(body, command=lb.yview)
            lb.config(yscrollcommand=sb.set)
            sb.pack(side="right", fill="y")
            lb.pack(fill="both", expand=True)
        self._new_win("My Computer", 300, 240, content)

    def _open_recyclebin(self):
        def content(body):
            tk.Label(body, text="\n🗑️\n\nКорзина пуста.",
                     font=("MS Sans Serif", 10), bg="white").pack(expand=True)
        self._new_win("Recycle Bin", 240, 180, content)

    def _open_paint(self):
        def content(body):
            color = ["black"]
            colors_row = tk.Frame(body, bg=BAR_BG)
            colors_row.pack(fill="x")
            palette = ["black","white","red","lime","blue","yellow",
                       "cyan","magenta","gray","orange","brown","pink"]
            for c in palette:
                b = tk.Frame(colors_row, bg=c, width=16, height=16,
                             cursor="hand2", bd=1, relief="raised")
                b.pack(side="left", padx=1, pady=2)
                b.bind("<Button-1>", lambda e, c=c: color.__setitem__(0, c))

            canvas = tk.Canvas(body, bg="white", cursor="crosshair")
            canvas.pack(fill="both", expand=True)

            last = [None]
            def on_press(e):  last[0] = (e.x, e.y)
            def on_drag(e):
                if last[0]:
                    canvas.create_line(last[0][0], last[0][1], e.x, e.y,
                                       fill=color[0], width=3, capstyle="round")
                    last[0] = (e.x, e.y)
            def on_release(e): last[0] = None

            canvas.bind("<ButtonPress-1>",  on_press)
            canvas.bind("<B1-Motion>",      on_drag)
            canvas.bind("<ButtonRelease-1>",on_release)

        self._new_win("Paint", 420, 300, content)


# ── run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = Desktop()
    app.mainloop()
