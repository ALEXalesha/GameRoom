import os
import shutil
import subprocess
import sys
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from pathlib import Path
from datetime import datetime


ROOT = Path.home()

ICONS = {
    "folder": "📁",
    "folder_open": "📂",
    "file": "📄",
    "image": "🖼️",
    "video": "🎬",
    "audio": "🎵",
    "archive": "📦",
    "code": "💻",
    "pdf": "📕",
    "text": "📝",
}

EXT_MAP = {
    **{e: "image" for e in [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".ico"]},
    **{e: "video" for e in [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv"]},
    **{e: "audio" for e in [".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a"]},
    **{e: "archive" for e in [".zip", ".tar", ".gz", ".rar", ".7z", ".bz2"]},
    **{e: "code" for e in [".py", ".js", ".ts", ".html", ".css", ".c", ".cpp", ".java", ".rs", ".go", ".sh"]},
    **{e: "pdf" for e in [".pdf"]},
    **{e: "text" for e in [".txt", ".md", ".rst", ".log", ".csv", ".json", ".xml", ".yaml", ".yml"]},
}


def get_icon(path: Path) -> str:
    if path.is_dir():
        return ICONS["folder"]
    return ICONS.get(EXT_MAP.get(path.suffix.lower(), "file"), ICONS["file"])


def fmt_size(size: int) -> str:
    for unit in ["Б", "КБ", "МБ", "ГБ"]:
        if size < 1024:
            return f"{size:.0f} {unit}"
        size /= 1024
    return f"{size:.1f} ТБ"


def fmt_date(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%d.%m.%Y %H:%M")


class Explorer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Проводник")
        self.geometry("1100x680")
        self.minsize(700, 450)
        self.configure(bg="#1a1a2e")

        self.current_path = ROOT
        self.history = [ROOT]
        self.history_pos = 0
        self.clipboard = None
        self.clipboard_op = None  # 'copy' or 'cut'

        self._setup_style()
        self._build_ui()
        self._navigate(ROOT)

    def _setup_style(self):
        style = ttk.Style(self)
        style.theme_use("clam")

        bg = "#1a1a2e"
        panel = "#16213e"
        accent = "#e94560"
        fg = "#e0e0f0"
        sel = "#0f3460"
        head = "#0a0a1a"

        style.configure(".", background=bg, foreground=fg, font=("Consolas", 10))
        style.configure("TFrame", background=bg)
        style.configure("Panel.TFrame", background=panel)
        style.configure("TLabel", background=bg, foreground=fg)
        style.configure("Status.TLabel", background=head, foreground="#888aaa", font=("Consolas", 9))
        style.configure("Path.TLabel", background=panel, foreground=accent, font=("Consolas", 10, "bold"))
        style.configure("Heading.TLabel", background=bg, foreground=accent, font=("Consolas", 11, "bold"))

        style.configure("TButton", background=sel, foreground=fg, relief="flat",
                        padding=(8, 4), font=("Consolas", 10))
        style.map("TButton",
                  background=[("active", accent)],
                  foreground=[("active", "#fff")])

        style.configure("Nav.TButton", background=panel, foreground=fg, relief="flat",
                        padding=(6, 4), font=("Consolas", 11, "bold"))
        style.map("Nav.TButton",
                  background=[("active", sel)],
                  foreground=[("active", accent)])

        style.configure("Treeview", background=panel, foreground=fg,
                        fieldbackground=panel, rowheight=26,
                        font=("Consolas", 10), borderwidth=0)
        style.map("Treeview",
                  background=[("selected", sel)],
                  foreground=[("selected", accent)])
        style.configure("Treeview.Heading", background=head, foreground=accent,
                        font=("Consolas", 10, "bold"), relief="flat")
        style.map("Treeview.Heading", background=[("active", sel)])

        style.configure("Vertical.TScrollbar", background=panel, troughcolor=head,
                        arrowcolor=fg, borderwidth=0, width=10)
        style.configure("Horizontal.TScrollbar", background=panel, troughcolor=head,
                        arrowcolor=fg, borderwidth=0, width=10)

    def _build_ui(self):
        # top bar
        top = ttk.Frame(self, style="Panel.TFrame", padding=(8, 6))
        top.pack(fill="x")

        for text, cmd in [("◀", self._back), ("▶", self._forward), ("▲", self._up), ("⟳", self._refresh)]:
            ttk.Button(top, text=text, style="Nav.TButton", command=cmd, width=3).pack(side="left", padx=1)

        ttk.Label(top, text="  Путь: ", style="Path.TLabel").pack(side="left")
        self.path_var = tk.StringVar()
        path_entry = tk.Entry(top, textvariable=self.path_var, bg="#0f3460", fg="#e94560",
                              insertbackground="#e94560", relief="flat",
                              font=("Consolas", 10), bd=0)
        path_entry.pack(side="left", fill="x", expand=True, padx=(0, 8), ipady=3)
        path_entry.bind("<Return>", self._go_path)

        ttk.Button(top, text="→", style="Nav.TButton", command=self._go_path, width=3).pack(side="left")

        # search
        ttk.Label(top, text="  🔍 ", style="Path.TLabel").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self._filter())
        search = tk.Entry(top, textvariable=self.search_var, bg="#0f3460", fg="#e0e0f0",
                          insertbackground="#e0e0f0", relief="flat",
                          font=("Consolas", 10), bd=0, width=18)
        search.pack(side="left", padx=(0, 6), ipady=3)

        # main area: sidebar + file list
        main = ttk.Frame(self)
        main.pack(fill="both", expand=True)

        # sidebar (tree)
        sidebar = ttk.Frame(main, style="Panel.TFrame", width=220)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)

        ttk.Label(sidebar, text=" Дерево", style="Heading.TLabel", padding=(6, 6)).pack(fill="x")

        tree_frame = ttk.Frame(sidebar, style="Panel.TFrame")
        tree_frame.pack(fill="both", expand=True)
        self.dir_tree = ttk.Treeview(tree_frame, show="tree", selectmode="browse")
        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=self.dir_tree.yview)
        self.dir_tree.configure(yscrollcommand=vsb.set)
        vsb.pack(side="right", fill="y")
        self.dir_tree.pack(fill="both", expand=True)
        self.dir_tree.bind("<<TreeviewOpen>>", self._on_tree_open)
        self.dir_tree.bind("<<TreeviewSelect>>", self._on_tree_select)

        self._populate_sidebar()

        # separator
        sep = tk.Frame(main, bg="#e94560", width=2)
        sep.pack(side="left", fill="y")

        # file list
        right = ttk.Frame(main)
        right.pack(side="left", fill="both", expand=True)

        cols = ("icon", "name", "size", "type", "modified")
        self.file_list = ttk.Treeview(right, columns=cols, show="headings", selectmode="extended")

        self.file_list.heading("icon", text="")
        self.file_list.heading("name", text="Имя")
        self.file_list.heading("size", text="Размер")
        self.file_list.heading("type", text="Тип")
        self.file_list.heading("modified", text="Изменён")

        self.file_list.column("icon", width=32, minwidth=32, stretch=False, anchor="center")
        self.file_list.column("name", width=320, minwidth=120)
        self.file_list.column("size", width=90, minwidth=70, anchor="e")
        self.file_list.column("type", width=110, minwidth=80)
        self.file_list.column("modified", width=140, minwidth=120)

        vsb2 = ttk.Scrollbar(right, orient="vertical", command=self.file_list.yview)
        hsb2 = ttk.Scrollbar(right, orient="horizontal", command=self.file_list.xview)
        self.file_list.configure(yscrollcommand=vsb2.set, xscrollcommand=hsb2.set)

        hsb2.pack(side="bottom", fill="x")
        vsb2.pack(side="right", fill="y")
        self.file_list.pack(fill="both", expand=True)

        self.file_list.bind("<Double-1>", self._on_open)
        self.file_list.bind("<Return>", self._on_open)
        self.file_list.bind("<BackSpace>", lambda _: self._up())
        self.file_list.bind("<Button-3>", self._context_menu)
        self.file_list.bind("<Delete>", lambda _: self._delete())

        # keyboard shortcuts
        self.bind("<Control-c>", lambda _: self._copy())
        self.bind("<Control-x>", lambda _: self._cut())
        self.bind("<Control-v>", lambda _: self._paste())
        self.bind("<F2>", lambda _: self._rename())
        self.bind("<F5>", lambda _: self._refresh())

        # status bar
        status = ttk.Frame(self, style="Panel.TFrame")
        status.pack(fill="x", side="bottom")
        tk.Frame(status, bg="#e94560", height=1).pack(fill="x")
        self.status_var = tk.StringVar(value="Готов")
        ttk.Label(status, textvariable=self.status_var, style="Status.TLabel", padding=(8, 3)).pack(side="left")
        self.sel_var = tk.StringVar()
        ttk.Label(status, textvariable=self.sel_var, style="Status.TLabel", padding=(8, 3)).pack(side="right")

    # ---- sidebar tree ----

    def _populate_sidebar(self):
        self.dir_tree.delete(*self.dir_tree.get_children())
        # quick access roots
        home = Path.home()
        for name, path in [("🏠 Домашняя", home), ("💻 Корень", Path("/"))]:
            iid = self.dir_tree.insert("", "end", text=name, values=[str(path)], open=False)
            self.dir_tree.insert(iid, "end", text="...")  # dummy

    def _on_tree_open(self, event):
        iid = self.dir_tree.focus()
        path = Path(self.dir_tree.item(iid, "values")[0])
        children = self.dir_tree.get_children(iid)
        # remove dummy
        if len(children) == 1 and self.dir_tree.item(children[0], "text") == "...":
            self.dir_tree.delete(children[0])
            try:
                for p in sorted(path.iterdir()):
                    if p.is_dir() and not p.name.startswith("."):
                        ciid = self.dir_tree.insert(iid, "end",
                                                    text=f"{ICONS['folder']} {p.name}",
                                                    values=[str(p)])
                        self.dir_tree.insert(ciid, "end", text="...")
            except PermissionError:
                pass

    def _on_tree_select(self, event):
        iid = self.dir_tree.focus()
        if not iid:
            return
        vals = self.dir_tree.item(iid, "values")
        if vals:
            self._navigate(Path(vals[0]))

    # ---- navigation ----

    def _navigate(self, path: Path):
        if not path.is_dir():
            return
        self.current_path = path
        self.path_var.set(str(path))
        self._load_files()

    def _load_files(self, filter_text=""):
        self.file_list.delete(*self.file_list.get_children())
        try:
            entries = sorted(self.current_path.iterdir(),
                             key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            self.status_var.set("⛔ Нет доступа")
            return

        count = 0
        total_size = 0
        ft = filter_text.lower()

        for p in entries:
            if ft and ft not in p.name.lower():
                continue
            try:
                stat = p.stat()
                size = stat.st_size if p.is_file() else ""
                mod = fmt_date(stat.st_mtime)
            except (PermissionError, OSError):
                size, mod = "", ""

            icon = get_icon(p)
            ftype = "Папка" if p.is_dir() else (EXT_MAP.get(p.suffix.lower(), "файл").capitalize() if p.suffix else "Файл")
            size_str = fmt_size(size) if isinstance(size, int) else ""
            if isinstance(size, int):
                total_size += size

            tag = "dir" if p.is_dir() else "file"
            self.file_list.insert("", "end",
                                  iid=str(p),
                                  values=(icon, p.name, size_str, ftype, mod),
                                  tags=(tag,))
            count += 1

        self.file_list.tag_configure("dir", foreground="#7eb8f7")
        self.file_list.tag_configure("file", foreground="#e0e0f0")

        self.status_var.set(f"📂 {self.current_path}  —  {count} элементов")
        self.sel_var.set("")

        self.file_list.bind("<<TreeviewSelect>>", self._on_select)

    def _on_select(self, event):
        sel = self.file_list.selection()
        if not sel:
            self.sel_var.set("")
            return
        if len(sel) == 1:
            p = Path(sel[0])
            try:
                s = p.stat().st_size if p.is_file() else ""
                self.sel_var.set(f"  {p.name}  {fmt_size(s) if s != '' else ''}")
            except OSError:
                self.sel_var.set(f"  {p.name}")
        else:
            self.sel_var.set(f"  Выбрано: {len(sel)}")

    def _filter(self):
        self._load_files(self.search_var.get())

    def _go_path(self, event=None):
        p = Path(self.path_var.get())
        if p.is_dir():
            self._push_history(p)
            self._navigate(p)
        else:
            messagebox.showerror("Ошибка", f"Путь не найден:\n{p}")

    def _push_history(self, path: Path):
        self.history = self.history[:self.history_pos + 1]
        self.history.append(path)
        self.history_pos = len(self.history) - 1

    def _back(self):
        if self.history_pos > 0:
            self.history_pos -= 1
            self._navigate(self.history[self.history_pos])

    def _forward(self):
        if self.history_pos < len(self.history) - 1:
            self.history_pos += 1
            self._navigate(self.history[self.history_pos])

    def _up(self):
        parent = self.current_path.parent
        if parent != self.current_path:
            self._push_history(parent)
            self._navigate(parent)

    def _refresh(self):
        self._load_files(self.search_var.get())

    # ---- file actions ----

    def _on_open(self, event=None):
        sel = self.file_list.selection()
        if not sel:
            return
        p = Path(sel[0])
        if p.is_dir():
            self._push_history(p)
            self._navigate(p)
        else:
            self._open_file(p)

    def _open_file(self, p: Path):
        try:
            if sys.platform == "win32":
                os.startfile(p)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(p)])
            else:
                subprocess.Popen(["xdg-open", str(p)])
        except Exception as e:
            messagebox.showerror("Ошибка", str(e))

    def _selected_paths(self):
        return [Path(s) for s in self.file_list.selection()]

    def _delete(self):
        paths = self._selected_paths()
        if not paths:
            return
        names = "\n".join(p.name for p in paths[:5])
        if len(paths) > 5:
            names += f"\n...и ещё {len(paths) - 5}"
        if not messagebox.askyesno("Удалить", f"Удалить?\n\n{names}"):
            return
        for p in paths:
            try:
                if p.is_dir():
                    shutil.rmtree(p)
                else:
                    p.unlink()
            except Exception as e:
                messagebox.showerror("Ошибка", str(e))
        self._refresh()

    def _rename(self):
        paths = self._selected_paths()
        if not paths:
            return
        p = paths[0]
        new_name = simpledialog.askstring("Переименовать", "Новое имя:", initialvalue=p.name)
        if new_name and new_name != p.name:
            try:
                p.rename(p.parent / new_name)
            except Exception as e:
                messagebox.showerror("Ошибка", str(e))
            self._refresh()

    def _new_folder(self):
        name = simpledialog.askstring("Новая папка", "Имя папки:", initialvalue="Новая папка")
        if name:
            try:
                (self.current_path / name).mkdir(exist_ok=True)
            except Exception as e:
                messagebox.showerror("Ошибка", str(e))
            self._refresh()

    def _new_file(self):
        name = simpledialog.askstring("Новый файл", "Имя файла:", initialvalue="новый_файл.txt")
        if name:
            try:
                (self.current_path / name).touch()
            except Exception as e:
                messagebox.showerror("Ошибка", str(e))
            self._refresh()

    def _copy(self):
        paths = self._selected_paths()
        if paths:
            self.clipboard = paths
            self.clipboard_op = "copy"
            self.status_var.set(f"📋 Скопировано: {len(paths)} элементов")

    def _cut(self):
        paths = self._selected_paths()
        if paths:
            self.clipboard = paths
            self.clipboard_op = "cut"
            self.status_var.set(f"✂️ Вырезано: {len(paths)} элементов")

    def _paste(self):
        if not self.clipboard:
            return
        for src in self.clipboard:
            dst = self.current_path / src.name
            try:
                if self.clipboard_op == "copy":
                    if src.is_dir():
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
                else:
                    shutil.move(str(src), dst)
            except Exception as e:
                messagebox.showerror("Ошибка", str(e))
        if self.clipboard_op == "cut":
            self.clipboard = None
            self.clipboard_op = None
        self._refresh()

    def _properties(self):
        paths = self._selected_paths()
        if not paths:
            return
        p = paths[0]
        try:
            stat = p.stat()
            size = fmt_size(stat.st_size) if p.is_file() else "—"
            info = (
                f"Имя: {p.name}\n"
                f"Путь: {p.parent}\n"
                f"Тип: {'Папка' if p.is_dir() else p.suffix or 'файл'}\n"
                f"Размер: {size}\n"
                f"Создан: {fmt_date(stat.st_ctime)}\n"
                f"Изменён: {fmt_date(stat.st_mtime)}"
            )
        except Exception as e:
            info = str(e)
        messagebox.showinfo(f"Свойства — {p.name}", info)

    # ---- context menu ----

    def _context_menu(self, event):
        sel = self._selected_paths()
        menu = tk.Menu(self, tearoff=0, bg="#16213e", fg="#e0e0f0",
                       activebackground="#0f3460", activeforeground="#e94560",
                       font=("Consolas", 10), bd=0, relief="flat")

        if sel:
            menu.add_command(label="📂 Открыть", command=self._on_open)
            menu.add_separator()
            menu.add_command(label="📋 Копировать  Ctrl+C", command=self._copy)
            menu.add_command(label="✂️ Вырезать   Ctrl+X", command=self._cut)
        if self.clipboard:
            menu.add_command(label="📌 Вставить   Ctrl+V", command=self._paste)
        if sel:
            menu.add_separator()
            menu.add_command(label="✏️ Переименовать  F2", command=self._rename)
            menu.add_command(label="🗑️ Удалить  Del", command=self._delete)
            menu.add_separator()
            menu.add_command(label="ℹ️ Свойства", command=self._properties)

        menu.add_separator()
        menu.add_command(label="📁 Новая папка", command=self._new_folder)
        menu.add_command(label="📄 Новый файл", command=self._new_file)
        menu.add_separator()
        menu.add_command(label="⟳ Обновить  F5", command=self._refresh)

        menu.tk_popup(event.x_root, event.y_root)


if __name__ == "__main__":
    app = Explorer()
    app.mainloop()
