import tkinter as tk
from tkinter import scrolledtext
import time
import random

BG_DARK = "#17212b"
BG_PANEL = "#232e3c"
BG_CHAT = "#0d1117"
BG_INPUT = "#182533"
BG_MSG_OUT = "#2b5278"
BG_MSG_IN = "#182533"
ACCENT = "#5288c1"
TEXT_PRIMARY = "#ffffff"
TEXT_SECONDARY = "#7d8e9e"
TEXT_TIME = "#6c7883"
ONLINE = "#4dcd5e"
DIVIDER = "#0f1923"

FONT_MAIN = ("Segoe UI", 10)
FONT_BOLD = ("Segoe UI", 10, "bold")
FONT_SMALL = ("Segoe UI", 8)
FONT_TITLE = ("Segoe UI", 11, "bold")
FONT_MSG = ("Segoe UI", 10)

CHATS = [
    {"name": "Алексей", "last": "Привет, как дела?", "time": "22:14", "unread": 3, "online": True},
    {"name": "Мама", "last": "Позвони когда сможешь", "time": "21:03", "unread": 0, "online": False},
    {"name": "Рабочий чат", "last": "Завтра митинг в 10:00", "time": "20:45", "unread": 12, "online": False},
    {"name": "Антон Смирнов", "last": "Окей, понял", "time": "19:30", "unread": 0, "online": True},
    {"name": "Катя", "last": "Фото отправлены 📷", "time": "18:11", "unread": 1, "online": False},
    {"name": "Dev Group", "last": "push в main сделан", "time": "17:55", "unread": 0, "online": False},
    {"name": "Сергей К.", "last": "👍", "time": "16:22", "unread": 0, "online": True},
    {"name": "Новости", "last": "Breaking: ...", "time": "15:00", "unread": 5, "online": False},
]

SAMPLE_MESSAGES = {
    "Алексей": [
        ("in", "Привет!", "21:50"),
        ("in", "Как дела?", "21:51"),
        ("out", "Привет! Всё хорошо, работаю над проектом 😄", "21:52"),
        ("in", "Круто! Что за проект?", "22:00"),
        ("out", "Telegram-клон на Python 😎", "22:05"),
        ("in", "Серьёзно? Это же целая работа", "22:10"),
        ("in", "Привет, как дела?", "22:14"),
    ],
    "Мама": [
        ("in", "Сынок, как ты?", "20:00"),
        ("out", "Всё хорошо мам!", "20:30"),
        ("in", "Позвони когда сможешь", "21:03"),
    ],
    "Рабочий чат": [
        ("in", "Всем привет!", "09:00"),
        ("in", "Завтра митинг в 10:00", "20:45"),
    ],
}


class TelegramClone:
    def __init__(self, root):
        self.root = root
        self.root.title("Telegram")
        self.root.geometry("1000x680")
        self.root.configure(bg=BG_DARK)
        self.root.minsize(700, 500)

        self.active_chat = None
        self.messages = {k: list(v) for k, v in SAMPLE_MESSAGES.items()}

        self._build_ui()
        self._select_chat(0)

    def _build_ui(self):
        self.root.columnconfigure(1, weight=1)
        self.root.rowconfigure(0, weight=1)

        # Left panel
        self.left = tk.Frame(self.root, bg=BG_PANEL, width=280)
        self.left.grid(row=0, column=0, sticky="nsew")
        self.left.grid_propagate(False)
        self.left.columnconfigure(0, weight=1)
        self.left.rowconfigure(1, weight=1)

        self._build_search()
        self._build_chat_list()

        # Right panel
        self.right = tk.Frame(self.root, bg=BG_CHAT)
        self.right.grid(row=0, column=1, sticky="nsew")
        self.right.columnconfigure(0, weight=1)
        self.right.rowconfigure(1, weight=1)

        self._build_chat_header()
        self._build_messages_area()
        self._build_input_area()

    def _build_search(self):
        top = tk.Frame(self.left, bg=BG_PANEL, pady=8, padx=10)
        top.grid(row=0, column=0, sticky="ew")
        top.columnconfigure(0, weight=1)

        search_frame = tk.Frame(top, bg=BG_INPUT, bd=0)
        search_frame.grid(row=0, column=0, sticky="ew", ipady=6, ipadx=6)
        search_frame.columnconfigure(1, weight=1)

        tk.Label(search_frame, text="🔍", bg=BG_INPUT, fg=TEXT_SECONDARY, font=FONT_SMALL).grid(row=0, column=0, padx=(8, 4))
        self.search_var = tk.StringVar()
        entry = tk.Entry(search_frame, textvariable=self.search_var, bg=BG_INPUT, fg=TEXT_PRIMARY,
                         insertbackground=TEXT_PRIMARY, font=FONT_MAIN, bd=0, relief="flat")
        entry.grid(row=0, column=1, sticky="ew", pady=2)
        entry.insert(0, "Поиск")
        entry.bind("<FocusIn>", lambda e: entry.delete(0, "end") if entry.get() == "Поиск" else None)
        entry.bind("<FocusOut>", lambda e: entry.insert(0, "Поиск") if not entry.get() else None)

    def _build_chat_list(self):
        container = tk.Frame(self.left, bg=BG_PANEL)
        container.grid(row=1, column=0, sticky="nsew")
        container.columnconfigure(0, weight=1)
        container.rowconfigure(0, weight=1)

        canvas = tk.Canvas(container, bg=BG_PANEL, bd=0, highlightthickness=0)
        scrollbar = tk.Scrollbar(container, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")

        self.chat_list_frame = tk.Frame(canvas, bg=BG_PANEL)
        self.chat_list_frame.columnconfigure(0, weight=1)
        canvas_win = canvas.create_window((0, 0), window=self.chat_list_frame, anchor="nw")

        def on_resize(e):
            canvas.itemconfig(canvas_win, width=e.width)
        canvas.bind("<Configure>", on_resize)
        self.chat_list_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(-1 * (e.delta // 120), "units"))

        self.chat_buttons = []
        for i, chat in enumerate(CHATS):
            self._add_chat_item(i, chat)

    def _add_chat_item(self, index, chat):
        frame = tk.Frame(self.chat_list_frame, bg=BG_PANEL, cursor="hand2")
        frame.grid(row=index, column=0, sticky="ew", pady=0)
        frame.columnconfigure(1, weight=1)

        # Avatar
        av_frame = tk.Frame(frame, bg=BG_PANEL)
        av_frame.grid(row=0, column=0, rowspan=2, padx=(10, 8), pady=8)

        color = random.choice(["#c03d2f", "#e8a838", "#2f7fc0", "#2fa86e", "#9c59b6", "#e74c3c"])
        av = tk.Canvas(av_frame, width=46, height=46, bg=BG_PANEL, highlightthickness=0)
        av.pack()
        av.create_oval(2, 2, 44, 44, fill=color, outline="")
        av.create_text(23, 23, text=chat["name"][0], fill="white", font=("Segoe UI", 16, "bold"))

        if chat["online"]:
            av.create_oval(32, 32, 44, 44, fill=BG_PANEL, outline="")
            av.create_oval(34, 34, 42, 42, fill=ONLINE, outline="")

        # Name + time
        top_row = tk.Frame(frame, bg=BG_PANEL)
        top_row.grid(row=0, column=1, sticky="ew", padx=(0, 10), pady=(8, 0))
        top_row.columnconfigure(0, weight=1)

        tk.Label(top_row, text=chat["name"], bg=BG_PANEL, fg=TEXT_PRIMARY, font=FONT_BOLD, anchor="w").grid(row=0, column=0, sticky="w")
        tk.Label(top_row, text=chat["time"], bg=BG_PANEL, fg=TEXT_TIME, font=FONT_SMALL).grid(row=0, column=1, sticky="e")

        # Last message + unread
        bot_row = tk.Frame(frame, bg=BG_PANEL)
        bot_row.grid(row=1, column=1, sticky="ew", padx=(0, 10), pady=(0, 8))
        bot_row.columnconfigure(0, weight=1)

        last_text = chat["last"][:38] + "…" if len(chat["last"]) > 38 else chat["last"]
        tk.Label(bot_row, text=last_text, bg=BG_PANEL, fg=TEXT_SECONDARY, font=FONT_SMALL, anchor="w").grid(row=0, column=0, sticky="w")

        if chat["unread"] > 0:
            badge = tk.Label(bot_row, text=str(chat["unread"]), bg=ACCENT, fg="white",
                             font=("Segoe UI", 8, "bold"), padx=5, pady=1)
            badge.grid(row=0, column=1)

        # Divider
        div = tk.Frame(frame, bg=DIVIDER, height=1)
        div.grid(row=2, column=0, columnspan=2, sticky="ew")

        # Click binding
        for w in [frame, av_frame, av, top_row, bot_row]:
            w.bind("<Button-1>", lambda e, idx=index: self._select_chat(idx))
        for child in frame.winfo_children():
            child.bind("<Button-1>", lambda e, idx=index: self._select_chat(idx))

        self.chat_buttons.append(frame)

    def _build_chat_header(self):
        self.header = tk.Frame(self.right, bg=BG_PANEL, height=56)
        self.header.grid(row=0, column=0, sticky="ew")
        self.header.grid_propagate(False)
        self.header.columnconfigure(1, weight=1)

        self.header_av = tk.Canvas(self.header, width=38, height=38, bg=BG_PANEL, highlightthickness=0)
        self.header_av.grid(row=0, column=0, padx=(14, 8), pady=9)

        info = tk.Frame(self.header, bg=BG_PANEL)
        info.grid(row=0, column=1, sticky="w")
        self.header_name = tk.Label(info, text="", bg=BG_PANEL, fg=TEXT_PRIMARY, font=FONT_TITLE, anchor="w")
        self.header_name.pack(anchor="w")
        self.header_status = tk.Label(info, text="", bg=BG_PANEL, fg=ONLINE, font=FONT_SMALL, anchor="w")
        self.header_status.pack(anchor="w")

        # Icons right side
        right_icons = tk.Frame(self.header, bg=BG_PANEL)
        right_icons.grid(row=0, column=2, padx=12)
        for icon in ["🔍", "📎", "⋮"]:
            tk.Label(right_icons, text=icon, bg=BG_PANEL, fg=TEXT_SECONDARY, font=("Segoe UI", 12)).pack(side="left", padx=6)

        # Divider
        tk.Frame(self.right, bg=DIVIDER, height=1).grid(row=0, column=0, sticky="sew")

    def _build_messages_area(self):
        self.msg_canvas = tk.Canvas(self.right, bg=BG_CHAT, bd=0, highlightthickness=0)
        scrollbar = tk.Scrollbar(self.right, orient="vertical", command=self.msg_canvas.yview)
        self.msg_canvas.configure(yscrollcommand=scrollbar.set)

        self.msg_canvas.grid(row=1, column=0, sticky="nsew")
        scrollbar.grid(row=1, column=1, sticky="ns")

        self.msg_frame = tk.Frame(self.msg_canvas, bg=BG_CHAT)
        self.msg_frame.columnconfigure(0, weight=1)
        self.msg_win = self.msg_canvas.create_window((0, 0), window=self.msg_frame, anchor="nw")

        self.msg_canvas.bind("<Configure>", self._on_canvas_resize)
        self.msg_frame.bind("<Configure>", lambda e: self.msg_canvas.configure(scrollregion=self.msg_canvas.bbox("all")))
        self.msg_canvas.bind_all("<MouseWheel>", lambda e: self.msg_canvas.yview_scroll(-1 * (e.delta // 120), "units"))

    def _on_canvas_resize(self, e):
        self.msg_canvas.itemconfig(self.msg_win, width=e.width)

    def _build_input_area(self):
        input_panel = tk.Frame(self.right, bg=BG_PANEL, pady=10)
        input_panel.grid(row=2, column=0, columnspan=2, sticky="ew")
        input_panel.columnconfigure(1, weight=1)

        tk.Label(input_panel, text="📎", bg=BG_PANEL, fg=TEXT_SECONDARY, font=("Segoe UI", 14)).grid(row=0, column=0, padx=(14, 6))

        input_box = tk.Frame(input_panel, bg=BG_INPUT)
        input_box.grid(row=0, column=1, sticky="ew", ipady=6, ipadx=10)
        input_box.columnconfigure(0, weight=1)

        self.input_var = tk.StringVar()
        self.input_entry = tk.Entry(input_box, textvariable=self.input_var, bg=BG_INPUT,
                                   fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY,
                                   font=FONT_MSG, bd=0, relief="flat")
        self.input_entry.grid(row=0, column=0, sticky="ew", padx=6, pady=4)
        self.input_entry.bind("<Return>", self._send_message)

        tk.Label(input_panel, text="🎤", bg=BG_PANEL, fg=TEXT_SECONDARY, font=("Segoe UI", 14)).grid(row=0, column=2, padx=6)

        send_btn = tk.Label(input_panel, text="➤", bg=ACCENT, fg="white",
                            font=("Segoe UI", 13), padx=10, pady=4, cursor="hand2")
        send_btn.grid(row=0, column=3, padx=(0, 14))
        send_btn.bind("<Button-1>", self._send_message)

    def _select_chat(self, index):
        # Reset all highlights
        for btn in self.chat_buttons:
            for w in btn.winfo_children():
                try:
                    w.configure(bg=BG_PANEL)
                except:
                    pass
            btn.configure(bg=BG_PANEL)

        # Highlight selected
        selected = self.chat_buttons[index]
        selected.configure(bg="#1c2c3e")
        for w in selected.winfo_children():
            try:
                w.configure(bg="#1c2c3e")
            except:
                pass

        chat = CHATS[index]
        self.active_chat = chat["name"]

        # Update header
        self.header_name.configure(text=chat["name"])
        self.header_status.configure(text="в сети" if chat["online"] else "был(а) давно",
                                     fg=ONLINE if chat["online"] else TEXT_SECONDARY)

        color = random.choice(["#c03d2f", "#e8a838", "#2f7fc0", "#2fa86e", "#9c59b6"])
        self.header_av.delete("all")
        self.header_av.create_oval(2, 2, 36, 36, fill=color, outline="")
        self.header_av.create_text(19, 19, text=chat["name"][0], fill="white", font=("Segoe UI", 13, "bold"))

        self._render_messages()

    def _render_messages(self):
        for w in self.msg_frame.winfo_children():
            w.destroy()

        msgs = self.messages.get(self.active_chat, [])

        # Date divider
        date_frame = tk.Frame(self.msg_frame, bg=BG_CHAT)
        date_frame.grid(row=0, column=0, pady=12, padx=20, sticky="ew")
        date_frame.columnconfigure(0, weight=1)
        date_label = tk.Label(date_frame, text="Сегодня", bg="#1e2d3d", fg=TEXT_SECONDARY,
                              font=FONT_SMALL, padx=10, pady=3)
        date_label.grid(row=0, column=0)

        for i, (direction, text, t) in enumerate(msgs):
            self._add_message_bubble(i + 1, direction, text, t)

        self.root.after(50, lambda: self.msg_canvas.yview_moveto(1.0))

    def _add_message_bubble(self, row, direction, text, timestamp):
        is_out = direction == "out"
        anchor = "e" if is_out else "w"
        bg = BG_MSG_OUT if is_out else BG_MSG_IN

        outer = tk.Frame(self.msg_frame, bg=BG_CHAT)
        outer.grid(row=row, column=0, sticky="ew", padx=16, pady=2)
        outer.columnconfigure(0, weight=1)

        bubble = tk.Frame(outer, bg=bg, padx=10, pady=6)
        bubble.grid(row=0, column=0, sticky=anchor)

        tk.Label(bubble, text=text, bg=bg, fg=TEXT_PRIMARY, font=FONT_MSG,
                 wraplength=380, justify="left", anchor="w").grid(row=0, column=0, sticky="w")

        time_label = tk.Label(bubble, text=timestamp + ("  ✓✓" if is_out else ""),
                              bg=bg, fg=TEXT_TIME, font=FONT_SMALL)
        time_label.grid(row=1, column=0, sticky="e")

    def _send_message(self, event=None):
        text = self.input_var.get().strip()
        if not text or not self.active_chat:
            return

        now = time.strftime("%H:%M")
        if self.active_chat not in self.messages:
            self.messages[self.active_chat] = []
        self.messages[self.active_chat].append(("out", text, now))
        self.input_var.set("")

        self._render_messages()

        # Auto-reply after 1s
        self.root.after(1000, lambda: self._auto_reply(text))

    def _auto_reply(self, original):
        if not self.active_chat:
            return
        replies = [
            "Понял 👍",
            "Окей!",
            "Хорошо, спасибо!",
            "Ага, увидел",
            "Ок, понял тебя",
            "😄",
            "Отлично!",
        ]
        reply = random.choice(replies)
        now = time.strftime("%H:%M")
        self.messages[self.active_chat].append(("in", reply, now))
        self._render_messages()


if __name__ == "__main__":
    root = tk.Tk()
    app = TelegramClone(root)
    root.mainloop()
