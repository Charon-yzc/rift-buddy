using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

// Read only public Windows window geometry. No client configuration, process
// memory, command lines, input injection or SetWindowPos/ShowWindow calls.
internal static class WindowObserver {
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    private delegate bool EnumProc(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
    private sealed class WindowInfo {
        public int x, y, width, height;
        public bool minimized, foreground;
    }
    private static volatile bool running = true;
    private static HashSet<uint> Pids(string name) {
        var result = new HashSet<uint>();
        foreach (var process in Process.GetProcessesByName(name)) {
            using (process) { try { result.Add((uint)process.Id); } catch { } }
        }
        return result;
    }
    private static WindowInfo Find(HashSet<uint> pids, IntPtr active) {
        WindowInfo best = null;
        EnumWindows((window, unused) => {
            uint pid; GetWindowThreadProcessId(window, out pid);
            if (!pids.Contains(pid) || !IsWindowVisible(window)) return true;
            Rect r;
            if (DwmGetWindowAttribute(window, 9, out r, Marshal.SizeOf(typeof(Rect))) != 0 && !GetWindowRect(window, out r)) return true;
            var current = new WindowInfo { x = r.Left, y = r.Top, width = r.Right - r.Left, height = r.Bottom - r.Top, minimized = IsIconic(window), foreground = window == active };
            if (current.width < 200 || current.height < 100) return true;
            if (best == null || current.foreground || !best.foreground && (long)current.width * current.height > (long)best.width * best.height) best = current;
            return true;
        }, IntPtr.Zero);
        return best;
    }
    private static int Main(string[] args) {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { try { SetProcessDPIAware(); } catch { } }
        bool once = args.Length == 1 && args[0] == "--once";
        if (args.Length > 0 && !once) return 2;
        var json = new JavaScriptSerializer();
        if (!once) ThreadPool.QueueUserWorkItem(unused => { try { Console.In.ReadToEnd(); } catch { } running = false; });
        do {
            try {
                var active = GetForegroundWindow();
                var client = Find(Pids("LeagueClientUx"), active);
                var game = Find(Pids("League of Legends"), active);
                Console.WriteLine(json.Serialize(new { client, game }));
                Console.Out.Flush();
            } catch { return 1; }
            if (once) break;
            Thread.Sleep(500);
        } while (running);
        return 0;
    }
}
